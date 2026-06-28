'use strict';

const crypto = require('crypto');
const db = require('../config/db');
const gateway = require('./paymentGatewayService');
const appointmentConfirmationSms = require('./appointmentConfirmationSms');
const insurancePolicy = require('./appointmentInsurancePolicy');
const { assertSchema } = require('../database/schemaGuard');

class CheckoutError extends Error {
  constructor(message, code = 'CHECKOUT_ERROR', status = 400) {
    super(message);
    this.name = 'CheckoutError';
    this.code = code;
    this.status = status;
    this.expose = true;
  }
}

const HOLD_MINUTES = Math.max(3, Math.min(30, Number.parseInt(process.env.PAYMENT_HOLD_MINUTES || '10', 10) || 10));
const VALID_TYPES = new Set(['regular', 'follow_up', 'followup', 'consultation', 'emergency', 'surgery']);

function enumValues(columnType) {
  const raw = String(columnType || '');
  const match = raw.match(/^enum\((.*)\)$/i);
  if (!match) return [];
  const values = [];
  const pattern = /'((?:''|\\'|[^'])*)'/g;
  let item;
  while ((item = pattern.exec(match[1]))) {
    values.push(item[1].replace(/''/g, "'").replace(/\\'/g, "'"));
  }
  return values;
}

function normalizeAppointmentType(value) {
  const normalized = String(value || 'regular').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized === 'followup' ? 'follow_up' : normalized;
}

async function resolveAppointmentType(connection, requestedType) {
  const requested = normalizeAppointmentType(requestedType);
  const [rows] = await connection.query(
    `SELECT DATA_TYPE, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'type'
     LIMIT 1`
  );
  const column = rows[0];
  if (!column || String(column.DATA_TYPE || column.data_type || '').toLowerCase() !== 'enum') return requested;

  const allowed = enumValues(column.COLUMN_TYPE || column.column_type);
  if (!allowed.length || allowed.includes(requested)) return requested;

  const compatibility = {
    regular: ['regular', 'normal', 'visit', 'in_person'],
    follow_up: ['follow_up', 'followup', 'follow-up', 'regular', 'normal'],
    consultation: ['consultation', 'regular', 'normal', 'visit'],
    emergency: ['emergency', 'urgent', 'regular', 'normal'],
    surgery: ['surgery', 'regular', 'normal']
  };
  const candidates = compatibility[requested] || [requested, 'regular'];
  return candidates.find(value => allowed.includes(value)) || allowed[0];
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function rawCheckoutToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function rawCallbackToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function trackingCode() {
  return `NV-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function cleanText(value, max = 1000) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

async function tableColumns(connection, tableName) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
  return new Set(rows.map(row => row.Field));
}

async function insertDynamic(connection, tableName, data) {
  const available = await tableColumns(connection, tableName);
  const entries = Object.entries(data).filter(([key, value]) => available.has(key) && value !== undefined);
  if (!entries.length) throw new CheckoutError(`ستون قابل ثبت برای ${tableName} پیدا نشد`, 'SCHEMA_MISMATCH', 503);
  const sql = `INSERT INTO \`${tableName}\` SET ` + entries.map(([key]) => `\`${key}\`=?`).join(', ');
  const [result] = await connection.query(sql, entries.map(([, value]) => value));
  return result;
}

// MySQL DATETIME values are stored in UTC for payment holds. Because the pool
// returns date strings, parsing them without an explicit timezone would make
// Node/browser interpret them as local time and could expire a fresh checkout
// immediately on servers running in Asia/Tehran.
function parseDatabaseUtc(value) {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();
  const raw = String(value).trim();
  if (!raw) return NaN;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
    ? raw
    : `${raw.replace(' ', 'T')}Z`;
  return new Date(normalized).getTime();
}

function databaseUtcIso(value) {
  const timestamp = parseDatabaseUtc(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function requestMeta(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.ip || req.socket?.remoteAddress || '';
  const ua = String(req.headers?.['user-agent'] || '').slice(0, 1000);
  return {
    ip_hash: ip ? sha256(ip) : null,
    user_agent_hash: ua ? sha256(ua) : null,
    request_id: String(req.headers?.['x-request-id'] || req.id || '').slice(0, 191) || null
  };
}

function safeJson(value) {
  const sensitive = /card|pan|cvv|password|pin|token|secret/i;
  const walk = input => {
    if (Array.isArray(input)) return input.map(walk);
    if (!input || typeof input !== 'object') return input;
    const output = {};
    for (const [key, item] of Object.entries(input)) output[key] = sensitive.test(key) ? '[حذف‌شده]' : walk(item);
    return output;
  };
  try { return JSON.stringify(walk(value ?? {})); } catch (_) { return JSON.stringify({ note: 'داده قابل ثبت نبود' }); }
}

async function addEvent(connection, reservation, eventType, options = {}) {
  await connection.query(
    `INSERT INTO appointment_payment_events
       (reservation_id, payment_id, appointment_id, event_type, actor_type, actor_user_id,
        provider, provider_authority, provider_reference, request_id, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
    [
      reservation.id,
      options.payment_id || reservation.payment_id || null,
      options.appointment_id || reservation.appointment_id || null,
      eventType,
      options.actor_type || 'system',
      options.actor_user_id || null,
      options.provider || reservation.provider || null,
      options.authority || reservation.provider_authority || null,
      options.reference || reservation.provider_reference || null,
      options.request_id || null,
      safeJson(options.payload || {})
    ]
  );
}

async function expireReservationIfNeeded(connection, reservation, options = {}) {
  if (!reservation || reservation.status !== 'pending') return reservation;
  if (parseDatabaseUtc(reservation.expires_at) > Date.now()) return reservation;
  await connection.query(
    `UPDATE appointment_payment_reservations
     SET status='expired', last_error_code='PAYMENT_HOLD_EXPIRED',
         last_error_message='مهلت پرداخت پایان یافت و ظرفیت آزاد شد', updated_at=NOW()
     WHERE id=? AND status='pending'`,
    [reservation.id]
  );
  reservation.status = 'expired';
  await addEvent(connection, reservation, 'checkout_expired', {
    actor_type: 'system', request_id: options.request_id,
    payload: { message: 'مهلت پرداخت پایان یافت و ظرفیت آزاد شد' }
  });
  return reservation;
}

async function selectSlotForUpdate(connection, slotId) {
  const [rows] = await connection.query(
    `SELECT aps.id, aps.doctor_schedule_id, aps.doctor_id, aps.medical_center_id, aps.service_id,
            aps.slot_date, aps.start_time, aps.end_time, aps.capacity, aps.status,
            CASE WHEN COALESCE(s.is_free,0)=1 THEN 0 ELSE COALESCE(NULLIF(ds.custom_fee,0), NULLIF(s.default_fee,0), NULLIF(d.consultation_fee,0), 0) END AS appointment_fee,
            CASE
              WHEN COALESCE(s.is_free,0)=1 THEN 'free'
              WHEN COALESCE(ds.custom_fee,0) > 0 THEN 'schedule'
              WHEN COALESCE(s.default_fee,0) > 0 THEN 'service'
              WHEN COALESCE(d.consultation_fee,0) > 0 THEN 'doctor'
              ELSE 'free'
            END AS fee_source,
            s.name AS service_name, s.is_active AS service_active, COALESCE(s.is_free,0) AS service_is_free,
            s.supplementary_insurance_enabled, s.supplementary_insurance_payment_mode,
            s.supplementary_insurance_amount, s.supplementary_insurance_percent,
            s.supplementary_insurance_requires_review, s.supplementary_insurance_attachment_required,
            s.supplementary_insurance_notice,
            mc.name AS medical_center_name, mc.is_active AS center_active,
            du.full_name AS doctor_name, d.is_available AS doctor_active,
            ds.is_active AS schedule_active
     FROM appointment_slots aps
     JOIN doctors d ON d.id=aps.doctor_id
     JOIN users du ON du.id=d.user_id
     JOIN medical_centers mc ON mc.id=aps.medical_center_id
     JOIN services s ON s.id=aps.service_id
     LEFT JOIN doctor_schedules ds ON ds.id=aps.doctor_schedule_id
     WHERE aps.id=?
     LIMIT 1 FOR UPDATE`,
    [slotId]
  );
  return rows[0] || null;
}

function validateSlot(slot) {
  if (!slot) throw new CheckoutError('نوبت انتخاب‌شده یافت نشد', 'SLOT_NOT_FOUND', 404);
  if (slot.status !== 'available' || !Number(slot.doctor_active) || !Number(slot.center_active) || !Number(slot.service_active) || !Number(slot.schedule_active)) {
    throw new CheckoutError('این نوبت در حال حاضر قابل رزرو نیست', 'SLOT_NOT_BOOKABLE', 409);
  }
  const start = new Date(`${String(slot.slot_date).slice(0, 10)}T${String(slot.start_time).slice(0, 8)}`);
  if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) {
    throw new CheckoutError('زمان این نوبت گذشته است', 'SLOT_IN_PAST', 409);
  }
}

async function capacityState(connection, slotId, excludeReservationId = null) {
  const [appointments] = await connection.query(
    `SELECT COUNT(*) AS count FROM appointments
     WHERE appointment_slot_id=? AND status NOT IN ('cancelled','no_show')`,
    [slotId]
  );
  const params = [slotId];
  let exclusion = '';
  if (excludeReservationId) { exclusion = ' AND id<>?'; params.push(excludeReservationId); }
  const [holds] = await connection.query(
    `SELECT COUNT(*) AS count FROM appointment_payment_reservations
     WHERE appointment_slot_id=? AND status='pending' AND expires_at>UTC_TIMESTAMP()${exclusion}`,
    params
  );
  return {
    booked: Number(appointments[0]?.count || 0),
    held: Number(holds[0]?.count || 0)
  };
}

async function syncSlotCapacity(connection, slot) {
  const state = await capacityState(connection, slot.id);
  const capacity = Math.max(1, Number(slot.capacity || 1));
  const remaining = Math.max(0, capacity - state.booked);
  await connection.query(
    `UPDATE appointment_slots
     SET booked_count=?, remaining_capacity=?, status=CASE WHEN ?<=0 THEN 'full' ELSE 'available' END
     WHERE id=?`,
    [state.booked, remaining, remaining, slot.id]
  );
}

async function queueConfirmationSms(pool, appointmentId, options = {}) {
  try {
    return await appointmentConfirmationSms.sendAppointmentConfirmationSms(pool, appointmentId, options);
  } catch (error) {
    console.warn('Appointment confirmation SMS warning:', error.message);
    return { success: false, skipped: true, error: error.message };
  }
}

function appendSmsOutcome(message, sms) {
  const base = String(message || '').trim();
  if (sms?.status === 'sent') return `${base} پیامک نیز برای بیمار ارسال شد.`;
  if (sms?.disabled) return `${base} ارسال پیامک طبق تنظیمات سامانه غیرفعال است.`;
  if (['queued', 'pending', 'retry', 'processing', 'duplicate'].includes(String(sms?.status || ''))) {
    return `${base} پیامک تأیید در صف ارسال قرار دارد.`;
  }
  if (sms && sms.success === false) {
    return `${base} نوبت قطعی است، اما ارسال پیامک فعلاً انجام نشد و برای تلاش مجدد ثبت شد.`;
  }
  return base;
}

async function nextQueueNumberForSlot(connection, slot) {
  const capacity = Math.max(1, Number(slot.capacity || 1));
  const [rows] = await connection.query(
    `SELECT appointment_queue_number
     FROM appointments
     WHERE appointment_slot_id=?
       AND appointment_queue_number IS NOT NULL
       AND status NOT IN ('cancelled','no_show')
     ORDER BY appointment_queue_number ASC
     FOR UPDATE`,
    [slot.id]
  );
  const used = new Set(rows.map(row => Number(row.appointment_queue_number)).filter(value => Number.isFinite(value) && value > 0));
  for (let value = 1; value <= capacity; value += 1) if (!used.has(value)) return value;
  return used.size + 1;
}

async function insertAppointment(connection, { patientId, slot, type, reason, amount, paymentStatus, insuranceResolution = null }) {
  const compatibleType = await resolveAppointmentType(connection, type);
  const queueNumber = await nextQueueNumberForSlot(connection, slot);
  const code = trackingCode();
  const payload = {
    patient_id: patientId,
    appointment_slot_id: slot.id,
    appointment_queue_number: queueNumber,
    doctor_id: slot.doctor_id,
    medical_center_id: slot.medical_center_id,
    service_id: slot.service_id,
    appointment_date: String(slot.slot_date).slice(0, 10),
    appointment_time: String(slot.start_time).slice(0, 8),
    type: compatibleType,
    reason,
    amount: Number(amount || 0),
    status: 'confirmed',
    payment_status: paymentStatus,
    tracking_code: code,
    confirmed_at: new Date(),
    ...(insuranceResolution ? insurancePolicy.appointmentInsuranceFields(insuranceResolution) : {})
  };
  const result = await insertDynamic(connection, 'appointments', payload);
  return { id: Number(result.insertId), queue_number: queueNumber, tracking_code: code };
}

async function createCheckout({ patientId, actorUserId, actorType = 'patient', paymentContext = 'patient', appointmentSlotId, type, reason, insurance = null, expectedAmount = null, req }) {
  const slotId = Number.parseInt(appointmentSlotId, 10);
  if (!Number.isInteger(slotId) || slotId <= 0) throw new CheckoutError('نوبت انتخاب‌شده معتبر نیست', 'INVALID_SLOT', 400);
  const appointmentType = VALID_TYPES.has(String(type || 'regular')) ? String(type || 'regular') : 'regular';
  const appointmentReason = cleanText(reason, 1000);
  const meta = requestMeta(req || {});
  let connection;
  try {
    connection = await db.beginTransaction();
    await assertSchema(connection, 'secure appointment checkout', {
      appointment_payment_reservations: [
        'token_hash', 'callback_token_hash', 'payment_context',
        'gateway_requested_at', 'gateway_callback_at', 'original_amount', 'online_payable_amount',
        'remaining_amount', 'payment_policy', 'has_supplementary_insurance', 'insurance_status'
      ],
      appointment_payment_events: []
    }, { cacheKey: 'secure-appointment-checkout-v2' });
    const slot = await selectSlotForUpdate(connection, slotId);
    validateSlot(slot);

    await connection.query(
      `UPDATE appointment_payment_reservations
       SET status='expired', last_error_code='PAYMENT_HOLD_EXPIRED',
           last_error_message='مهلت پرداخت پایان یافت و ظرفیت آزاد شد', updated_at=NOW()
       WHERE appointment_slot_id=? AND status='pending' AND expires_at<=UTC_TIMESTAMP()`,
      [slotId]
    );

    // Release an older unfinished checkout of the same patient for this slot
    // before calculating capacity, so a retry never blocks itself.
    await connection.query(
      `UPDATE appointment_payment_reservations
       SET status='cancelled', cancelled_at=NOW(), last_error_code='REPLACED_BY_NEW_CHECKOUT',
           last_error_message='درخواست پرداخت جدید جایگزین شد'
       WHERE patient_id=? AND appointment_slot_id=? AND status='pending'`,
      [patientId, slotId]
    );

    const capacity = Math.max(1, Number(slot.capacity || 1));
    const state = await capacityState(connection, slotId);
    if (state.booked + state.held >= capacity) {
      throw new CheckoutError('ظرفیت این نوبت لحظاتی قبل تکمیل شده است؛ نوبت دیگری انتخاب کنید', 'SLOT_CAPACITY_FULL', 409);
    }

    const baseAmount = Math.max(0, Number(slot.appointment_fee || 0));
    const isFreeService = Number(slot.service_is_free || 0) === 1;
    if (!isFreeService && baseAmount <= 0) {
      throw new CheckoutError('برای این خدمت تعرفه معتبر ثبت نشده است؛ مدیر کلینیک باید تعرفه را تعیین یا خدمت را صریحاً رایگان علامت‌گذاری کند', 'APPOINTMENT_FEE_REQUIRED', 409);
    }
    const paymentResolution = insurance && typeof insurance === 'object' && insurance.paymentPolicy
      ? { ...insurance }
      : insurancePolicy.resolvePaymentPolicy(slot, insurance || {}, baseAmount);
    const amount = Math.max(0, Number(paymentResolution.onlinePayableAmount || 0));
    if (expectedAmount !== null && expectedAmount !== undefined) {
      const expected = insurancePolicy.money(expectedAmount, amount);
      if (expected !== amount && expected !== baseAmount) {
        throw new CheckoutError('مبلغ قابل پرداخت این نوبت تغییر کرده است؛ دوباره نوبت را بررسی کنید', 'APPOINTMENT_FEE_CHANGED', 409);
      }
    }
    if (isFreeService || amount <= 0) {
      const appointment = await insertAppointment(connection, {
        patientId, slot, type: appointmentType, reason: appointmentReason,
        amount: 0, paymentStatus: isFreeService ? 'free' : 'pending', insuranceResolution: paymentResolution
      });
      await syncSlotCapacity(connection, slot);
      await db.commit(connection);
      connection = null;
      const pool = await db.getPool();
      const sms = await queueConfirmationSms(pool, appointment.id);
      const baseMessage = paymentResolution.insuranceApplied
        ? `نوبت شما ثبت شد و با ثبت بیمه تکمیلی فعلاً پرداخت آنلاین لازم نیست. ${paymentResolution.notice}`
        : 'خدمت رایگان است؛ نوبت شما با موفقیت ثبت و تأیید شد.';
      return {
        payment_required: false,
        appointment_id: appointment.id,
        tracking_code: appointment.tracking_code,
        appointment_queue_number: appointment.queue_number,
        appointment_url: `/dashboard/panel/patient/appointments.html?view=${appointment.id}`,
        amount,
        original_amount: paymentResolution.originalAmount,
        online_payable_amount: amount,
        remaining_amount: paymentResolution.remainingAmount,
        payment_policy: paymentResolution.paymentPolicy,
        insurance_status: paymentResolution.insuranceStatus,
        sms,
        message: appendSmsOutcome(baseMessage, sms)
      };
    }

    const rawToken = rawCheckoutToken();
    const callbackToken = rawCallbackToken();
    const tokenHash = sha256(rawToken);
    const callbackTokenHash = sha256(callbackToken);
    const provider = gateway.configuredProvider();
    const idempotencyKey = `checkout-${patientId}-${slotId}-${crypto.randomUUID()}`;
    const [result] = await connection.query(
      `INSERT INTO appointment_payment_reservations
       (token_hash, callback_token_hash, idempotency_key, patient_id, doctor_id, appointment_slot_id,
        medical_center_id, service_id, appointment_date, appointment_time,
        appointment_type, reason, amount, original_amount, online_payable_amount, remaining_amount,
        payment_policy, has_supplementary_insurance, insurance_status, insurance_provider,
        insurance_number, insurance_note, insurance_attachment_url, status, provider, payment_context, expires_at,
        requester_ip_hash, user_agent_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?, ?)`,
      [
        tokenHash, callbackTokenHash, idempotencyKey, patientId, slot.doctor_id, slot.id,
        slot.medical_center_id, slot.service_id, String(slot.slot_date).slice(0, 10),
        String(slot.start_time).slice(0, 8), appointmentType, appointmentReason,
        amount, paymentResolution.originalAmount, amount, paymentResolution.remainingAmount,
        paymentResolution.paymentPolicy, paymentResolution.hasSupplementaryInsurance ? 1 : 0,
        paymentResolution.insuranceStatus, paymentResolution.provider, paymentResolution.number,
        paymentResolution.note, paymentResolution.attachmentUrl,
        provider, paymentContext, HOLD_MINUTES, meta.ip_hash, meta.user_agent_hash
      ]
    );
    const reservation = {
      id: Number(result.insertId), provider, amount, payment_context: paymentContext,
      description: `پرداخت نوبت ${slot.service_name || 'چشم‌پزشکی'} با ${slot.doctor_name || 'پزشک کلینیک'}`
    };
    await addEvent(connection, reservation, 'checkout_created', {
      actor_type: actorType === 'patient' ? 'patient' : 'staff', actor_user_id: actorUserId, request_id: meta.request_id,
      payload: { slot_id: slot.id, amount, original_amount: paymentResolution.originalAmount, remaining_amount: paymentResolution.remainingAmount, payment_policy: paymentResolution.paymentPolicy, insurance_status: paymentResolution.insuranceStatus, currency: 'IRT', hold_minutes: HOLD_MINUTES, fee_source: slot.fee_source, payment_context: paymentContext }
    });
    const [patientRows] = await connection.query(
      `SELECT COALESCE(p.phone,p.mobile,u.phone,'') AS mobile, COALESCE(u.email,'') AS email
       FROM patients p LEFT JOIN users u ON u.id=p.user_id WHERE p.id=? LIMIT 1`,
      [patientId]
    );
    const target = await gateway.createCheckoutTarget({
      rawToken, callbackToken, reservation, context: paymentContext, req,
      patient: patientRows[0] || {}
    });
    if (target.authority) {
      await connection.query(
        `UPDATE appointment_payment_reservations
         SET provider_authority=?, gateway_requested_at=UTC_TIMESTAMP(), updated_at=UTC_TIMESTAMP()
         WHERE id=?`,
        [target.authority, reservation.id]
      );
      reservation.provider_authority = target.authority;
      await addEvent(connection, reservation, 'gateway_payment_requested', {
        actor_type: 'gateway', actor_user_id: actorUserId, request_id: meta.request_id,
        provider: provider, authority: target.authority,
        payload: { request: target.request_payload, response: target.response_payload }
      });
    }
    await db.commit(connection);
    connection = null;
    return {
      payment_required: true,
      checkout_token: rawToken,
      checkout_id: reservation.id,
      payment_url: target.redirect_url,
      provider: target.provider,
      gateway_url: target.gateway_url || null,
      expires_in_seconds: HOLD_MINUTES * 60,
      amount,
      original_amount: paymentResolution.originalAmount,
      online_payable_amount: amount,
      remaining_amount: paymentResolution.remainingAmount,
      payment_policy: paymentResolution.paymentPolicy,
      insurance_status: paymentResolution.insuranceStatus,
      message: paymentResolution.insuranceApplied
        ? `این نوبت تا ${HOLD_MINUTES} دقیقه برای پرداخت مبلغ قابل پرداخت نگه داشته شد؛ اطلاعات بیمه در کلینیک بررسی می‌شود`
        : `این نوبت تا ${HOLD_MINUTES} دقیقه برای پرداخت نگه داشته شد؛ پس از پرداخت موفق نهایی می‌شود`
    };
  } catch (error) {
    if (connection) await db.rollback(connection).catch(() => {});
    throw error;
  }
}

async function reservationByToken(connection, rawToken, access = {}, lock = false) {
  const tokenHash = sha256(rawToken);
  const conditions = ['r.token_hash=?'];
  const params = [tokenHash];
  if (access.patientId) {
    conditions.push('r.patient_id=?');
    params.push(Number(access.patientId));
  }
  if (access.staffUserId && !access.allowAnyStaff) {
    conditions.push('origin.initiated_by_user_id=?');
    params.push(Number(access.staffUserId));
  }
  const [rows] = await connection.query(
    `SELECT r.*, du.full_name AS doctor_name, d.specialty,
            pu.full_name AS patient_name, pu.phone AS patient_phone,
            mc.name AS medical_center_name, s.name AS service_name,
            aps.end_time, origin.initiated_by_user_id, origin.initiated_by_actor_type
     FROM appointment_payment_reservations r
     JOIN doctors d ON d.id=r.doctor_id
     JOIN users du ON du.id=d.user_id
     JOIN patients pat ON pat.id=r.patient_id
     JOIN users pu ON pu.id=pat.user_id
     LEFT JOIN medical_centers mc ON mc.id=r.medical_center_id
     LEFT JOIN services s ON s.id=r.service_id
     LEFT JOIN appointment_slots aps ON aps.id=r.appointment_slot_id
     LEFT JOIN (
       SELECT reservation_id,
              MAX(CASE WHEN event_type='checkout_created' THEN actor_user_id END) AS initiated_by_user_id,
              MAX(CASE WHEN event_type='checkout_created' THEN actor_type END) AS initiated_by_actor_type
       FROM appointment_payment_events
       GROUP BY reservation_id
     ) origin ON origin.reservation_id=r.id
     WHERE ${conditions.join(' AND ')}
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    params
  );
  return rows[0] || null;
}

async function getCheckoutPreview({ rawToken, patientId = null, staffUserId = null, allowAnyStaff = false, req }) {
  if (!rawToken || String(rawToken).length < 20) throw new CheckoutError('شناسه پرداخت معتبر نیست', 'INVALID_CHECKOUT_TOKEN', 400);
  let connection;
  try {
    connection = await db.beginTransaction();
    let reservation = await reservationByToken(connection, rawToken, { patientId, staffUserId, allowAnyStaff }, true);
    if (!reservation) throw new CheckoutError('درخواست پرداخت یافت نشد', 'CHECKOUT_NOT_FOUND', 404);
    reservation = await expireReservationIfNeeded(connection, reservation, requestMeta(req || {}));
    // API consumers always receive an explicit UTC timestamp. This keeps the
    // countdown identical on Windows/Linux and in every browser timezone.
    reservation.expires_at = databaseUtcIso(reservation.expires_at);
    reservation.created_at = databaseUtcIso(reservation.created_at);
    reservation.updated_at = databaseUtcIso(reservation.updated_at);
    reservation.paid_at = databaseUtcIso(reservation.paid_at);
    reservation.cancelled_at = databaseUtcIso(reservation.cancelled_at);
    reservation.failed_at = databaseUtcIso(reservation.failed_at);
    reservation.gateway_url = reservation.provider === 'zarinpal' && reservation.status === 'pending'
      ? gateway.zarinpalCheckoutUrl(reservation.provider_authority)
      : null;
    await db.commit(connection); connection = null;
    return reservation;
  } catch (error) {
    if (connection) await db.rollback(connection).catch(() => {});
    throw error;
  }
}


async function insertVerifiedPayment(connection, {
  appointmentId,
  amount,
  verification,
  actorUserId,
  idempotencyKey
}) {
  const [columnRows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'payments'
       AND COLUMN_NAME IN ('created_by','approved_by','approved_at')`
  );
  const available = new Set(columnRows.map(row => String(row.COLUMN_NAME || row.column_name || '')));
  const columns = [
    'appointment_id', 'amount', 'payment_method', 'status', 'receipt_number', 'description'
  ];
  const expressions = ['?', '?', '?', '?', '?', '?'];
  const params = [
    appointmentId,
    Number(amount),
    'online',
    'completed',
    verification.receipt_number,
    verification.provider === 'zarinpal' ? 'پرداخت تأییدشده زرین‌پال برای نوبت' : 'پرداخت آزمایشی تأییدشده برای نوبت'
  ];

  if (available.has('created_by')) {
    columns.push('created_by');
    expressions.push('?');
    params.push(actorUserId || null);
  }
  if (available.has('approved_by')) {
    columns.push('approved_by');
    expressions.push('?');
    params.push(actorUserId || null);
  }
  if (available.has('approved_at')) {
    columns.push('approved_at');
    expressions.push('UTC_TIMESTAMP()');
  }

  columns.push('provider', 'provider_authority', 'provider_reference', 'idempotency_key', 'verified_at');
  expressions.push('?', '?', '?', '?', 'UTC_TIMESTAMP()');
  params.push(
    verification.provider,
    verification.authority,
    verification.reference,
    idempotencyKey
  );

  const [result] = await connection.query(
    `INSERT INTO payments (${columns.join(', ')}) VALUES (${expressions.join(', ')})`,
    params
  );
  return Number(result.insertId);
}

async function finalizeVerifiedReservation(connection, {
  reservation,
  verification,
  patientId,
  actorUserId,
  meta,
  requestPayload = {}
}) {
  const slot = await selectSlotForUpdate(connection, reservation.appointment_slot_id);
  validateSlot(slot);
  const state = await capacityState(connection, slot.id, reservation.id);
  if (state.booked >= Math.max(1, Number(slot.capacity || 1))) {
    await connection.query(
      `UPDATE appointment_payment_reservations
       SET status='failed', failed_at=UTC_TIMESTAMP(), gateway_callback_at=UTC_TIMESTAMP(),
           provider_authority=?, provider_reference=?,
           last_error_code='SLOT_CAPACITY_FULL_AFTER_PAYMENT',
           last_error_message='پرداخت تأیید شد اما ظرفیت پیش از نهایی‌سازی تکمیل شده بود'
       WHERE id=?`,
      [verification.authority, verification.reference, reservation.id]
    );
    await addEvent(connection, reservation, 'paid_capacity_conflict', {
      actor_type: 'gateway', request_id: meta.request_id,
      provider: verification.provider, authority: verification.authority, reference: verification.reference,
      payload: { booked: state.booked, capacity: Number(slot.capacity || 1), manual_reconciliation_required: true }
    });
    return {
      reconciliation_required: true,
      code: 'PAID_CAPACITY_CONFLICT',
      reference_number: verification.reference,
      receipt_number: verification.receipt_number,
      message: 'پرداخت تأیید شد اما ظرفیت نوبت هم‌زمان تکمیل شده است؛ کلینیک پرداخت را بررسی و با بیمار تماس می‌گیرد'
    };
  }

  const effectivePatientId = Number(patientId || reservation.patient_id || 0);
  if (!effectivePatientId) throw new CheckoutError('بیمار مرتبط با این پرداخت یافت نشد', 'CHECKOUT_PATIENT_NOT_FOUND', 409);

  const appointment = await insertAppointment(connection, {
    patientId: effectivePatientId,
    slot,
    type: reservation.appointment_type,
    reason: reservation.reason,
    amount: Number(reservation.amount),
    paymentStatus: 'paid',
    insuranceResolution: {
      originalAmount: Number(reservation.original_amount || reservation.amount || 0),
      onlinePayableAmount: Number(reservation.online_payable_amount || reservation.amount || 0),
      remainingAmount: Number(reservation.remaining_amount || 0),
      paymentPolicy: reservation.payment_policy || 'standard_full_payment',
      hasSupplementaryInsurance: Number(reservation.has_supplementary_insurance || 0) === 1,
      insuranceApplied: Number(reservation.has_supplementary_insurance || 0) === 1,
      insuranceStatus: reservation.insurance_status || (Number(reservation.has_supplementary_insurance || 0) === 1 ? 'pending_review' : 'none'),
      provider: reservation.insurance_provider || null,
      number: reservation.insurance_number || null,
      note: reservation.insurance_note || null,
      attachmentUrl: reservation.insurance_attachment_url || null
    }
  });
  const paymentId = await insertVerifiedPayment(connection, {
    appointmentId: appointment.id,
    amount: Number(reservation.amount),
    verification,
    actorUserId,
    idempotencyKey: reservation.idempotency_key
  });

  await connection.query(
    `INSERT INTO payment_attempts
     (payment_id, provider, authority, reference_id, request_payload,
      response_payload, status, created_at, verified_at)
     VALUES (?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 'verified', UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [
      paymentId,
      verification.provider,
      verification.authority,
      verification.reference,
      safeJson({
        reservation_id: reservation.id,
        appointment_id: appointment.id,
        expected_amount: Number(reservation.amount),
        currency: 'IRT',
        initiated_by_user_id: actorUserId || null,
        ...requestPayload
      }),
      safeJson({
        ...verification.response_payload,
        receipt_number: verification.receipt_number,
        provider_reference: verification.reference,
        provider_authority: verification.authority,
        verified_amount: Number(verification.verified_amount),
        verified_at: verification.verified_at instanceof Date ? verification.verified_at.toISOString() : verification.verified_at
      })
    ]
  );

  await connection.query(
    `UPDATE appointment_payment_reservations
     SET status='paid', payment_id=?, appointment_id=?, paid_at=UTC_TIMESTAMP(), gateway_callback_at=UTC_TIMESTAMP(),
         provider=?, provider_authority=?, provider_reference=?, updated_at=UTC_TIMESTAMP()
     WHERE id=? AND status='pending'`,
    [paymentId, appointment.id, verification.provider, verification.authority, verification.reference, reservation.id]
  );
  reservation.payment_id = paymentId;
  reservation.appointment_id = appointment.id;
  reservation.provider = verification.provider;
  reservation.provider_authority = verification.authority;
  reservation.provider_reference = verification.reference;
  await syncSlotCapacity(connection, slot);
  await addEvent(connection, reservation, 'payment_verified_and_appointment_created', {
    actor_type: 'gateway', actor_user_id: actorUserId, request_id: meta.request_id,
    payment_id: paymentId, appointment_id: appointment.id,
    provider: verification.provider, authority: verification.authority, reference: verification.reference,
    payload: { verified_amount: verification.verified_amount, currency: 'IRT', response: verification.response_payload }
  });

  return {
    appointment_id: appointment.id,
    tracking_code: appointment.tracking_code,
    appointment_queue_number: appointment.queue_number,
    payment_id: paymentId,
    amount: Number(reservation.amount),
    receipt_number: verification.receipt_number,
    reference_number: verification.reference,
    authority: verification.authority,
    verified_at: verification.verified_at instanceof Date ? verification.verified_at.toISOString() : verification.verified_at
  };
}

async function completeSandboxCheckout({ rawToken, patientId = null, staffUserId = null, allowAnyStaff = false, actorUserId, actorType = 'patient', req }) {
  const meta = requestMeta(req || {});
  let connection;
  try {
    connection = await db.beginTransaction();
    let reservation = await reservationByToken(connection, rawToken, { patientId, staffUserId, allowAnyStaff }, true);
    if (!reservation) throw new CheckoutError('درخواست پرداخت یافت نشد', 'CHECKOUT_NOT_FOUND', 404);
    reservation = await expireReservationIfNeeded(connection, reservation, meta);
    if (reservation.status === 'expired') throw new CheckoutError('مهلت پرداخت پایان یافته و ظرفیت آزاد شده است؛ دوباره نوبت را انتخاب کنید', 'CHECKOUT_EXPIRED', 409);
    if (reservation.status === 'cancelled') throw new CheckoutError('این پرداخت قبلاً لغو شده است', 'CHECKOUT_CANCELLED', 409);
    if (reservation.status === 'failed') throw new CheckoutError('این پرداخت ناموفق بوده است؛ دوباره نوبت را انتخاب کنید', 'CHECKOUT_FAILED', 409);
    if (reservation.status === 'paid') {
      await db.commit(connection); connection = null;
      return {
        idempotent: true,
        appointment_id: reservation.appointment_id,
        payment_id: reservation.payment_id,
        receipt_number: reservation.provider_reference,
        reference_number: reservation.provider_reference,
        message: 'این پرداخت قبلاً تأیید و نوبت ثبت شده است'
      };
    }
    if (reservation.provider !== 'sandbox') throw new CheckoutError('این درخواست متعلق به درگاه آزمایشی نیست', 'CHECKOUT_PROVIDER_MISMATCH', 409);

    const verification = gateway.assertVerifiedResult(
      gateway.trustedSandboxVerification({ reservationId: reservation.id, amount: reservation.amount }),
      reservation.amount
    );
    const result = await finalizeVerifiedReservation(connection, {
      reservation,
      verification,
      patientId,
      actorUserId,
      meta,
      requestPayload: { mode: 'sandbox', fake_bank_record: true, no_card_data_collected: true }
    });
    await db.commit(connection); connection = null;
    if (result.reconciliation_required) return result;
    const pool = await db.getPool();
    const sms = await queueConfirmationSms(pool, result.appointment_id, { messageType: 'payment_success', templateKey: 'sms_payment_success_template' });
    return {
      ...result,
      sms,
      bank_name: verification.response_payload?.bank_name || 'درگاه آزمایشی کلینیک',
      terminal_id: verification.response_payload?.terminal_id || 'NV-SANDBOX-01',
      trace_number: verification.response_payload?.trace_number || null,
      rrn: verification.response_payload?.rrn || null,
      message: appendSmsOutcome('پرداخت آزمایشی با موفقیت تأیید شد و نوبت ثبت و تأیید گردید.', sms)
    };
  } catch (error) {
    if (connection) await db.rollback(connection).catch(() => {});
    throw error;
  }
}

async function reservationByCallbackToken(connection, callbackToken, lock = false) {
  const tokenHash = sha256(callbackToken);
  const [rows] = await connection.query(
    `SELECT r.*, du.full_name AS doctor_name, pu.full_name AS patient_name,
            COALESCE(pu.phone, pat.phone, pat.mobile, '') AS patient_phone,
            mc.name AS medical_center_name, s.name AS service_name, aps.end_time
     FROM appointment_payment_reservations r
     JOIN doctors d ON d.id=r.doctor_id
     JOIN users du ON du.id=d.user_id
     JOIN patients pat ON pat.id=r.patient_id
     LEFT JOIN users pu ON pu.id=pat.user_id
     LEFT JOIN medical_centers mc ON mc.id=r.medical_center_id
     LEFT JOIN services s ON s.id=r.service_id
     LEFT JOIN appointment_slots aps ON aps.id=r.appointment_slot_id
     WHERE r.callback_token_hash=?
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function completeZarinpalCheckout({ callbackToken, authority, status, req }) {
  if (!callbackToken || String(callbackToken).length < 20) throw new CheckoutError('شناسه بازگشت پرداخت معتبر نیست', 'INVALID_CALLBACK_TOKEN', 400);
  const cleanAuthority = String(authority || '').trim();
  const cleanStatus = String(status || '').trim().toUpperCase();
  const meta = requestMeta(req || {});
  const pool = await db.getPool();

  const initial = await reservationByCallbackToken(pool, callbackToken, false);
  if (!initial) throw new CheckoutError('درخواست پرداخت یافت نشد', 'CHECKOUT_NOT_FOUND', 404);
  if (initial.provider !== 'zarinpal') throw new CheckoutError('ارائه‌دهنده پرداخت با درخواست ثبت‌شده یکسان نیست', 'CHECKOUT_PROVIDER_MISMATCH', 409);
  if (initial.status === 'paid') {
    return {
      idempotent: true,
      appointment_id: initial.appointment_id,
      payment_id: initial.payment_id,
      reference_number: initial.provider_reference,
      payment_context: initial.payment_context || 'patient',
      message: 'این پرداخت قبلاً تأیید شده است'
    };
  }

  if (cleanStatus !== 'OK') {
    let connection;
    try {
      connection = await db.beginTransaction();
      const reservation = await reservationByCallbackToken(connection, callbackToken, true);
      if (reservation?.status === 'pending') {
        await connection.query(
          `UPDATE appointment_payment_reservations
           SET status='cancelled', cancelled_at=UTC_TIMESTAMP(), gateway_callback_at=UTC_TIMESTAMP(),
               last_error_code='ZARINPAL_CANCELLED', last_error_message='پرداخت در درگاه تکمیل نشد'
           WHERE id=?`,
          [reservation.id]
        );
        await addEvent(connection, reservation, 'gateway_payment_cancelled', {
          actor_type: 'gateway', request_id: meta.request_id,
          provider: 'zarinpal', authority: cleanAuthority || reservation.provider_authority,
          payload: { status: cleanStatus || 'NOK' }
        });
      }
      await db.commit(connection); connection = null;
      return { cancelled: true, payment_context: initial.payment_context || 'patient', message: 'پرداخت انجام نشد و ظرفیت نوبت آزاد شد' };
    } catch (error) {
      if (connection) await db.rollback(connection).catch(() => {});
      throw error;
    }
  }

  if (!cleanAuthority || cleanAuthority !== String(initial.provider_authority || '')) {
    throw new CheckoutError('شناسه مرجع بازگشت با پرداخت ثبت‌شده یکسان نیست', 'ZARINPAL_AUTHORITY_MISMATCH', 409);
  }

  const verification = gateway.assertVerifiedResult(
    await gateway.verifyZarinpalPayment({ authority: cleanAuthority, amount: initial.amount }),
    initial.amount
  );

  let connection;
  try {
    connection = await db.beginTransaction();
    let reservation = await reservationByCallbackToken(connection, callbackToken, true);
    if (!reservation) throw new CheckoutError('درخواست پرداخت یافت نشد', 'CHECKOUT_NOT_FOUND', 404);
    if (reservation.status === 'paid') {
      await db.commit(connection); connection = null;
      return {
        idempotent: true,
        appointment_id: reservation.appointment_id,
        payment_id: reservation.payment_id,
        reference_number: reservation.provider_reference,
        payment_context: reservation.payment_context || 'patient',
        message: 'این پرداخت قبلاً تأیید شده است'
      };
    }
    if (reservation.status !== 'pending') {
      throw new CheckoutError('این درخواست پرداخت دیگر قابل نهایی‌سازی نیست', 'CHECKOUT_NOT_PENDING', 409);
    }
    const result = await finalizeVerifiedReservation(connection, {
      reservation,
      verification,
      patientId: reservation.patient_id,
      actorUserId: null,
      meta,
      requestPayload: { callback_status: cleanStatus }
    });
    await db.commit(connection); connection = null;
    if (result.reconciliation_required) return { ...result, payment_context: reservation.payment_context || 'patient' };
    const sms = await queueConfirmationSms(pool, result.appointment_id, { messageType: 'payment_success', templateKey: 'sms_payment_success_template' });
    return {
      ...result,
      sms,
      payment_context: reservation.payment_context || 'patient',
      message: appendSmsOutcome('پرداخت با موفقیت تأیید شد و نوبت شما ثبت گردید.', sms)
    };
  } catch (error) {
    if (connection) await db.rollback(connection).catch(() => {});
    throw error;
  }
}

async function cancelCheckout({ rawToken, patientId = null, staffUserId = null, allowAnyStaff = false, actorUserId, actorType = 'patient', req }) {
  const meta = requestMeta(req || {});
  let connection;
  try {
    connection = await db.beginTransaction();
    let reservation = await reservationByToken(connection, rawToken, { patientId, staffUserId, allowAnyStaff }, true);
    if (!reservation) throw new CheckoutError('درخواست پرداخت یافت نشد', 'CHECKOUT_NOT_FOUND', 404);
    reservation = await expireReservationIfNeeded(connection, reservation, meta);
    if (reservation.status === 'paid') throw new CheckoutError('پرداخت قبلاً تأیید شده و قابل انصراف نیست', 'CHECKOUT_ALREADY_PAID', 409);
    if (['cancelled', 'expired'].includes(reservation.status)) {
      await db.commit(connection); connection = null;
      return { idempotent: true, message: 'رزرو موقت قبلاً آزاد شده است و نوبتی ثبت نشده' };
    }
    await connection.query(
      `UPDATE appointment_payment_reservations
       SET status='cancelled', cancelled_at=NOW(), last_error_code='PATIENT_CANCELLED',
           last_error_message='بیمار از پرداخت منصرف شد', updated_at=NOW()
       WHERE id=? AND status='pending'`, [reservation.id]
    );
    reservation.status = 'cancelled';
    await addEvent(connection, reservation, 'checkout_cancelled_by_patient', {
      actor_type: actorType === 'patient' ? 'patient' : 'staff', actor_user_id: actorUserId, request_id: meta.request_id,
      payload: { message: 'بیمار از پرداخت منصرف شد؛ ظرفیت فوراً آزاد شد و نوبتی ایجاد نشد' }
    });
    await db.commit(connection); connection = null;
    return { message: 'پرداخت انجام نشد؛ ظرفیت آزاد شد و هیچ نوبتی برای شما ثبت نشد' };
  } catch (error) {
    if (connection) await db.rollback(connection).catch(() => {});
    throw error;
  }
}


async function expirePendingReservations(poolOrConnection = null) {
  const pool = poolOrConnection || await db.getPool();
  const [rows] = await pool.query(
    `SELECT id FROM appointment_payment_reservations
     WHERE status='pending' AND expires_at<=UTC_TIMESTAMP()
     ORDER BY id ASC LIMIT 500`
  );
  if (!rows.length) return { expired: 0 };
  const ids = rows.map(row => Number(row.id)).filter(Boolean);
  const [result] = await pool.query(
    `UPDATE appointment_payment_reservations
     SET status='expired', last_error_code='PAYMENT_HOLD_EXPIRED',
         last_error_message='مهلت پرداخت پایان یافت و ظرفیت آزاد شد', updated_at=UTC_TIMESTAMP()
     WHERE id IN (?) AND status='pending'`,
    [ids]
  );
  return { expired: Number(result.affectedRows || 0) };
}

module.exports = {
  CheckoutError,
  HOLD_MINUTES,
  requestMeta,
  createCheckout,
  getCheckoutPreview,
  completeSandboxCheckout,
  completeZarinpalCheckout,
  expirePendingReservations,
  cancelCheckout
};
