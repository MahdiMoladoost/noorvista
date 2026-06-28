// src/routes/appointmentArchitecture.js
// NOORVISTA - Appointment architecture v2
// پزشک + مرکز درمانی + خدمت + زمان + ظرفیت
const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const { protect, restrictTo, optionalAuth } = require('../middleware/auth');
const appointmentConfirmationSms = require('../services/appointmentConfirmationSms');
const secureCheckout = require('../services/secureAppointmentCheckout');
const insurancePolicy = require('../services/appointmentInsurancePolicy');
const { assertSchema } = require('../database/schemaGuard');
const { assertTransition, normalizeStatus } = require('../domain/appointmentStateMachine');

const router = createAsyncRouter(express);

const publicCheckoutReadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'تعداد درخواست‌ها زیاد است؛ چند دقیقه بعد دوباره تلاش کنید' }
});
const publicCheckoutWriteLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'تعداد تلاش‌های پرداخت زیاد است؛ چند دقیقه بعد دوباره تلاش کنید' }
});

const managerOnly = [protect, restrictTo('system_admin', 'admin', 'clinic_admin', 'clinic_manager', 'manager')];
const staffCheckoutOnly = [protect, restrictTo(
    'system_admin', 'admin', 'clinic_admin', 'clinic_manager', 'manager',
    'receptionist', 'reception', 'secretary', 'staff'
)];

const DIGIT_MAP = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

function toEnglishDigits(value) {
    return String(value ?? '').replace(/[۰-۹٠-٩]/g, ch => DIGIT_MAP[ch] || ch);
}

function toPositiveInt(value, fallback = null) {
    const normalized = toEnglishDigits(value).replace(/[,\s]/g, '').trim();
    if (!normalized) return fallback;
    const number = Number(normalized);
    if (!Number.isFinite(number)) return fallback;
    return Math.floor(number);
}

function toMoney(value, fallback = 0, allowNull = false) {
    const raw = toEnglishDigits(value)
        .replace(/[٬,\s]/g, '')
        .replace(/[^0-9.]/g, '')
        .trim();
    if (!raw) return allowNull ? null : fallback;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0 || number > 999999999999) {
        const err = new Error('مبلغ تعرفه نامعتبر است');
        err.status = 400;
        throw err;
    }
    const amount = Math.round(number);
    if (allowNull && amount <= 0) return null;
    return amount;
}

function toBool(value, defaultValue = true) {
    if (value === undefined || value === null || value === '') return defaultValue ? 1 : 0;
    if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on' || value === 'yes') return 1;
    if (value === false || value === 0 || value === '0' || value === 'false' || value === 'off' || value === 'no') return 0;
    return value ? 1 : 0;
}

function cleanText(value, max = 500) {
    const text = String(value || '').trim();
    return text.length > max ? text.slice(0, max) : text;
}

function normalizeTime(value) {
    let raw = toEnglishDigits(value || '').trim();
    raw = raw.replace(/\s+/g, ' ').toUpperCase();

    const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (ampm) {
        let hour = Number(ampm[1]);
        const minute = Number(ampm[2]);
        if (hour < 1 || hour > 12 || minute > 59) return null;
        if (ampm[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    }

    const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}


function timeToMinutes(value) {
    const t = normalizeTime(value);
    if (!t) return NaN;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function normalizeDate(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function formatDate(date) {
    if (date instanceof Date) {
        return date.toISOString().slice(0, 10);
    }
    return String(date || '').slice(0, 10);
}

function addDays(dateString, days) {
    const d = new Date(`${dateString}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function weekdayFromDate(dateString) {
    // JS: Sun=0 ... Sat=6 ; project uses 0=Saturday, 1=Sunday, ...
    const d = new Date(`${dateString}T00:00:00Z`);
    return (d.getUTCDay() + 1) % 7;
}

function timePlusMinutes(time, minutes) {
    const total = timeToMinutes(time) + Number(minutes || 0);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function resolveScheduleEndTime(startTimeValue, endTimeValue, slotDurationValue) {
    const startTime = normalizeTime(startTimeValue);
    const requestedEndTime = normalizeTime(endTimeValue);
    const duration = toPositiveInt(slotDurationValue, 30);
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(requestedEndTime);

    if (!startTime || !requestedEndTime || !Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
        const err = new Error('ساعت شروع یا پایان نامعتبر است');
        err.status = 400;
        throw err;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
        const err = new Error('مدت هر نوبت باید عدد مثبت باشد');
        err.status = 400;
        throw err;
    }
    if (endMinutes < startMinutes) {
        const err = new Error('ساعت پایان نمی‌تواند قبل از ساعت شروع باشد');
        err.status = 400;
        throw err;
    }
    if (endMinutes === startMinutes) {
        const effectiveEndMinutes = startMinutes + duration;
        if (effectiveEndMinutes >= 24 * 60) {
            const err = new Error('نوبت تک‌بازه‌ای نباید از پایان روز عبور کند');
            err.status = 400;
            throw err;
        }
        return timePlusMinutes(startTime, duration);
    }
    return requestedEndTime;
}

function trimTime(value) {
    return String(value || '').slice(0, 5);
}

function makeSlug(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^\u0600-\u06FFa-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || `service-${Date.now()}`;
}

function trackingCode() {
    return 'NV-' + crypto.randomBytes(12).toString('base64url').toUpperCase();
}

async function columns(connection, tableName) {
    const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
    return new Set(rows.map(r => r.Field));
}

async function insertDynamic(connection, table, data) {
    const col = await columns(connection, table);
    const entries = Object.entries(data).filter(([key, value]) => col.has(key) && value !== undefined);
    if (!entries.length) throw new Error(`No insertable columns for ${table}`);
    const sql = `INSERT INTO \`${table}\` SET ` + entries.map(([key]) => `\`${key}\` = ?`).join(', ');
    const [result] = await connection.query(sql, entries.map(([, value]) => value));
    return result;
}

async function updateDynamic(connection, table, data, whereSql, whereParams) {
    const col = await columns(connection, table);
    const entries = Object.entries(data).filter(([key, value]) => col.has(key) && value !== undefined);
    if (!entries.length) return;
    const sql = `UPDATE \`${table}\` SET ` + entries.map(([key]) => `\`${key}\` = ?`).join(', ') + ` ${whereSql}`;
    await connection.query(sql, [...entries.map(([, value]) => value), ...whereParams]);
}

async function ensureAppointmentArchitecture(connection) {
    return assertSchema(connection, 'appointment architecture', {
        medical_centers: ['id', 'name', 'type', 'is_active'],
        services: [
            'id', 'name', 'slug', 'category', 'default_capacity',
            'default_duration_minutes', 'default_fee', 'is_free', 'is_active',
            'supplementary_insurance_enabled', 'supplementary_insurance_payment_mode',
            'supplementary_insurance_amount', 'supplementary_insurance_percent',
            'supplementary_insurance_requires_review', 'supplementary_insurance_attachment_required'
        ],
        doctor_medical_centers: ['doctor_id', 'medical_center_id', 'is_active'],
        doctor_schedules: [
            'id', 'doctor_id', 'medical_center_id', 'service_id', 'day_of_week',
            'start_time', 'end_time', 'slot_duration_minutes',
            'capacity_per_slot', 'custom_fee', 'start_date', 'end_date', 'is_recurring', 'is_active'
        ],
        appointment_slots: [
            'id', 'doctor_schedule_id', 'doctor_id', 'medical_center_id',
            'service_id', 'slot_date', 'start_time', 'end_time', 'capacity',
            'booked_count', 'remaining_capacity', 'status'
        ],
        appointment_slot_position_states: [
            'slot_id', 'position_in_slot', 'status'
        ],
        appointments: [
            'id', 'appointment_slot_id', 'medical_center_id', 'service_id',
            'tracking_code', 'appointment_queue_number', 'confirmed_at',
            'confirmation_sms_sent_at', 'confirmation_sms_status',
            'confirmation_sms_error', 'amount', 'original_amount', 'online_payable_amount',
            'remaining_amount', 'payment_policy', 'has_supplementary_insurance', 'insurance_status'
        ]
    });
}

async function ensureAndGetPool() {
    const pool = await db.getPool();
    await ensureAppointmentArchitecture(pool);
    return pool;
}

async function assertActiveDoctor(connection, doctorId) {
    const [rows] = await connection.query('SELECT id, COALESCE(is_active, 1) AS is_active FROM doctors WHERE id = ? LIMIT 1', [doctorId]);
    if (!rows.length || !Number(rows[0].is_active)) {
        const err = new Error('پزشک فعال یافت نشد');
        err.status = 400;
        throw err;
    }
}

async function assertActiveCenter(connection, centerId) {
    const [rows] = await connection.query('SELECT id, is_active FROM medical_centers WHERE id = ? LIMIT 1', [centerId]);
    if (!rows.length || !Number(rows[0].is_active)) {
        const err = new Error('مرکز درمانی فعال یافت نشد');
        err.status = 400;
        throw err;
    }
}

async function assertActiveService(connection, serviceId) {
    const [rows] = await connection.query('SELECT id, is_active, default_capacity, default_duration_minutes, default_fee FROM services WHERE id = ? LIMIT 1', [serviceId]);
    if (!rows.length || !Number(rows[0].is_active)) {
        const err = new Error('خدمت فعال یافت نشد');
        err.status = 400;
        throw err;
    }
    return rows[0];
}

async function assertDoctorCenter(connection, doctorId, centerId) {
    const [rows] = await connection.query(
        'SELECT id FROM doctor_medical_centers WHERE doctor_id = ? AND medical_center_id = ? AND is_active = 1 LIMIT 1',
        [doctorId, centerId]
    );
    if (!rows.length) {
        const err = new Error('پزشک با مرکز درمانی انتخاب‌شده مرتبط نیست');
        err.status = 400;
        throw err;
    }
}

async function validateSchedulePayload(connection, body, currentId = null) {
    const doctorId = Number(body.doctor_id);
    const centerId = Number(body.medical_center_id);
    const serviceId = Number(body.service_id);
    const requestedDayOfWeek = Number(body.day_of_week);
    const startTime = normalizeTime(body.start_time);
    const endTime = normalizeTime(body.end_time);
    const slotDuration = toPositiveInt(body.slot_duration_minutes || body.slot_duration, 30);
    const capacity = toPositiveInt(body.capacity_per_slot || body.capacity, 1);
    const startDate = normalizeDate(body.start_date) || new Date().toISOString().slice(0, 10);
    const isRecurring = toBool(body.is_recurring, true);
    const rawEndDate = normalizeDate(body.end_date);
    const endDate = rawEndDate || (isRecurring ? null : startDate);
    const dayOfWeek = isRecurring ? requestedDayOfWeek : weekdayFromDate(startDate);
    const isActive = toBool(body.is_active, true);
    const customFee = toMoney(body.custom_fee, 0, true);

    if (!doctorId || !centerId || !serviceId) {
        const err = new Error('انتخاب پزشک، مرکز درمانی و خدمت الزامی است');
        err.status = 400;
        throw err;
    }
    if (isRecurring && (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) {
        const err = new Error('روز هفته نامعتبر است');
        err.status = 400;
        throw err;
    }
    if (!Number.isFinite(slotDuration) || slotDuration <= 0) {
        const err = new Error('مدت هر نوبت باید عدد مثبت باشد');
        err.status = 400;
        throw err;
    }
    const effectiveEndTime = resolveScheduleEndTime(startTime, endTime, slotDuration);
    if (!Number.isFinite(capacity) || capacity <= 0) {
        const err = new Error('ظرفیت هر نوبت باید عدد مثبت باشد');
        err.status = 400;
        throw err;
    }
    if (isRecurring && !rawEndDate) {
        const err = new Error('برای برنامه تکرارشونده، تاریخ پایان الزامی است');
        err.status = 400;
        throw err;
    }
    if (endDate && endDate < startDate) {
        const err = new Error('تاریخ پایان باید بعد از تاریخ شروع باشد');
        err.status = 400;
        throw err;
    }

    await assertActiveDoctor(connection, doctorId);
    await assertActiveCenter(connection, centerId);
    await assertActiveService(connection, serviceId);
    await assertDoctorCenter(connection, doctorId, centerId);

    // روش سراسری عدم هم‌پوشانی:
    // پزشک برای یک خدمت واحد در یک بازه زمانی نمی‌تواند حتی در مرکز دیگری برنامه موازی داشته باشد.
    const params = [doctorId, serviceId, dayOfWeek, endDate, startDate, effectiveEndTime, startTime];
    let idSql = '';
    if (currentId) {
        idSql = ' AND id <> ?';
        params.push(currentId);
    }
    const [overlap] = await connection.query(
        `SELECT id, medical_center_id, start_time, end_time
         FROM doctor_schedules
         WHERE doctor_id = ?
           AND service_id = ?
           AND day_of_week = ?
           AND COALESCE(is_active, 1) = 1
           AND NOT (COALESCE(end_date, '2999-12-31') < ? OR COALESCE(start_date, '1970-01-01') > ?)
           AND start_time < ? AND end_time > ?
           ${idSql}
         LIMIT 1
         FOR UPDATE`,
        params
    );
    if (overlap.length) {
        const err = new Error('برای این پزشک و خدمت در بازه انتخاب‌شده برنامه هم‌پوشان وجود دارد؛ مرکز درمانی متفاوت نیز مجاز نیست');
        err.status = 409;
        err.code = 'SCHEDULE_OVERLAP';
        throw err;
    }

    return {
        doctor_id: doctorId,
        medical_center_id: centerId,
        service_id: serviceId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: effectiveEndTime,
        slot_duration_minutes: Math.floor(slotDuration),
        slot_duration: Math.floor(slotDuration), // compatibility with old column
        capacity_per_slot: Math.floor(capacity),
        custom_fee: customFee,
        start_date: startDate,
        end_date: endDate,
        is_recurring: isRecurring,
        is_active: isActive
    };
}

async function getLegacyAppointmentOverlapColumns(connection) {
    try {
        const appointmentColumns = await columns(connection, 'appointments');
        const required = ['doctor_id', 'service_id', 'appointment_date', 'appointment_time'];
        if (!required.every((name) => appointmentColumns.has(name))) return null;
        return appointmentColumns;
    } catch (_error) {
        return null;
    }
}

async function assertNoLegacyAppointmentOverlap(connection, appointmentColumns, schedule, slotDate, startTime, endTime) {
    if (!appointmentColumns) return;

    const where = [
        'doctor_id = ?',
        'service_id = ?',
        'appointment_date = ?',
        'appointment_time >= ?',
        'appointment_time < ?'
    ];
    const params = [schedule.doctor_id, schedule.service_id, slotDate, startTime, endTime];

    // فقط نوبت‌های قدیمی که به appointment_slots متصل نیستند بررسی می‌شوند؛
    // نوبت‌های متصل از طریق قفل و کنترل جدول appointment_slots پوشش داده شده‌اند.
    if (appointmentColumns.has('appointment_slot_id')) where.push('appointment_slot_id IS NULL');
    if (appointmentColumns.has('status')) where.push("COALESCE(status, 'pending') NOT IN ('cancelled', 'canceled', 'deleted', 'rejected')");

    const [rows] = await connection.query(
        `SELECT id FROM appointments WHERE ${where.join(' AND ')} LIMIT 1 FOR UPDATE`,
        params
    );
    if (rows.length) {
        const err = new Error('در این بازه برای پزشک و خدمت انتخاب‌شده یک نوبت ثبت‌شده وجود دارد');
        err.status = 409;
        err.code = 'APPOINTMENT_OVERLAP';
        throw err;
    }
}

function requireGeneratedSlots(generatedSlots) {
    const count = Number(generatedSlots || 0);
    if (Number.isFinite(count) && count > 0) return count;

    const err = new Error('هیچ نوبتی با اطلاعات واردشده تولید نشد؛ زمان‌بندی ذخیره نشد. تاریخ‌ها، روز هفته، ساعت‌ها و وضعیت فعال را بررسی کنید');
    err.status = 422;
    err.code = 'NO_SLOTS_GENERATED';
    throw err;
}

async function generateSlotsForSchedule(connection, scheduleId) {
    const [rows] = await connection.query('SELECT * FROM doctor_schedules WHERE id = ? LIMIT 1', [scheduleId]);
    const schedule = rows[0];
    if (!schedule || !Number(schedule.is_active) || !schedule.medical_center_id || !schedule.service_id) return 0;

    const startDate = formatDate(schedule.start_date || new Date());
    const duration = toPositiveInt(schedule.slot_duration_minutes || schedule.slot_duration, 30);
    const capacity = toPositiveInt(schedule.capacity_per_slot, 1);
    const startTime = normalizeTime(schedule.start_time);
    const endTime = resolveScheduleEndTime(schedule.start_time, schedule.end_time, duration);
    const day = Number(schedule.day_of_week);
    const recurring = Number(schedule.is_recurring) === 1;

    if (!duration || duration <= 0) {
        const err = new Error('مدت هر نوبت نامعتبر است');
        err.status = 400;
        throw err;
    }
    if (!capacity || capacity <= 0) {
        const err = new Error('ظرفیت هر نوبت نامعتبر است');
        err.status = 400;
        throw err;
    }

    // Recurring schedules must have an explicit end_date.
    // No silent 30-day fallback is allowed.
    if (recurring && !schedule.end_date) return 0;

    const endDateRaw = formatDate(schedule.end_date || startDate);
    const maxEnd = addDays(startDate, 365);
    const endDate = endDateRaw > maxEnd ? maxEnd : endDateRaw;
    const legacyAppointmentColumns = await getLegacyAppointmentOverlapColumns(connection);

    let created = 0;
    for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
        if (recurring && weekdayFromDate(d) !== day) continue;
        if (!recurring && d !== startDate) continue;

        for (let start = startTime; timeToMinutes(start) + duration <= timeToMinutes(endTime); start = timePlusMinutes(start, duration)) {
            const end = timePlusMinutes(start, duration);

            // رکورد دقیق همین برنامه/تاریخ/ساعت می‌تواند به‌روزرسانی شود؛
            // هر اسلات دیگری برای همان پزشک و خدمت، مستقل از مرکز، تداخل محسوب می‌شود.
            const [sameSlotRows] = await connection.query(
                `SELECT id
                 FROM appointment_slots
                 WHERE doctor_schedule_id = ? AND slot_date = ? AND start_time = ?
                 LIMIT 1
                 FOR UPDATE`,
                [scheduleId, d, start]
            );
            const sameSlotId = sameSlotRows[0]?.id || null;
            const excludeExactSql = sameSlotId ? ' AND id <> ?' : '';
            const overlapParams = [schedule.doctor_id, schedule.service_id, d, end, start];
            if (sameSlotId) overlapParams.push(sameSlotId);

            const [slotOverlap] = await connection.query(
                `SELECT id, doctor_schedule_id, medical_center_id, start_time, end_time
                 FROM appointment_slots
                 WHERE doctor_id = ?
                   AND service_id = ?
                   AND slot_date = ?
                   AND COALESCE(status, 'available') NOT IN ('cancelled', 'disabled', 'deleted')
                   AND start_time < ?
                   AND end_time > ?
                   ${excludeExactSql}
                 LIMIT 1
                 FOR UPDATE`,
                overlapParams
            );

            if (slotOverlap.length) {
                const err = new Error('برای این پزشک و خدمت در این ساعت قبلاً نوبت تولید شده است؛ مرکز متفاوت نیز مجاز نیست');
                err.status = 409;
                err.code = 'SLOT_OVERLAP';
                throw err;
            }

            await assertNoLegacyAppointmentOverlap(
                connection,
                legacyAppointmentColumns,
                schedule,
                d,
                start,
                end
            );

            await connection.query(
                `INSERT INTO appointment_slots
                 (doctor_schedule_id, doctor_id, medical_center_id, service_id, slot_date, start_time, end_time, capacity, booked_count, remaining_capacity, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'available')
                 ON DUPLICATE KEY UPDATE
                    doctor_id = VALUES(doctor_id),
                    medical_center_id = VALUES(medical_center_id),
                    service_id = VALUES(service_id),
                    end_time = VALUES(end_time),
                    capacity = IF(booked_count = 0, VALUES(capacity), capacity),
                    remaining_capacity = GREATEST(IF(booked_count = 0, VALUES(capacity), capacity) - booked_count, 0),
                    status = IF(status = 'disabled', 'disabled', IF(GREATEST(IF(booked_count = 0, VALUES(capacity), capacity) - booked_count, 0) > 0, 'available', 'full'))`,
                [scheduleId, schedule.doctor_id, schedule.medical_center_id, schedule.service_id, d, start, end, capacity, capacity]
            );
            created += 1;
        }
    }
    return created;
}

function normalizeCenter(row) {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        province: row.province,
        city: row.city,
        address: row.address,
        phone: row.phone,
        latitude: row.latitude,
        longitude: row.longitude,
        description: row.description,
        is_active: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function dbBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    return ['1', 'true', 'yes', 'on', 'enabled', 'فعال'].includes(String(value).trim().toLowerCase());
}

function normalizeService(row) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        category: row.category,
        description: row.description,
        default_capacity: Number(row.default_capacity || 1),
        default_duration_minutes: Number(row.default_duration_minutes || 30),
        default_fee: Number(row.default_fee || 0),
        is_free: dbBoolean(row.is_free),
        supplementary_insurance_enabled: dbBoolean(row.supplementary_insurance_enabled),
        supplementary_insurance_payment_mode: row.supplementary_insurance_payment_mode || 'none',
        supplementary_insurance_amount: Number(row.supplementary_insurance_amount || 0),
        supplementary_insurance_percent: Number(row.supplementary_insurance_percent || 0),
        supplementary_insurance_requires_review: dbBoolean(row.supplementary_insurance_requires_review, true),
        supplementary_insurance_attachment_required: dbBoolean(row.supplementary_insurance_attachment_required),
        supplementary_insurance_notice: row.supplementary_insurance_notice || null,
        is_active: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function normalizeSchedule(row) {
    return {
        id: row.id,
        doctor_id: row.doctor_id,
        doctor_name: row.doctor_name || row.full_name || null,
        medical_center_id: row.medical_center_id,
        medical_center_name: row.medical_center_name || null,
        service_id: row.service_id,
        service_name: row.service_name || null,
        day_of_week: Number(row.day_of_week),
        start_time: trimTime(row.start_time),
        end_time: trimTime(row.end_time),
        slot_duration_minutes: Number(row.slot_duration_minutes || row.slot_duration || 30),
        capacity_per_slot: Number(row.capacity_per_slot || 1),
        custom_fee: row.custom_fee === null || row.custom_fee === undefined ? null : Number(row.custom_fee),
        service_default_fee: Number(row.service_default_fee || 0),
        doctor_consultation_fee: Number(row.doctor_consultation_fee || 0),
        effective_fee: Number(row.effective_fee || 0),
        fee_source: row.fee_source || null,
        start_date: formatDate(row.start_date || ''),
        end_date: formatDate(row.end_date || ''),
        is_recurring: Boolean(row.is_recurring),
        is_active: Boolean(row.is_active),
        active_appointment_count: Number(row.active_appointment_count || 0),
        appointment_count: Number(row.appointment_count || 0),
        has_active_appointments: Number(row.active_appointment_count || 0) > 0,
        has_appointments: Number(row.appointment_count || 0) > 0,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function normalizeSlot(row) {
    return {
        id: row.id,
        doctor_schedule_id: row.doctor_schedule_id,
        doctor_id: row.doctor_id,
        doctor_name: row.doctor_name || null,
        medical_center_id: row.medical_center_id,
        medical_center_name: row.medical_center_name || null,
        service_id: row.service_id,
        service_name: row.service_name || null,
        slot_date: formatDate(row.slot_date),
        start_time: trimTime(row.start_time),
        end_time: trimTime(row.end_time),
        capacity: Number(row.capacity || 0),
        booked_count: Number(row.booked_count || 0),
        remaining_capacity: Number(row.remaining_capacity || 0),
        status: row.status,
        appointment_fee: Number(row.appointment_fee || row.resolved_amount || 0),
        fee_source: row.fee_source || null,
        supplementary_insurance_enabled: dbBoolean(row.supplementary_insurance_enabled),
        supplementary_insurance_payment_mode: row.supplementary_insurance_payment_mode || 'none',
        supplementary_insurance_amount: Number(row.supplementary_insurance_amount || 0),
        supplementary_insurance_percent: Number(row.supplementary_insurance_percent || 0),
        supplementary_insurance_requires_review: dbBoolean(row.supplementary_insurance_requires_review, true),
        supplementary_insurance_attachment_required: dbBoolean(row.supplementary_insurance_attachment_required),
        supplementary_insurance_notice: row.supplementary_insurance_notice || null,
        is_available: row.status === 'available' && Number(row.remaining_capacity || 0) > 0
    };
}

function handleError(res, error) {
    console.error('Appointment architecture API:', error);
    const migrationRequired = error?.code === 'MIGRATION_REQUIRED';
    res.status(migrationRequired ? 503 : (error.status || 500)).json({
        success: false,
        code: error?.code || 'APPOINTMENT_ERROR',
        message: migrationRequired
            ? 'ساختار دیتابیس نوبت‌دهی به‌روز نیست؛ دستور npm run migrate را اجرا کنید و سپس سرویس را دوباره راه‌اندازی کنید.'
            : (error.message || 'خطای داخلی سرور')
    });
}

// Medical centers
router.get('/medical-centers', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const includeInactive = ['1', 'true', 'all'].includes(String(req.query.include_inactive || req.query.all || '').toLowerCase());
        const [rows] = await pool.query(
            `SELECT * FROM medical_centers ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY is_active DESC, name ASC`
        );
        res.json({ success: true, centers: rows.map(normalizeCenter), medical_centers: rows.map(normalizeCenter) });
    } catch (error) { handleError(res, error); }
});

router.get('/medical-centers/:id', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const [rows] = await pool.query('SELECT * FROM medical_centers WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'مرکز درمانی یافت نشد' });
        res.json({ success: true, center: normalizeCenter(rows[0]) });
    } catch (error) { handleError(res, error); }
});

router.post('/medical-centers', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const name = cleanText(req.body.name, 200);
        if (!name) return res.status(400).json({ success: false, message: 'نام مرکز درمانی الزامی است' });
        const [result] = await pool.query(
            `INSERT INTO medical_centers (name, type, province, city, address, phone, latitude, longitude, description, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                ['clinic','hospital','treatment_center','surgery_center','other'].includes(req.body.type) ? req.body.type : 'clinic',
                cleanText(req.body.province, 100),
                cleanText(req.body.city, 100),
                cleanText(req.body.address, 2000),
                cleanText(req.body.phone, 50),
                req.body.latitude || null,
                req.body.longitude || null,
                cleanText(req.body.description, 2000),
                toBool(req.body.is_active, true)
            ]
        );
        res.status(201).json({ success: true, id: result.insertId, message: 'مرکز درمانی ثبت شد' });
    } catch (error) { handleError(res, error); }
});

router.patch('/medical-centers/:id', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        await updateDynamic(pool, 'medical_centers', {
            name: req.body.name ? cleanText(req.body.name, 200) : undefined,
            type: ['clinic','hospital','treatment_center','surgery_center','other'].includes(req.body.type) ? req.body.type : undefined,
            province: req.body.province !== undefined ? cleanText(req.body.province, 100) : undefined,
            city: req.body.city !== undefined ? cleanText(req.body.city, 100) : undefined,
            address: req.body.address !== undefined ? cleanText(req.body.address, 2000) : undefined,
            phone: req.body.phone !== undefined ? cleanText(req.body.phone, 50) : undefined,
            latitude: req.body.latitude !== undefined ? req.body.latitude || null : undefined,
            longitude: req.body.longitude !== undefined ? req.body.longitude || null : undefined,
            description: req.body.description !== undefined ? cleanText(req.body.description, 2000) : undefined,
            is_active: req.body.is_active !== undefined ? toBool(req.body.is_active, true) : undefined
        }, 'WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'مرکز درمانی به‌روزرسانی شد' });
    } catch (error) { handleError(res, error); }
});

router.delete('/medical-centers/:id', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        await pool.query('UPDATE medical_centers SET is_active = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'مرکز درمانی غیرفعال شد' });
    } catch (error) { handleError(res, error); }
});

// Services
router.get('/services', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const includeInactive = ['1', 'true', 'all'].includes(String(req.query.include_inactive || req.query.all || '').toLowerCase());
        const [rows] = await pool.query(
            `SELECT * FROM services ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY is_active DESC, category ASC, name ASC`
        );
        res.json({ success: true, services: rows.map(normalizeService) });
    } catch (error) { handleError(res, error); }
});

router.get('/services/:id', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const [rows] = await pool.query('SELECT * FROM services WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'خدمت یافت نشد' });
        res.json({ success: true, service: normalizeService(rows[0]) });
    } catch (error) { handleError(res, error); }
});

router.post('/services', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const name = cleanText(req.body.name, 200);
        if (!name) return res.status(400).json({ success: false, message: 'نام خدمت الزامی است' });
        const capacity = Number(req.body.default_capacity || 1);
        const duration = Number(req.body.default_duration_minutes || 30);
        const defaultFee = toMoney(req.body.default_fee, 0, false);
        const isFree = toBool(req.body.is_free, false);
        if (capacity <= 0 || duration <= 0) return res.status(400).json({ success: false, message: 'ظرفیت و مدت خدمت باید مثبت باشند' });
        const slug = makeSlug(req.body.slug || name);
        const policy = insurancePolicy.servicePolicyFromBody(req.body);
        const result = await insertDynamic(pool, 'services', {
            name,
            slug,
            category: cleanText(req.body.category, 100),
            description: cleanText(req.body.description, 2000),
            default_capacity: Math.floor(capacity),
            default_duration_minutes: Math.floor(duration),
            default_fee: isFree ? 0 : defaultFee,
            is_free: isFree,
            is_active: toBool(req.body.is_active, true),
            ...policy
        });
        res.status(201).json({ success: true, id: result.insertId, message: 'خدمت ثبت شد' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') error.message = 'slug این خدمت تکراری است';
        handleError(res, error);
    }
});

router.patch('/services/:id', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        await updateDynamic(pool, 'services', {
            name: req.body.name ? cleanText(req.body.name, 200) : undefined,
            slug: req.body.slug ? makeSlug(req.body.slug) : undefined,
            category: req.body.category !== undefined ? cleanText(req.body.category, 100) : undefined,
            description: req.body.description !== undefined ? cleanText(req.body.description, 2000) : undefined,
            default_capacity: req.body.default_capacity !== undefined ? Math.max(1, Number(req.body.default_capacity || 1)) : undefined,
            default_duration_minutes: req.body.default_duration_minutes !== undefined ? Math.max(1, Number(req.body.default_duration_minutes || 30)) : undefined,
            default_fee: req.body.is_free !== undefined && toBool(req.body.is_free, false) ? 0 : (req.body.default_fee !== undefined ? toMoney(req.body.default_fee, 0, false) : undefined),
            is_free: req.body.is_free !== undefined ? toBool(req.body.is_free, false) : undefined,
            is_active: req.body.is_active !== undefined ? toBool(req.body.is_active, true) : undefined,
            ...(req.body.supplementary_insurance_enabled !== undefined
                || req.body.supplementary_insurance_payment_mode !== undefined
                || req.body.supplementary_insurance_amount !== undefined
                || req.body.supplementary_insurance_percent !== undefined
                || req.body.supplementary_insurance_requires_review !== undefined
                || req.body.supplementary_insurance_attachment_required !== undefined
                || req.body.supplementary_insurance_notice !== undefined
                ? insurancePolicy.servicePolicyFromBody(req.body) : {})
        }, 'WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'خدمت به‌روزرسانی شد' });
    } catch (error) { handleError(res, error); }
});

router.delete('/services/:id', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        await pool.query('UPDATE services SET is_active = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'خدمت غیرفعال شد' });
    } catch (error) { handleError(res, error); }
});

// Doctor-centers
router.get('/doctors/:doctorId/medical-centers', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const [rows] = await pool.query(
            `SELECT mc.*, dmc.is_active AS relation_active
             FROM doctor_medical_centers dmc
             JOIN medical_centers mc ON mc.id = dmc.medical_center_id
             WHERE dmc.doctor_id = ? AND dmc.is_active = 1 AND mc.is_active = 1
             ORDER BY mc.name ASC`,
            [req.params.doctorId]
        );
        res.json({ success: true, centers: rows.map(normalizeCenter), medical_centers: rows.map(normalizeCenter) });
    } catch (error) { handleError(res, error); }
});

router.post('/doctors/:doctorId/medical-centers', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const doctorId = Number(req.params.doctorId);
        await assertActiveDoctor(pool, doctorId);
        const ids = Array.isArray(req.body.medical_center_ids) ? req.body.medical_center_ids : [req.body.medical_center_id || req.body.center_id];
        for (const id of ids.map(Number).filter(Boolean)) {
            await assertActiveCenter(pool, id);
            await pool.query(
                `INSERT INTO doctor_medical_centers (doctor_id, medical_center_id, is_active)
                 VALUES (?, ?, 1)
                 ON DUPLICATE KEY UPDATE is_active = 1, updated_at = CURRENT_TIMESTAMP`,
                [doctorId, id]
            );
        }
        res.json({ success: true, message: 'ارتباط پزشک و مرکز درمانی ذخیره شد' });
    } catch (error) { handleError(res, error); }
});

router.delete('/doctors/:doctorId/medical-centers/:centerId', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        await pool.query('UPDATE doctor_medical_centers SET is_active = 0 WHERE doctor_id = ? AND medical_center_id = ?', [req.params.doctorId, req.params.centerId]);
        res.json({ success: true, message: 'ارتباط پزشک و مرکز درمانی غیرفعال شد' });
    } catch (error) { handleError(res, error); }
});

// Schedules
router.get('/doctor-schedules', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const where = [];
        const params = [];
        if (req.query.doctor_id) { where.push('ds.doctor_id = ?'); params.push(req.query.doctor_id); }
        if (req.query.medical_center_id) { where.push('ds.medical_center_id = ?'); params.push(req.query.medical_center_id); }
        if (req.query.service_id) { where.push('ds.service_id = ?'); params.push(req.query.service_id); }
        if (req.query.day_of_week !== undefined && String(req.query.day_of_week).trim() !== '') {
            where.push('ds.day_of_week = ?');
            params.push(Number(req.query.day_of_week));
        }
        if (req.query.is_active !== undefined && String(req.query.is_active).trim() !== '') {
            where.push('ds.is_active = ?');
            params.push(toBool(req.query.is_active, true));
        }
        // بازه انتخاب‌شده باید با بازه فعالیت برنامه هم‌پوشانی داشته باشد.
        if (req.query.date_from) {
            where.push('COALESCE(ds.end_date, ds.start_date) >= ?');
            params.push(req.query.date_from);
        }
        if (req.query.date_to) {
            where.push('ds.start_date <= ?');
            params.push(req.query.date_to);
        }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(
            `SELECT ds.*,
                    COALESCE(du.full_name, d.full_name, du.username) AS doctor_name,
                    mc.name AS medical_center_name,
                    s.name AS service_name,
                    COALESCE(s.default_fee, 0) AS service_default_fee,
                    COALESCE(d.consultation_fee, 0) AS doctor_consultation_fee,
                    CASE WHEN COALESCE(s.is_free,0)=1 THEN 0 ELSE COALESCE(NULLIF(ds.custom_fee, 0), NULLIF(s.default_fee, 0), NULLIF(d.consultation_fee, 0), 0) END AS effective_fee,
                    CASE
                        WHEN COALESCE(s.is_free,0)=1 THEN 'free'
                        WHEN COALESCE(ds.custom_fee, 0) > 0 THEN 'schedule'
                        WHEN COALESCE(s.default_fee, 0) > 0 THEN 'service'
                        WHEN COALESCE(d.consultation_fee, 0) > 0 THEN 'doctor'
                        ELSE 'none'
                    END AS fee_source,
                    COALESCE((
                        SELECT SUM(COALESCE(aps2.booked_count, 0))
                        FROM appointment_slots aps2
                        WHERE aps2.doctor_schedule_id = ds.id
                    ), 0) AS active_appointment_count,
                    COALESCE((
                        SELECT COUNT(*)
                        FROM appointments a2
                        JOIN appointment_slots aps3 ON aps3.id = a2.appointment_slot_id
                        WHERE aps3.doctor_schedule_id = ds.id
                    ), 0) AS appointment_count
             FROM doctor_schedules ds
             LEFT JOIN doctors d ON d.id = ds.doctor_id
             LEFT JOIN users du ON du.id = d.user_id
             LEFT JOIN medical_centers mc ON mc.id = ds.medical_center_id
             LEFT JOIN services s ON s.id = ds.service_id
             ${whereSql}
             ORDER BY ds.day_of_week ASC, ds.start_time ASC, ds.id DESC`,
            params
        );
        res.json({ success: true, schedules: rows.map(normalizeSchedule) });
    } catch (error) { handleError(res, error); }
});

router.get('/doctor-schedules/:id', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const [rows] = await pool.query(
            `SELECT ds.*,
                    COALESCE(du.full_name, d.full_name, du.username) AS doctor_name,
                    mc.name AS medical_center_name,
                    s.name AS service_name,
                    COALESCE(s.default_fee, 0) AS service_default_fee,
                    COALESCE(d.consultation_fee, 0) AS doctor_consultation_fee,
                    CASE WHEN COALESCE(s.is_free,0)=1 THEN 0 ELSE COALESCE(NULLIF(ds.custom_fee, 0), NULLIF(s.default_fee, 0), NULLIF(d.consultation_fee, 0), 0) END AS effective_fee,
                    CASE
                        WHEN COALESCE(s.is_free,0)=1 THEN 'free'
                        WHEN COALESCE(ds.custom_fee, 0) > 0 THEN 'schedule'
                        WHEN COALESCE(s.default_fee, 0) > 0 THEN 'service'
                        WHEN COALESCE(d.consultation_fee, 0) > 0 THEN 'doctor'
                        ELSE 'none'
                    END AS fee_source,
                    COALESCE((
                        SELECT SUM(COALESCE(aps2.booked_count, 0))
                        FROM appointment_slots aps2
                        WHERE aps2.doctor_schedule_id = ds.id
                    ), 0) AS active_appointment_count,
                    COALESCE((
                        SELECT COUNT(*)
                        FROM appointments a2
                        JOIN appointment_slots aps3 ON aps3.id = a2.appointment_slot_id
                        WHERE aps3.doctor_schedule_id = ds.id
                    ), 0) AS appointment_count
             FROM doctor_schedules ds
             LEFT JOIN doctors d ON d.id = ds.doctor_id
             LEFT JOIN users du ON du.id = d.user_id
             LEFT JOIN medical_centers mc ON mc.id = ds.medical_center_id
             LEFT JOIN services s ON s.id = ds.service_id
             WHERE ds.id = ? LIMIT 1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'زمان‌بندی یافت نشد' });
        res.json({ success: true, schedule: normalizeSchedule(rows[0]) });
    } catch (error) { handleError(res, error); }
});

router.post('/doctor-schedules', ...managerOnly, async (req, res) => {
    let connection;
    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);
        const data = await validateSchedulePayload(connection, req.body);
        const result = await insertDynamic(connection, 'doctor_schedules', data);
        const generated_slots = requireGeneratedSlots(await generateSlotsForSchedule(connection, result.insertId));
        await connection.commit();
        res.status(201).json({ success: true, id: result.insertId, generated_slots, message: 'زمان‌بندی پزشک ثبت شد و نوبت‌ها تولید شدند' });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
});

router.patch('/doctor-schedules/:id', ...managerOnly, async (req, res) => {
    let connection;
    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);
        const id = Number(req.params.id);
        const [existingRows] = await connection.query('SELECT id FROM doctor_schedules WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
        if (!existingRows.length) {
            const err = new Error('زمان‌بندی یافت نشد');
            err.status = 404;
            throw err;
        }
        if (await scheduleHasAppointments(connection, id)) {
            const err = new Error('این زمان‌بندی دارای نوبت ثبت‌شده یا سابقه رزرو است و قابل ویرایش نیست. برنامه قبلی را غیرفعال کرده و زمان‌بندی جدیدی ایجاد کنید.');
            err.status = 409;
            throw err;
        }
        const data = await validateSchedulePayload(connection, req.body, id);
        await updateDynamic(connection, 'doctor_schedules', data, 'WHERE id = ?', [id]);
        await connection.query('DELETE FROM appointment_slots WHERE doctor_schedule_id = ? AND booked_count = 0', [id]);
        const generated_slots = requireGeneratedSlots(await generateSlotsForSchedule(connection, id));
        await connection.commit();
        res.json({ success: true, generated_slots, message: 'زمان‌بندی پزشک به‌روزرسانی شد و نوبت‌ها تولید شدند' });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
});

router.delete('/doctor-schedules/:id', ...managerOnly, async (req, res) => {
    let connection;
    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);

        const result = await hardDeleteScheduleWithSlots(connection, Number(req.params.id));
        if (!result.exists) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'زمان‌بندی یافت نشد' });
        }

        await connection.commit();
        res.json({
            success: true,
            ...result,
            message: result.hardDeleted
                ? `زمان‌بندی حذف شد و ${result.slotsDeleted} نوبت مرتبط حذف شد`
                : 'این زمان‌بندی رزرو دارد؛ حذف نشد، رزروها و پرداخت‌ها حفظ شدند و فقط پذیرش جدید غیرفعال شد'
        });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
});

// Appointment slots

async function buildSlotPositions(poolOrConnection, slots) {
    const expanded = [];
    const positionStates = await getSlotPositionStateMap(poolOrConnection, slots.map(slot => slot.id));

    for (const slot of slots) {
        const normalizedSlot = normalizeSlot(slot);
        const capacity = Math.max(Number(slot.capacity || 1), 1);
        const base = await dailyQueueBaseForSlot(poolOrConnection, slot);

        const [appointments] = await poolOrConnection.query(
            `SELECT a.id,
                    a.appointment_slot_id,
                    a.appointment_queue_number,
                    a.status,
                    a.tracking_code,
                    COALESCE(p.full_name, p.username, pu.full_name, pu.username) AS patient_name,
                    COALESCE(p.phone, p.mobile, pu.phone) AS patient_phone
             FROM appointments a
             LEFT JOIN patients p ON p.id = a.patient_id
             LEFT JOIN users pu ON pu.id = p.user_id
             WHERE a.appointment_slot_id = ?
               AND ${activeAppointmentStatusSql('a')}
             ORDER BY a.appointment_queue_number ASC`,
            [slot.id]
        );

        const byQueue = new Map();
        for (const appointment of appointments) {
            const queue = Number(appointment.appointment_queue_number || 0);
            if (queue > 0) byQueue.set(queue, appointment);
        }

        for (let position = 1; position <= capacity; position += 1) {
            const dailyQueueNumber = base + position;
            const appointment = byQueue.get(dailyQueueNumber) || null;

            expanded.push({
                id: `${slot.id}-${position}`,
                slot_id: slot.id,
                doctor_schedule_id: slot.doctor_schedule_id,
                doctor_id: slot.doctor_id,
                doctor_name: normalizedSlot.doctor_name,
                medical_center_id: slot.medical_center_id,
                medical_center_name: normalizedSlot.medical_center_name,
                service_id: slot.service_id,
                service_name: normalizedSlot.service_name,
                slot_date: normalizedSlot.slot_date,
                start_time: normalizedSlot.start_time,
                end_time: normalizedSlot.end_time,
                capacity,
                position_in_slot: position,
                appointment_queue_number: dailyQueueNumber,
                daily_queue_number: dailyQueueNumber,
                appointment_id: appointment?.id || null,
                patient_name: appointment?.patient_name || null,
                patient_phone: appointment?.patient_phone || null,
                tracking_code: appointment?.tracking_code || null,
                appointment_status: appointment?.status || null,
                status: appointment
                    ? 'booked'
                    : (positionStates.get(`${slot.id}:${position}`) === 'deleted'
                        ? 'deleted'
                        : (positionStates.get(`${slot.id}:${position}`) === 'disabled'
                            ? 'disabled'
                            : (slot.status === 'disabled' || slot.status === 'cancelled' ? slot.status : 'available'))),
                position_status: positionStates.get(`${slot.id}:${position}`) || null,
                is_booked: Boolean(appointment),
                remaining_capacity: normalizedSlot.remaining_capacity,
                booked_count: normalizedSlot.booked_count,
                source_slot: normalizedSlot
            });
        }
    }

    return expanded;
}

router.get('/appointment-slots', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const expandPositions = String(req.query.expand_positions || req.query.expand || '') === '1';
        const requestedStatus = String(req.query.status || '').toLowerCase();
        const where = [];
        const params = [];
        if (req.query.doctor_id) { where.push('aps.doctor_id = ?'); params.push(req.query.doctor_id); }
        if (req.query.medical_center_id) { where.push('aps.medical_center_id = ?'); params.push(req.query.medical_center_id); }
        if (req.query.service_id) { where.push('aps.service_id = ?'); params.push(req.query.service_id); }
        // در حالت نمایش جایگاه‌های ظرفیت، وضعیت هر ردیف ممکن است مستقل از status رکورد مادر باشد.
        // بنابراین فیلتر وضعیت بعد از expand اعمال می‌شود.
        if (requestedStatus && !expandPositions) { where.push('aps.status = ?'); params.push(requestedStatus); }
        if (req.query.date_from) { where.push('aps.slot_date >= ?'); params.push(req.query.date_from); }
        if (req.query.date_to) { where.push('aps.slot_date <= ?'); params.push(req.query.date_to); }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(
            `SELECT aps.*,
                    GREATEST(aps.remaining_capacity - COALESCE(payment_holds.active_holds, 0), 0) AS effective_remaining_capacity,
                    COALESCE(du.full_name, d.full_name, du.username) AS doctor_name,
                    mc.name AS medical_center_name,
                    s.name AS service_name,
                    s.supplementary_insurance_enabled,
                    s.supplementary_insurance_payment_mode,
                    s.supplementary_insurance_amount,
                    s.supplementary_insurance_percent,
                    s.supplementary_insurance_requires_review,
                    s.supplementary_insurance_attachment_required,
                    s.supplementary_insurance_notice,
                    CASE WHEN COALESCE(s.is_free,0)=1 THEN 0 ELSE COALESCE(NULLIF(ds.custom_fee, 0), NULLIF(s.default_fee, 0), NULLIF(d.consultation_fee, 0), 0) END AS appointment_fee,
                    CASE
                        WHEN COALESCE(s.is_free,0)=1 THEN 'free'
                        WHEN COALESCE(ds.custom_fee, 0) > 0 THEN 'schedule'
                        WHEN COALESCE(s.default_fee, 0) > 0 THEN 'service'
                        WHEN COALESCE(d.consultation_fee, 0) > 0 THEN 'doctor'
                        ELSE 'none'
                    END AS fee_source
             FROM appointment_slots aps
             LEFT JOIN doctor_schedules ds ON ds.id = aps.doctor_schedule_id
             LEFT JOIN (
                 SELECT appointment_slot_id, COUNT(*) AS active_holds
                 FROM appointment_payment_reservations
                 WHERE status='pending' AND expires_at>UTC_TIMESTAMP()
                 GROUP BY appointment_slot_id
             ) payment_holds ON payment_holds.appointment_slot_id = aps.id
             LEFT JOIN doctors d ON d.id = aps.doctor_id
             LEFT JOIN users du ON du.id = d.user_id
             LEFT JOIN medical_centers mc ON mc.id = aps.medical_center_id
             LEFT JOIN services s ON s.id = aps.service_id
             ${whereSql}
             ORDER BY aps.slot_date ASC, aps.start_time ASC
             LIMIT 500`,
            params
        );

        if (expandPositions) {
            let positions = await buildSlotPositions(pool, rows);
            if (requestedStatus) {
                positions = positions.filter(position => String(position.status || '').toLowerCase() === requestedStatus);
            }
            return res.json({ success: true, slots: rows.map(normalizeSlot), positions });
        }

        res.json({
            success: true,
            slots: rows.map(row => normalizeSlot({
                ...row,
                remaining_capacity: row.effective_remaining_capacity
            }))
        });
    } catch (error) { handleError(res, error); }
});

async function updateSlotStatusHandler(req, res) {
    try {
        const pool = await ensureAndGetPool();
        await ensureAppointmentArchitecture(pool);

        const ref = parseSlotPositionRef(req.params.id);
        const id = ref.slotId;
        const status = String(req.body.status || req.body.next_status || '').toLowerCase();

        if (!id) {
            return res.status(400).json({ success: false, message: 'شناسه نوبت نامعتبر است' });
        }

        if (!['available', 'disabled', 'cancelled', 'canceled'].includes(status)) {
            return res.status(400).json({ success: false, message: 'وضعیت نوبت نامعتبر است' });
        }

        if (ref.isPosition) {
            let connection;
            try {
                connection = await pool.getConnection();
                await connection.beginTransaction();
                const result = await setSlotPositionStatus(connection, ref, status);
                await connection.commit();
                return res.json(result);
            } catch (error) {
                if (connection) await connection.rollback();
                throw error;
            } finally {
                if (connection) connection.release();
            }
        }

        const [rows] = await pool.query('SELECT * FROM appointment_slots WHERE id = ? LIMIT 1', [id]);
        const slot = rows[0];
        if (!slot) {
            return res.status(404).json({ success: false, message: 'نوبت پیدا نشد' });
        }

        const bookedCount = Number(slot.booked_count || 0);
        const capacity = Math.max(Number(slot.capacity || 1), 1);
        const remaining = Math.max(capacity - bookedCount, 0);

        if ((status === 'cancelled' || status === 'canceled') && bookedCount > 0) {
            return res.status(409).json({
                success: false,
                message: 'این ساعت نوبت رزروشده دارد؛ ابتدا نوبت‌های بیماران را لغو کنید'
            });
        }

        let finalStatus = status === 'canceled' ? 'cancelled' : status;
        if (finalStatus === 'available') {
            finalStatus = remaining > 0 ? 'available' : 'full';
        }

        await pool.query(
            'UPDATE appointment_slots SET status = ?, remaining_capacity = ?, booked_count = ? WHERE id = ?',
            [finalStatus, remaining, bookedCount, id]
        );

        res.json({
            success: true,
            id,
            status: finalStatus,
            message: finalStatus === 'available'
                ? 'نوبت فعال شد'
                : finalStatus === 'disabled'
                    ? 'نوبت غیرفعال شد'
                    : 'نوبت لغو شد'
        });
    } catch (error) {
        handleError(res, error);
    }
}

async function hardDeleteSlotHandler(req, res) {
    try {
        const pool = await ensureAndGetPool();
        await ensureAppointmentArchitecture(pool);

        const ref = parseSlotPositionRef(req.params.id);
        const id = ref.slotId;
        if (!id) {
            return res.status(400).json({ success: false, message: 'شناسه نوبت نامعتبر است' });
        }

        if (ref.isPosition) {
            let connection;
            try {
                connection = await pool.getConnection();
                await connection.beginTransaction();
                const result = await deleteSlotPosition(connection, ref);
                await connection.commit();
                return res.json(result);
            } catch (error) {
                if (connection) await connection.rollback();
                throw error;
            } finally {
                if (connection) connection.release();
            }
        }

        const [rows] = await pool.query('SELECT id, booked_count FROM appointment_slots WHERE id = ? LIMIT 1', [id]);
        const slot = rows[0];
        if (!slot) {
            return res.status(404).json({ success: false, message: 'نوبت پیدا نشد' });
        }

        if (Number(slot.booked_count || 0) > 0) {
            return res.status(409).json({
                success: false,
                message: 'این نوبت رزرو دارد و قابل حذف نیست؛ ابتدا رزروهای بیمار را لغو کنید'
            });
        }

        await pool.query('DELETE FROM appointment_slots WHERE id = ?', [id]);
        res.json({ success: true, id, message: 'نوبت حذف شد' });
    } catch (error) {
        handleError(res, error);
    }
}

router.post('/appointment-slots/:id/status', ...managerOnly, updateSlotStatusHandler);
router.patch('/appointment-slots/:id/status', ...managerOnly, updateSlotStatusHandler);
router.post('/appointment-slots/:id/toggle-status', ...managerOnly, updateSlotStatusHandler);
router.post('/appointment-slots/:id/hard-delete', ...managerOnly, hardDeleteSlotHandler);
router.delete('/appointment-slots/:id', ...managerOnly, hardDeleteSlotHandler);


router.get('/appointment-slots/available', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const today = new Date().toISOString().slice(0, 10);
        const where = [
            'aps.status = "available"',
            'aps.remaining_capacity > 0',
            'GREATEST(aps.remaining_capacity - COALESCE(payment_holds.active_holds, 0), 0) > 0',
            'aps.slot_date >= ?',
            'COALESCE(ds.is_active, 0) = 1'
        ];
        const params = [req.query.date_from || today];
        if (req.query.date_to) { where.push('aps.slot_date <= ?'); params.push(req.query.date_to); }
        if (req.query.doctor_id) { where.push('aps.doctor_id = ?'); params.push(req.query.doctor_id); }
        if (req.query.medical_center_id) { where.push('aps.medical_center_id = ?'); params.push(req.query.medical_center_id); }
        if (req.query.service_id) { where.push('aps.service_id = ?'); params.push(req.query.service_id); }

        // The booking wizard needs an accurate service catalogue before a service
        // is selected. Return grouped availability without the normal row limit.
        if (String(req.query.summary || '').toLowerCase() === 'service') {
            const [services] = await pool.query(
                `SELECT s.id,
                        s.name,
                        s.slug,
                        s.category,
                        s.description,
                        s.default_capacity,
                        s.default_duration_minutes,
                        s.default_fee,
                        s.is_free,
                        s.is_active,
                        s.supplementary_insurance_enabled,
                        s.supplementary_insurance_payment_mode,
                        s.supplementary_insurance_amount,
                        s.supplementary_insurance_percent,
                        s.supplementary_insurance_requires_review,
                        s.supplementary_insurance_attachment_required,
                        s.supplementary_insurance_notice,
                        MIN(CASE WHEN COALESCE(s.is_free,0)=1 THEN 0 ELSE COALESCE(NULLIF(ds.custom_fee, 0), NULLIF(s.default_fee, 0), NULLIF(d.consultation_fee, 0), 0) END) AS minimum_fee,
                        MAX(CASE WHEN COALESCE(s.is_free,0)=1 THEN 0 ELSE COALESCE(NULLIF(ds.custom_fee, 0), NULLIF(s.default_fee, 0), NULLIF(d.consultation_fee, 0), 0) END) AS maximum_fee,
                        SUM(GREATEST(aps.remaining_capacity - COALESCE(payment_holds.active_holds, 0), 0)) AS available_count,
                        COUNT(DISTINCT aps.id) AS available_slot_count,
                        MIN(aps.slot_date) AS first_available_date,
                        MIN(CONCAT(aps.slot_date, ' ', aps.start_time)) AS first_available_at
                 FROM appointment_slots aps
                 JOIN doctor_schedules ds ON ds.id = aps.doctor_schedule_id
                 LEFT JOIN (
                     SELECT appointment_slot_id, COUNT(*) AS active_holds
                     FROM appointment_payment_reservations
                     WHERE status='pending' AND expires_at>UTC_TIMESTAMP()
                     GROUP BY appointment_slot_id
                 ) payment_holds ON payment_holds.appointment_slot_id = aps.id
                 JOIN medical_centers mc ON mc.id = aps.medical_center_id AND mc.is_active = 1
                 JOIN services s ON s.id = aps.service_id AND s.is_active = 1
                 LEFT JOIN doctors d ON d.id = aps.doctor_id
                 WHERE ${where.join(' AND ')}
                 GROUP BY s.id, s.name, s.slug, s.category, s.description,
                          s.default_capacity, s.default_duration_minutes, s.default_fee, s.is_free, s.is_active,
                          s.supplementary_insurance_enabled, s.supplementary_insurance_payment_mode,
                          s.supplementary_insurance_amount, s.supplementary_insurance_percent,
                          s.supplementary_insurance_requires_review, s.supplementary_insurance_attachment_required,
                          s.supplementary_insurance_notice
                 ORDER BY first_available_at ASC, s.name ASC`,
                params
            );
            return res.json({
                success: true,
                services: services.map(row => ({
                    ...normalizeService(row),
                    available_count: Number(row.available_count || 0),
                    available_slot_count: Number(row.available_slot_count || 0),
                    first_available_date: row.first_available_date || null,
                    first_available_at: row.first_available_at || null,
                    minimum_fee: Number(row.minimum_fee || 0),
                    maximum_fee: Number(row.maximum_fee || 0)
                }))
            });
        }

        const requestedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(requestedLimit, 1), 1000)
            : 200;
        const queryParams = [...params, limit];
        const [rows] = await pool.query(
            `SELECT aps.*,
                    COALESCE(du.full_name, d.full_name, du.username) AS doctor_name,
                    mc.name AS medical_center_name,
                    s.name AS service_name,
                    s.supplementary_insurance_enabled,
                    s.supplementary_insurance_payment_mode,
                    s.supplementary_insurance_amount,
                    s.supplementary_insurance_percent,
                    s.supplementary_insurance_requires_review,
                    s.supplementary_insurance_attachment_required,
                    s.supplementary_insurance_notice,
                    CASE WHEN COALESCE(s.is_free,0)=1 THEN 0 ELSE COALESCE(NULLIF(ds.custom_fee, 0), NULLIF(s.default_fee, 0), NULLIF(d.consultation_fee, 0), 0) END AS appointment_fee,
                    CASE
                        WHEN COALESCE(s.is_free,0)=1 THEN 'free'
                        WHEN COALESCE(ds.custom_fee, 0) > 0 THEN 'schedule'
                        WHEN COALESCE(s.default_fee, 0) > 0 THEN 'service'
                        WHEN COALESCE(d.consultation_fee, 0) > 0 THEN 'doctor'
                        ELSE 'none'
                    END AS fee_source
             FROM appointment_slots aps
             JOIN doctor_schedules ds ON ds.id = aps.doctor_schedule_id
             LEFT JOIN (
                 SELECT appointment_slot_id, COUNT(*) AS active_holds
                 FROM appointment_payment_reservations
                 WHERE status='pending' AND expires_at>UTC_TIMESTAMP()
                 GROUP BY appointment_slot_id
             ) payment_holds ON payment_holds.appointment_slot_id = aps.id
             LEFT JOIN doctors d ON d.id = aps.doctor_id
             LEFT JOIN users du ON du.id = d.user_id
             JOIN medical_centers mc ON mc.id = aps.medical_center_id AND mc.is_active = 1
             JOIN services s ON s.id = aps.service_id AND s.is_active = 1
             WHERE ${where.join(' AND ')}
             ORDER BY aps.slot_date ASC, aps.start_time ASC
             LIMIT ?`,
            queryParams
        );
        res.json({ success: true, slots: rows.map(normalizeSlot) });
    } catch (error) { handleError(res, error); }
});


function activeAppointmentStatusSql(alias = '') {
    const prefix = alias ? `${alias}.` : '';
    return `COALESCE(${prefix}status, 'pending') NOT IN ('cancelled','canceled','deleted','rejected')`;
}


function parseSlotPositionRef(value) {
    const text = String(value ?? '').trim();
    const match = text.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) return { slotId: 0, position: null, isPosition: false };
    const slotId = Number(match[1]);
    const position = match[2] ? Number(match[2]) : null;
    return {
        slotId: Number.isFinite(slotId) ? slotId : 0,
        position: Number.isFinite(position) ? position : null,
        isPosition: position !== null && Number.isFinite(position)
    };
}

async function ensureSlotPositionStateTable(connection) {
    return assertSchema(connection, 'slot position states', {
        appointment_slot_position_states: [
            'id', 'slot_id', 'position_in_slot', 'status', 'created_at', 'updated_at'
        ]
    });
}

async function getSlotPositionStateMap(connection, slotIds) {
    const ids = [...new Set((slotIds || []).map(Number).filter(Boolean))];
    const map = new Map();
    if (!ids.length) return map;
    await ensureSlotPositionStateTable(connection);
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await connection.query(
        `SELECT slot_id, position_in_slot, status
         FROM appointment_slot_position_states
         WHERE slot_id IN (${placeholders})`,
        ids
    );
    for (const row of rows) {
        map.set(`${Number(row.slot_id)}:${Number(row.position_in_slot)}`, String(row.status || '').toLowerCase());
    }
    return map;
}

async function appointmentForSlotPosition(connection, slot, position, lock = false) {
    const capacity = Math.max(Number(slot.capacity || 1), 1);
    const positionNumber = Number(position || 0);
    if (!positionNumber || positionNumber < 1 || positionNumber > capacity) return null;

    const base = await dailyQueueBaseForSlot(connection, slot);
    const queueNumber = base + positionNumber;
    const [rows] = await connection.query(
        `SELECT id, status, appointment_queue_number
         FROM appointments
         WHERE appointment_slot_id = ?
           AND appointment_queue_number = ?
           AND ${activeAppointmentStatusSql()}
         LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [slot.id, queueNumber]
    );
    return rows[0] || null;
}

async function materializeDisabledSlotPositions(connection, slot, exceptPosition = null) {
    if (String(slot.status || '').toLowerCase() !== 'disabled') return;

    const capacity = Math.max(Number(slot.capacity || 1), 1);
    for (let position = 1; position <= capacity; position += 1) {
        if (Number(exceptPosition || 0) === position) continue;
        await connection.query(
            `INSERT IGNORE INTO appointment_slot_position_states (slot_id, position_in_slot, status)
             VALUES (?, ?, 'disabled')`,
            [slot.id, position]
        );
    }
}

async function recalculateSlotAggregate(connection, slotId) {
    await ensureSlotPositionStateTable(connection);

    const [slotRows] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? LIMIT 1', [slotId]);
    const slot = slotRows[0];
    if (!slot) return null;

    const capacity = Math.max(Number(slot.capacity || 1), 1);
    const [[bookedRow]] = await connection.query(
        `SELECT COUNT(*) AS booked_count
         FROM appointments
         WHERE appointment_slot_id = ?
           AND ${activeAppointmentStatusSql()}`,
        [slotId]
    );
    const bookedCount = Math.max(Number(bookedRow?.booked_count || 0), 0);

    const [[blockedRow]] = await connection.query(
        `SELECT COUNT(*) AS blocked_count
         FROM appointment_slot_position_states
         WHERE slot_id = ?
           AND position_in_slot BETWEEN 1 AND ?
           AND status IN ('disabled', 'deleted')`,
        [slotId, capacity]
    );
    const blockedCount = Math.max(Number(blockedRow?.blocked_count || 0), 0);
    const activeCapacity = Math.max(capacity - blockedCount, 0);
    const remaining = Math.max(activeCapacity - bookedCount, 0);
    const finalStatus = activeCapacity <= 0 ? 'disabled' : (remaining > 0 ? 'available' : 'full');

    await connection.query(
        'UPDATE appointment_slots SET booked_count = ?, remaining_capacity = ?, status = ? WHERE id = ?',
        [bookedCount, remaining, finalStatus, slotId]
    );

    return { id: slotId, capacity, booked_count: bookedCount, blocked_count: blockedCount, remaining_capacity: remaining, status: finalStatus };
}

async function setSlotPositionStatus(connection, ref, requestedStatus) {
    await ensureSlotPositionStateTable(connection);

    const status = String(requestedStatus || '').toLowerCase() === 'available' ? 'available' : 'disabled';
    const [slotRows] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE', [ref.slotId]);
    const slot = slotRows[0];
    if (!slot) {
        const err = new Error('نوبت پیدا نشد');
        err.status = 404;
        throw err;
    }

    const capacity = Math.max(Number(slot.capacity || 1), 1);
    if (!ref.position || ref.position < 1 || ref.position > capacity) {
        const err = new Error('شماره جایگاه نوبت نامعتبر است');
        err.status = 400;
        throw err;
    }

    const appointment = await appointmentForSlotPosition(connection, slot, ref.position, true);
    if (appointment && status !== 'available') {
        const err = new Error('این جایگاه نوبت رزرو دارد و قابل غیرفعال‌سازی نیست');
        err.status = 409;
        throw err;
    }

    if (status === 'available') {
        await materializeDisabledSlotPositions(connection, slot, ref.position);
        await connection.query(
            'DELETE FROM appointment_slot_position_states WHERE slot_id = ? AND position_in_slot = ?',
            [ref.slotId, ref.position]
        );
    } else {
        await connection.query(
            `INSERT INTO appointment_slot_position_states (slot_id, position_in_slot, status)
             VALUES (?, ?, 'disabled')
             ON DUPLICATE KEY UPDATE status = 'disabled', updated_at = NOW()`,
            [ref.slotId, ref.position]
        );
    }

    const aggregate = await recalculateSlotAggregate(connection, ref.slotId);
    return {
        success: true,
        id: `${ref.slotId}-${ref.position}`,
        slot_id: ref.slotId,
        position_in_slot: ref.position,
        status,
        slot_status: aggregate?.status || null,
        remaining_capacity: aggregate?.remaining_capacity ?? null,
        message: status === 'available' ? 'این جایگاه نوبت فعال شد' : 'این جایگاه نوبت غیرفعال شد'
    };
}

async function deleteSlotPosition(connection, ref) {
    await ensureSlotPositionStateTable(connection);

    const [slotRows] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE', [ref.slotId]);
    const slot = slotRows[0];
    if (!slot) {
        const err = new Error('نوبت پیدا نشد');
        err.status = 404;
        throw err;
    }

    const capacity = Math.max(Number(slot.capacity || 1), 1);
    if (!ref.position || ref.position < 1 || ref.position > capacity) {
        const err = new Error('شماره جایگاه نوبت نامعتبر است');
        err.status = 400;
        throw err;
    }

    const appointment = await appointmentForSlotPosition(connection, slot, ref.position, true);
    if (appointment) {
        const err = new Error('این جایگاه نوبت رزرو دارد و قابل حذف نیست');
        err.status = 409;
        throw err;
    }

    await materializeDisabledSlotPositions(connection, slot, ref.position);
    await connection.query(
        `INSERT INTO appointment_slot_position_states (slot_id, position_in_slot, status)
         VALUES (?, ?, 'deleted')
         ON DUPLICATE KEY UPDATE status = 'deleted', updated_at = NOW()`,
        [ref.slotId, ref.position]
    );

    const aggregate = await recalculateSlotAggregate(connection, ref.slotId);
    return {
        success: true,
        id: `${ref.slotId}-${ref.position}`,
        slot_id: ref.slotId,
        position_in_slot: ref.position,
        status: 'deleted',
        slot_status: aggregate?.status || null,
        remaining_capacity: aggregate?.remaining_capacity ?? null,
        message: 'این جایگاه نوبت حذف شد'
    };
}

async function scheduleHasAppointments(connection, scheduleId) {
    const [[appointmentCount]] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN appointment_slots aps ON aps.id = a.appointment_slot_id
         WHERE aps.doctor_schedule_id = ?`,
        [scheduleId]
    );
    return Number(appointmentCount?.count || 0) > 0;
}

async function scheduleHasActiveAppointments(connection, scheduleId) {
    const [[slotCount]] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM appointment_slots
         WHERE doctor_schedule_id = ?
           AND COALESCE(booked_count, 0) > 0`,
        [scheduleId]
    );
    if (Number(slotCount?.count || 0) > 0) return true;

    const [[appointmentCount]] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN appointment_slots aps ON aps.id = a.appointment_slot_id
         WHERE aps.doctor_schedule_id = ?
           AND ${activeAppointmentStatusSql('a')}`,
        [scheduleId]
    );
    return Number(appointmentCount?.count || 0) > 0;
}

async function hardDeleteScheduleWithSlots(connection, scheduleId) {
    if (!scheduleId) return { exists: false };

    const [scheduleRows] = await connection.query('SELECT id FROM doctor_schedules WHERE id = ? LIMIT 1', [scheduleId]);
    if (!scheduleRows.length) return { exists: false };

    const hasActiveAppointments = await scheduleHasActiveAppointments(connection, scheduleId);
    if (hasActiveAppointments) {
        await connection.query('UPDATE doctor_schedules SET is_active = 0 WHERE id = ?', [scheduleId]);
        await connection.query(
            `UPDATE appointment_slots
             SET status = 'disabled'
             WHERE doctor_schedule_id = ?
               AND COALESCE(status, 'available') NOT IN ('cancelled','canceled','deleted','archived')`,
            [scheduleId]
        );
        return { exists: true, hardDeleted: false, disabled: true, slotsDeleted: 0 };
    }

    const [slotRows] = await connection.query('SELECT id FROM appointment_slots WHERE doctor_schedule_id = ?', [scheduleId]);
    const slotIds = slotRows.map(row => Number(row.id)).filter(Boolean);
    let slotsDeleted = 0;

    if (slotIds.length) {
        const placeholders = slotIds.map(() => '?').join(',');
        await ensureSlotPositionStateTable(connection);
        await connection.query(`DELETE FROM appointment_slot_position_states WHERE slot_id IN (${placeholders})`, slotIds);
        await connection.query(
            `UPDATE appointments
             SET appointment_slot_id = NULL
             WHERE appointment_slot_id IN (${placeholders})
               AND COALESCE(status,'') IN ('cancelled','canceled','deleted','rejected')`,
            slotIds
        );
        const [slotResult] = await connection.query(`DELETE FROM appointment_slots WHERE id IN (${placeholders})`, slotIds);
        slotsDeleted = Number(slotResult.affectedRows || 0);
    }

    const [scheduleResult] = await connection.query('DELETE FROM doctor_schedules WHERE id = ?', [scheduleId]);
    return {
        exists: true,
        hardDeleted: Number(scheduleResult.affectedRows || 0) > 0,
        disabled: false,
        slotsDeleted
    };
}

async function dailyQueueBaseForSlot(connection, slot) {
    const [rows] = await connection.query(
        `SELECT COALESCE(SUM(capacity), 0) AS base
         FROM appointment_slots
         WHERE doctor_id = ?
           AND medical_center_id = ?
           AND service_id = ?
           AND slot_date = ?
           AND start_time < ?
           AND COALESCE(status, 'available') NOT IN ('disabled', 'cancelled')`,
        [
            slot.doctor_id,
            slot.medical_center_id,
            slot.service_id,
            formatDate(slot.slot_date),
            slot.start_time
        ]
    );

    return Number(rows[0]?.base || 0);
}

async function nextQueueNumberForSlot(connection, slot) {
    // Daily order number:
    // order = capacity of earlier slots in the same day/doctor/center/service
    //       + first free position inside the selected slot.
    //
    // Example:
    // 08:00 capacity 10 => positions 1..10
    // 08:30 capacity 10 => positions 11..20
    const capacity = Math.max(Number(slot.capacity || 1), 1);
    const base = await dailyQueueBaseForSlot(connection, slot);

    const [rows] = await connection.query(
        `SELECT appointment_queue_number
         FROM appointments
         WHERE appointment_slot_id = ?
           AND appointment_queue_number IS NOT NULL
           AND ${activeAppointmentStatusSql()}
         ORDER BY appointment_queue_number ASC
         FOR UPDATE`,
        [slot.id]
    );

    await ensureSlotPositionStateTable(connection);
    const [positionRows] = await connection.query(
        `SELECT position_in_slot
         FROM appointment_slot_position_states
         WHERE slot_id = ?
           AND position_in_slot BETWEEN 1 AND ?
           AND status IN ('disabled', 'deleted')`,
        [slot.id, capacity]
    );

    const used = new Set(rows.map(row => Number(row.appointment_queue_number)).filter(n => Number.isFinite(n) && n > 0));
    const blockedPositions = new Set(positionRows.map(row => Number(row.position_in_slot)).filter(n => Number.isFinite(n) && n > 0));
    for (let position = 1; position <= capacity; position += 1) {
        if (blockedPositions.has(position)) continue;
        const queueNumber = base + position;
        if (!used.has(queueNumber)) return queueNumber;
    }

    const err = new Error('ظرفیت این نوبت تکمیل شده است');
    err.status = 409;
    throw err;
}


function queueMessage(queueNumber) {
    const number = Number(queueNumber || 1);
    return `شماره ترتیب روزانه شما ${number} است.`;
}

async function ensureAppointmentQueueNumber(connection, appointmentId) {
    const [appointments] = await connection.query('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [appointmentId]);
    const appointment = appointments[0];
    if (!appointment) {
        const err = new Error('نوبت یافت نشد');
        err.status = 404;
        throw err;
    }

    if (appointment.appointment_queue_number) {
        let capacity = 1;
        if (appointment.appointment_slot_id) {
            const [slotRows] = await connection.query('SELECT capacity FROM appointment_slots WHERE id = ? LIMIT 1', [appointment.appointment_slot_id]);
            capacity = Number(slotRows[0]?.capacity || 1);
        }
        return {
            appointment,
            queueNumber: Number(appointment.appointment_queue_number),
            capacity
        };
    }

    if (!appointment.appointment_slot_id) {
        await connection.query('UPDATE appointments SET appointment_queue_number = 1 WHERE id = ?', [appointmentId]);
        return { appointment, queueNumber: 1, capacity: 1 };
    }

    const [slots] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE', [appointment.appointment_slot_id]);
    const slot = slots[0];
    if (!slot) {
        await connection.query('UPDATE appointments SET appointment_queue_number = 1 WHERE id = ?', [appointmentId]);
        return { appointment, queueNumber: 1, capacity: 1 };
    }

    const queueNumber = await nextQueueNumberForSlot(connection, slot);
    await connection.query('UPDATE appointments SET appointment_queue_number = ? WHERE id = ?', [queueNumber, appointmentId]);

    return {
        appointment: Object.assign({}, appointment, { appointment_queue_number: queueNumber }),
        queueNumber,
        capacity: Number(slot.capacity || 1)
    };
}

async function sendConfirmationSmsAfterCommit(pool, appointmentId, options = {}) {
    try {
        return await appointmentConfirmationSms.sendAppointmentConfirmationSms(pool, appointmentId, options);
    } catch (error) {
        console.warn('Appointment confirmation SMS warning:', error.message);
        return { success: false, skipped: true, error: error.message };
    }
}

function normalizeIranMobile(value) {
    let phone = String(value || '').trim()
        .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/[^0-9+]/g, '');
    if (phone.startsWith('0098')) phone = `0${phone.slice(4)}`;
    else if (phone.startsWith('+98')) phone = `0${phone.slice(3)}`;
    else if (phone.startsWith('98') && phone.length === 12) phone = `0${phone.slice(2)}`;
    if (!/^09\d{9}$/.test(phone)) return '';
    return phone;
}

async function findOrCreatePatient(connection, body, user = null) {
    if (user?.role === 'patient') {
        const [mine] = await connection.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [user.id]);
        if (!mine.length) { const err = new Error('پروفایل بیمار یافت نشد'); err.status = 403; throw err; }
        return Number(mine[0].id);
    }

    const staffRoles = new Set(['system_admin','admin','clinic_admin','clinic_manager','manager','receptionist','reception','secretary','staff']);
    if (body.patient_id && staffRoles.has(String(user?.role || ''))) {
        const [rows] = await connection.query('SELECT id FROM patients WHERE id = ? LIMIT 1', [body.patient_id]);
        if (!rows.length) {
            const err = new Error('بیمار انتخاب‌شده یافت نشد');
            err.status = 400;
            throw err;
        }
        return Number(body.patient_id);
    }

    const phone = normalizeIranMobile(body.patient_phone || body.phone || body.mobile);
    let fullName = cleanText(body.patient_name || body.full_name || body.name, 200);
    if (!phone) {
        const err = new Error('شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود');
        err.status = 400;
        throw err;
    }
    if (!fullName || fullName.length < 3) {
        fullName = `مراجعه‌کننده ${phone.slice(-4)}`;
    }

    const [existing] = await connection.query(
        `SELECT p.id AS patient_id, u.id AS user_id, u.full_name
         FROM users u
         LEFT JOIN patients p ON p.user_id=u.id
         WHERE u.phone=? OR p.phone=? OR p.mobile=?
         ORDER BY CASE WHEN p.id IS NULL THEN 1 ELSE 0 END, p.id DESC, u.id DESC
         LIMIT 1`,
        [phone, phone, phone]
    );
    if (existing.length && existing[0].patient_id) return Number(existing[0].patient_id);

    let userId = existing.length ? Number(existing[0].user_id) : null;
    let username = null;
    if (!userId) {
        username = `guest_${phone}_${crypto.randomBytes(4).toString('hex')}`;
        const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12);
        const userResult = await insertDynamic(connection, 'users', {
            username,
            password: unusablePassword,
            full_name: fullName,
            phone,
            role: 'patient',
            is_active: 1
        });
        userId = Number(userResult.insertId);
    } else {
        const [userRows] = await connection.query('SELECT username FROM users WHERE id=? LIMIT 1', [userId]);
        username = userRows[0]?.username || `patient_${userId}`;
    }

    const patientResult = await insertDynamic(connection, 'patients', {
        user_id: userId,
        username,
        full_name: fullName,
        phone,
        mobile: phone,
        is_active: 1,
        registration_source: user ? 'staff_booking' : 'public_booking',
        is_guest: user ? 0 : 1
    });
    return Number(patientResult.insertId);
}

// Transaction-based appointment booking
router.post('/appointments', optionalAuth, async (req, res) => {
    let connection;
    let smsAfterCommitAppointmentId = null;
    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);

        const slotId = Number(req.body.appointment_slot_id || req.body.slot_id);
        if (!slotId) {
            const err = new Error('انتخاب نوبت الزامی است');
            err.status = 400;
            throw err;
        }

        const [slots] = await connection.query(
            `SELECT aps.*,
                    COALESCE(ds.is_active, 0) AS schedule_is_active,
                    COALESCE(mc.is_active, 0) AS center_is_active,
                    COALESCE(s.is_active, 0) AS service_is_active,
                    CASE WHEN COALESCE(s.is_free,0)=1 THEN 0 ELSE COALESCE(NULLIF(ds.custom_fee, 0), NULLIF(s.default_fee, 0), NULLIF(d.consultation_fee, 0), 0) END AS resolved_amount,
                    COALESCE(s.is_free,0) AS service_is_free,
                    s.supplementary_insurance_enabled,
                    s.supplementary_insurance_payment_mode,
                    s.supplementary_insurance_amount,
                    s.supplementary_insurance_percent,
                    s.supplementary_insurance_requires_review,
                    s.supplementary_insurance_attachment_required,
                    s.supplementary_insurance_notice,
                    CASE
                        WHEN COALESCE(s.is_free,0)=1 THEN 'free'
                        WHEN COALESCE(ds.custom_fee, 0) > 0 THEN 'schedule'
                        WHEN COALESCE(s.default_fee, 0) > 0 THEN 'service'
                        WHEN COALESCE(d.consultation_fee, 0) > 0 THEN 'doctor'
                        ELSE 'none'
                    END AS fee_source
             FROM appointment_slots aps
             JOIN doctor_schedules ds ON ds.id = aps.doctor_schedule_id
             LEFT JOIN medical_centers mc ON mc.id = aps.medical_center_id
             LEFT JOIN services s ON s.id = aps.service_id
             LEFT JOIN doctors d ON d.id = aps.doctor_id
             WHERE aps.id = ?
             FOR UPDATE`,
            [slotId]
        );
        const slot = slots[0];
        if (!slot) {
            const err = new Error('نوبت انتخاب‌شده یافت نشد');
            err.status = 404;
            throw err;
        }
        if (!Number(slot.schedule_is_active)) {
            const err = new Error('برنامه این نوبت غیرفعال است و رزرو جدید پذیرفته نمی‌شود');
            err.status = 409;
            throw err;
        }
        if (!Number(slot.center_is_active)) {
            const err = new Error('مرکز درمانی این نوبت غیرفعال است و رزرو جدید پذیرفته نمی‌شود');
            err.status = 409;
            throw err;
        }
        if (!Number(slot.service_is_active)) {
            const err = new Error('خدمت این نوبت غیرفعال است و رزرو جدید پذیرفته نمی‌شود');
            err.status = 409;
            throw err;
        }
        const [activeHoldRows] = await connection.query(
            `SELECT COUNT(*) AS active_holds
             FROM appointment_payment_reservations
             WHERE appointment_slot_id=? AND status='pending' AND expires_at>UTC_TIMESTAMP()`,
            [slot.id]
        );
        const activeHolds = Number(activeHoldRows[0]?.active_holds || 0);
        const effectiveRemaining = Math.max(Number(slot.capacity || 0) - Number(slot.booked_count || 0) - activeHolds, 0);
        if (slot.status !== 'available' || effectiveRemaining <= 0 || Number(slot.booked_count) >= Number(slot.capacity)) {
            const err = new Error('ظرفیت این نوبت تکمیل شده یا نوبت غیرفعال است');
            err.status = 409;
            throw err;
        }

        const amount = Number(slot.resolved_amount || 0);
        if ((!Number.isFinite(amount) || amount <= 0) && !Number(slot.service_is_free)) {
            const err = new Error('برای این نوبت تعرفه معتبری ثبت نشده است. ابتدا تعرفه خدمت، زمان‌بندی یا پزشک را تعیین کنید');
            err.status = 409;
            err.code = 'APPOINTMENT_FEE_REQUIRED';
            throw err;
        }
        const paymentResolution = insurancePolicy.resolvePaymentPolicy(slot, req.body, amount);
        const expectedAmount = toMoney(req.body.expected_amount, 0, false);
        if (expectedAmount > 0 && expectedAmount !== paymentResolution.onlinePayableAmount && expectedAmount !== amount) {
            const err = new Error('مبلغ قابل پرداخت این نوبت تغییر کرده است. نوبت‌ها را به‌روزرسانی و مبلغ جدید را دوباره بررسی کنید');
            err.status = 409;
            err.code = 'APPOINTMENT_FEE_CHANGED';
            throw err;
        }

        const patientId = await findOrCreatePatient(connection, req.body, req.user);
        const isFreeService = Number(slot.service_is_free || 0) === 1;
        const onlinePayableAmount = Number(paymentResolution.onlinePayableAmount || 0);

        // Paid services must not create an appointment before verified payment.
        // Commit only a newly-created patient (when applicable), then let the secure
        // checkout service re-lock the slot and create a temporary capacity hold.
        if (!isFreeService && onlinePayableAmount > 0) {
            await connection.commit();
            connection.release();
            connection = null;

            const role = String(req.user?.role || '').toLowerCase();
            const paymentContext = !req.user
                ? 'public'
                : (['clinic_admin', 'clinic_manager', 'manager'].includes(role)
                    ? 'clinic-manager'
                    : (['system_admin', 'admin'].includes(role)
                        ? 'admin'
                        : (['receptionist', 'reception', 'secretary', 'staff'].includes(role) ? 'secretary' : 'patient')));
            const checkout = await secureCheckout.createCheckout({
                patientId,
                actorUserId: req.user?.id || null,
                actorType: (!req.user || paymentContext === 'patient') ? 'patient' : 'staff',
                paymentContext,
                appointmentSlotId: slot.id,
                type: req.body.type || 'regular',
                reason: cleanText(req.body.reason || req.body.notes || req.body.description, 1000),
                insurance: paymentResolution,
                expectedAmount: onlinePayableAmount,
                req
            });
            return res.status(201).json({ success: true, ...checkout });
        }

        const code = trackingCode();
        const queueNumber = await nextQueueNumberForSlot(connection, slot);
        const appointmentStatus = 'confirmed';

        const result = await insertDynamic(connection, 'appointments', {
            patient_id: patientId,
            appointment_slot_id: slot.id,
            appointment_queue_number: queueNumber,
            doctor_id: slot.doctor_id,
            medical_center_id: slot.medical_center_id,
            service_id: slot.service_id,
            appointment_date: formatDate(slot.slot_date),
            appointment_time: trimTime(slot.start_time),
            type: req.body.type || 'regular',
            status: appointmentStatus,
            tracking_code: code,
            confirmed_at: appointmentStatus === 'confirmed' ? new Date() : null,
            reason: cleanText(req.body.reason, 2000),
            notes: cleanText(req.body.notes, 2000),
            description: cleanText(req.body.description, 2000),
            amount: onlinePayableAmount,
            payment_status: isFreeService ? 'free' : 'pending',
            ...insurancePolicy.appointmentInsuranceFields(paymentResolution),
            created_by: req.user?.id || null
        });

        const newBooked = Number(slot.booked_count) + 1;
        const newRemaining = Math.max(Number(slot.capacity) - newBooked, 0);
        const status = newRemaining > 0 ? 'available' : 'full';

        await connection.query(
            `UPDATE appointment_slots SET booked_count = ?, remaining_capacity = ?, status = ? WHERE id = ?`,
            [newBooked, newRemaining, status, slot.id]
        );

        if (appointmentStatus === 'confirmed') smsAfterCommitAppointmentId = result.insertId;

        await connection.commit();

        let sms = null;
        if (smsAfterCommitAppointmentId) {
            sms = await sendConfirmationSmsAfterCommit(pool, smsAfterCommitAppointmentId);
        }

        res.status(201).json({
            success: true,
            appointment_id: result.insertId,
            tracking_code: code,
            appointment_queue_number: queueNumber,
            queue_number: queueNumber,
            queue_label: queueMessage(queueNumber),
            remaining_capacity: newRemaining,
            amount: onlinePayableAmount,
            original_amount: paymentResolution.originalAmount,
            online_payable_amount: onlinePayableAmount,
            remaining_amount: paymentResolution.remainingAmount,
            payment_policy: paymentResolution.paymentPolicy,
            insurance_status: paymentResolution.insuranceStatus,
            fee_source: slot.fee_source,
            sms,
            payment_required: false,
            message: paymentResolution.insuranceApplied
                ? `نوبت ثبت شد و با ثبت بیمه تکمیلی فعلاً پرداخت آنلاین لازم نیست. ${paymentResolution.notice} ساعت ${trimTime(slot.start_time)}، ${queueMessage(queueNumber)}`.trim()
                : `خدمت رایگان است؛ نوبت ثبت و تأیید شد. ساعت ${trimTime(slot.start_time)}، ${queueMessage(queueNumber)}`.trim()
        });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
});



router.get('/appointments/payment/zarinpal/callback', async (req, res) => {
    const state = String(req.query.state || '');
    const authority = String(req.query.Authority || req.query.authority || '');
    const status = String(req.query.Status || req.query.status || '');
    const redirect = (path, params = {}) => {
        const query = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && String(value) !== '') query.set(key, String(value));
        });
        return res.redirect(303, `${path}${query.toString() ? `?${query.toString()}` : ''}`);
    };
    try {
        const result = await secureCheckout.completeZarinpalCheckout({ callbackToken: state, authority, status, req });
        if (result.cancelled) {
            return redirect('/payment-cancel.html', { message: result.message || 'پرداخت انجام نشد و ظرفیت آزاد شد', context: result.payment_context || 'public' });
        }
        if (result.reconciliation_required) {
            return redirect('/payment-pending.html', {
                reference: result.reference_number || result.receipt_number,
                message: result.message,
                context: result.payment_context || 'public'
            });
        }
        return redirect('/payment-success.html', {
            reference: result.reference_number || result.receipt_number,
            tracking: result.tracking_code,
            appointment_id: result.appointment_id,
            message: result.message || 'پرداخت تأیید شد و نوبت ثبت گردید',
            context: result.payment_context || 'public'
        });
    } catch (error) {
        console.error('ZarinPal callback error:', error);
        return redirect('/payment-fail.html', {
            code: error.code || 'ZARINPAL_CALLBACK_ERROR',
            message: error.expose ? error.message : 'تأیید پرداخت انجام نشد؛ برای بررسی با کلینیک تماس بگیرید',
            context: 'public'
        });
    }
});


router.get('/appointments/public-payment-checkout/:token', publicCheckoutReadLimiter, async (req, res) => {
    try {
        const checkout = await secureCheckout.getCheckoutPreview({
            rawToken: req.params.token,
            req
        });
        const safePhone = String(checkout.patient_phone || '').replace(/^(\d{4})\d+(\d{3})$/, '$1***$2');
        return res.json({
            success: true,
            test_mode: String(checkout.provider) === 'sandbox',
            checkout: {
                status: checkout.status,
                amount: Number(checkout.amount || 0),
                appointment_date: checkout.appointment_date,
                appointment_time: String(checkout.appointment_time || '').slice(0, 5),
                end_time: String(checkout.end_time || '').slice(0, 5),
                doctor_name: checkout.doctor_name || null,
                service_name: checkout.service_name || null,
                medical_center_name: checkout.medical_center_name || null,
                patient_name: checkout.patient_name || null,
                patient_phone: safePhone || null,
                expires_at: checkout.expires_at,
                appointment_id: checkout.appointment_id || null,
                payment_id: checkout.payment_id || null,
                provider: checkout.provider || null,
                provider_reference: checkout.provider_reference || null,
                gateway_url: checkout.gateway_url || null
            }
        });
    } catch (error) {
        return res.status(Number(error.status || 500)).json({
            success: false,
            code: error.code || 'PUBLIC_CHECKOUT_PREVIEW_ERROR',
            message: error.expose ? error.message : 'خطا در دریافت اطلاعات پرداخت'
        });
    }
});

router.post('/appointments/public-payment-checkout/:token/test-complete', publicCheckoutWriteLimiter, async (req, res) => {
    try {
        const result = await secureCheckout.completeSandboxCheckout({
            rawToken: req.params.token,
            actorUserId: null,
            actorType: 'patient',
            req
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(Number(error.status || 500)).json({
            success: false,
            code: error.code || 'PUBLIC_CHECKOUT_COMPLETE_ERROR',
            message: error.expose ? error.message : 'تأیید پرداخت انجام نشد'
        });
    }
});

router.post('/appointments/public-payment-checkout/:token/cancel', publicCheckoutWriteLimiter, async (req, res) => {
    try {
        const result = await secureCheckout.cancelCheckout({
            rawToken: req.params.token,
            actorUserId: null,
            actorType: 'patient',
            req
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        return res.status(Number(error.status || 500)).json({
            success: false,
            code: error.code || 'PUBLIC_CHECKOUT_CANCEL_ERROR',
            message: error.expose ? error.message : 'لغو پرداخت انجام نشد'
        });
    }
});


function staffCheckoutAccess(req) {
    const role = String(req.user?.role || '').toLowerCase();
    return {
        staffUserId: Number(req.user?.id || 0),
        // System administrators may review a checkout opened by another manager
        // only when they possess its high-entropy token; clinic managers are
        // restricted to checkouts they initiated themselves.
        allowAnyStaff: ['system_admin', 'admin'].includes(role),
        actorType: 'staff'
    };
}

router.get('/appointments/payment-checkout/:token', ...staffCheckoutOnly, async (req, res) => {
    try {
        const access = staffCheckoutAccess(req);
        const checkout = await secureCheckout.getCheckoutPreview({
            rawToken: req.params.token,
            staffUserId: access.staffUserId,
            allowAnyStaff: access.allowAnyStaff,
            req
        });
        return res.json({
            success: true,
            test_mode: String(checkout.provider) === 'sandbox',
            checkout,
            expires_at: checkout.expires_at,
            already_paid: checkout.status === 'paid'
        });
    } catch (error) {
        console.error('Staff checkout preview error:', error);
        return res.status(Number(error.status || 500)).json({
            success: false,
            code: error.code || 'CHECKOUT_PREVIEW_ERROR',
            message: error.expose ? error.message : 'خطا در دریافت اطلاعات پرداخت'
        });
    }
});

router.post('/appointments/payment-checkout/:token/test-complete', ...staffCheckoutOnly, async (req, res) => {
    try {
        const access = staffCheckoutAccess(req);
        const result = await secureCheckout.completeSandboxCheckout({
            rawToken: req.params.token,
            staffUserId: access.staffUserId,
            allowAnyStaff: access.allowAnyStaff,
            actorUserId: req.user.id,
            actorType: access.actorType,
            req
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        console.error('Staff checkout completion error:', error);
        return res.status(Number(error.status || 500)).json({
            success: false,
            code: error.code || 'CHECKOUT_COMPLETE_ERROR',
            message: error.expose ? error.message : 'پرداخت تأیید نشد و نوبتی ثبت نشد'
        });
    }
});

router.post('/appointments/payment-checkout/:token/cancel', ...staffCheckoutOnly, async (req, res) => {
    try {
        const access = staffCheckoutAccess(req);
        const result = await secureCheckout.cancelCheckout({
            rawToken: req.params.token,
            staffUserId: access.staffUserId,
            allowAnyStaff: access.allowAnyStaff,
            actorUserId: req.user.id,
            actorType: access.actorType,
            req
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        console.error('Staff checkout cancellation error:', error);
        return res.status(Number(error.status || 500)).json({
            success: false,
            code: error.code || 'CHECKOUT_CANCEL_ERROR',
            message: error.expose ? error.message : 'انصراف از پرداخت انجام نشد'
        });
    }
});


async function confirmAppointmentHandler(req, res) {
    let connection;
    let appointmentId = Number(req.params.id);
    let queueNumber = 1;
    let capacity = 1;

    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);

        if (!appointmentId) {
            const err = new Error('شناسه نوبت نامعتبر است');
            err.status = 400;
            throw err;
        }

        const queueInfo = await ensureAppointmentQueueNumber(connection, appointmentId);
        queueNumber = queueInfo.queueNumber;
        capacity = queueInfo.capacity;
        const previousStatus = normalizeStatus(queueInfo.appointment.status || 'pending');
        const nextStatus = assertTransition(previousStatus, 'confirmed');
        await assertSchema(connection, 'appointment status history', { tables: ['appointment_status_history'] });

        await connection.query(
            `UPDATE appointments
             SET status = ?,
                 confirmed_at = COALESCE(confirmed_at, NOW())
             WHERE id = ?`,
            [nextStatus, appointmentId]
        );
        if (previousStatus !== nextStatus) {
            await connection.query(
                `INSERT INTO appointment_status_history
                 (appointment_id, from_status, to_status, reason, actor_user_id, request_id, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [appointmentId, previousStatus, nextStatus, 'تأیید نوبت توسط مدیر کلینیک', req.user.id,
                 req.correlationId || null, req.ip || null]
            );
        }

        await connection.commit();

        const sms = await sendConfirmationSmsAfterCommit(pool, appointmentId);

        res.json({
            success: true,
            appointment_id: appointmentId,
            appointment_queue_number: queueNumber,
            queue_number: queueNumber,
            queue_label: queueMessage(queueNumber),
            sms,
            message: `نوبت تایید شد. ${queueMessage(queueNumber)} پیامک تایید شامل ساعت و شماره ترتیب ارسال شد.`
        });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
}




router.patch('/appointments/:id/cancel', protect, async (req, res) => {
    let connection;
    let cancellationReason = null;
    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);

        const [rows] = await connection.query('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [req.params.id]);
        const appointment = rows[0];
        if (!appointment) {
            const err = new Error('نوبت یافت نشد');
            err.status = 404;
            throw err;
        }

        const privileged = new Set(['system_admin','admin','clinic_admin','clinic_manager','manager','receptionist','reception','secretary','staff']);
        let authorized = privileged.has(String(req.user.role || ''));
        if (req.user.role === 'patient') authorized = Number(req.user.patient_id) === Number(appointment.patient_id);
        if (req.user.role === 'doctor') authorized = Number(req.user.doctor_id) === Number(appointment.doctor_id);
        if (!authorized) {
            const err = new Error('اجازه لغو این نوبت را ندارید');
            err.status = 403;
            throw err;
        }

        const previousStatus = normalizeStatus(appointment.status || 'pending');
        const nextStatus = assertTransition(previousStatus, 'cancelled');
        await assertSchema(connection, 'appointment status history', { tables: ['appointment_status_history'] });
        if (previousStatus !== nextStatus) {
            const cancelReason = cleanText(req.body.reason || req.body.notes, 500);
            cancellationReason = cancelReason || 'لغو نوبت';
            await connection.query('UPDATE appointments SET status = ?, notes = COALESCE(?, notes) WHERE id = ?', [nextStatus, cancelReason || null, req.params.id]);
            await connection.query(
                `INSERT INTO appointment_status_history
                 (appointment_id, from_status, to_status, reason, actor_user_id, request_id, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [appointment.id, previousStatus, nextStatus, cancelReason || null, req.user.id, req.correlationId || null, req.ip || null]
            );

            if (appointment.appointment_slot_id) {
                const [slotRows] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE', [appointment.appointment_slot_id]);
                const slot = slotRows[0];
                if (slot) {
                    const newBooked = Math.max(Number(slot.booked_count || 0) - 1, 0);
                    const newRemaining = Math.max(Number(slot.capacity || 0) - newBooked, 0);
                    const newStatus = slot.status === 'disabled' ? 'disabled' : (newRemaining > 0 ? 'available' : 'full');
                    await connection.query(
                        'UPDATE appointment_slots SET booked_count = ?, remaining_capacity = ?, status = ? WHERE id = ?',
                        [newBooked, newRemaining, newStatus, slot.id]
                    );
                }
            }
        }

        await connection.commit();
        connection.release();
        connection = null;
        let sms = null;
        if (previousStatus !== nextStatus) {
            sms = await appointmentConfirmationSms.sendAppointmentCancellationSms(pool, appointment.id, { reason: cancellationReason || 'لغو نوبت' }).catch(error => ({ success: false, error: error.message }));
        }
        const smsMessage = sms?.disabled
            ? 'نوبت لغو شد و طبق تنظیمات سامانه پیامک لغو ارسال نشد'
            : 'نوبت لغو شد، ظرفیت آزاد شد و پیامک لغو در صف ارسال قرار گرفت';
        res.json({ success: true, sms, message: smsMessage });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
});

if (process.env.NOORVISTA_TEST_INTERNALS === '1') {
    router.__test = {
        validateSchedulePayload,
        generateSlotsForSchedule,
        requireGeneratedSlots,
        normalizeTime,
        timeToMinutes,
        resolveScheduleEndTime
    };
}

module.exports = router;
