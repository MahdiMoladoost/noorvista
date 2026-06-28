'use strict';

const { assertTransition, normalizeStatus } = require('../domain/appointmentStateMachine');
const { assertSchema } = require('../database/schemaGuard');
const appointmentSms = require('./appointmentConfirmationSms');

function clean(value, max = 500) { return String(value || '').trim().slice(0, max); }

function cancellationSmsStatusMessage(sms) {
  if (!sms) return '';
  if (sms.disabled) return ' طبق تنظیمات پیامک، پیامک لغو برای بیمار ارسال نشد.';
  if (sms.success && sms.status === 'sent') return ' پیامک لغو برای بیمار ارسال شد.';
  if (sms.success && (sms.queued || sms.status === 'queued' || sms.status === 'duplicate')) {
    return sms.status === 'duplicate'
      ? ' پیامک لغو قبلاً در صف ارسال ثبت شده بود.'
      : ' پیامک لغو در صف ارسال قرار گرفت.';
  }
  if (sms.skipped) return ` پیامک لغو ارسال نشد: ${clean(sms.message || sms.error || 'شرایط ارسال فراهم نیست', 300)}`;
  if (sms.queued || sms.status === 'pending' || sms.status === 'retry') {
    return ' پیامک لغو در صف ارسال مجدد باقی ماند.';
  }
  return ` پیامک لغو فعلاً ارسال نشد: ${clean(sms.error || sms.message || 'خطای نامشخص', 300)}`;
}

function withCancellationSmsMessage(baseMessage, sms) {
  return `${clean(baseMessage, 500) || 'نوبت لغو شد'}${cancellationSmsStatusMessage(sms)}`.trim();
}

async function transitionWithConnection(connection, {
  appointmentId, targetStatus, actor = null, reason = null, notes = undefined,
  expectedDoctorId = null, expectedPatientId = null, extraUpdateSql = '', extraParams = []
}) {
  const id = Number(appointmentId);
  if (!Number.isInteger(id) || id <= 0) { const error = new Error('شناسه نوبت نامعتبر است'); error.statusCode = 400; throw error; }
  await assertSchema(connection, 'appointment status history', { tables: ['appointment_status_history'] });
  const [rows] = await connection.query('SELECT id, status, doctor_id, patient_id FROM appointments WHERE id = ? FOR UPDATE', [id]);
  const appointment = rows[0];
  if (!appointment) { const error = new Error('نوبت یافت نشد'); error.statusCode = 404; throw error; }
  if (expectedDoctorId != null && Number(appointment.doctor_id) !== Number(expectedDoctorId)) {
    const error = new Error('اجازه تغییر این نوبت را ندارید'); error.statusCode = 403; throw error;
  }
  if (expectedPatientId != null && Number(appointment.patient_id) !== Number(expectedPatientId)) {
    const error = new Error('اجازه تغییر این نوبت را ندارید'); error.statusCode = 403; throw error;
  }
  const from = normalizeStatus(appointment.status || 'pending');
  const to = assertTransition(from, targetStatus);
  const assignments = ['status = ?']; const params = [to];
  if (notes !== undefined) { assignments.push('notes = ?'); params.push(clean(notes, 2000) || null); }
  if (extraUpdateSql) { assignments.push(extraUpdateSql); params.push(...extraParams); }
  params.push(id);
  await connection.query(`UPDATE appointments SET ${assignments.join(', ')} WHERE id = ?`, params);
  if (from !== to) {
    await connection.query(
      `INSERT INTO appointment_status_history
       (appointment_id, from_status, to_status, reason, actor_user_id, request_id, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, from, to, clean(reason || notes, 500) || null, actor?.id || null,
        clean(actor?.requestId, 80) || null, clean(actor?.ip, 45) || null]
    );
  }
  return { ...appointment, previous_status: from, status: to, idempotent: from === to, transition_reason: clean(reason || notes, 500) || null };
}

async function transition(pool, options) {
  const connection = await pool.getConnection();
  let result;
  try {
    await connection.beginTransaction();
    result = await transitionWithConnection(connection, options);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }

  // Notification failures must not roll back an already valid appointment transition.
  if (result.status === 'cancelled' && !result.idempotent) {
    try {
      result.cancellation_sms = await appointmentSms.sendAppointmentCancellationSms(pool, result.id, {
        reason: result.transition_reason || 'لغو نوبت'
      });
    } catch (error) {
      console.warn('Appointment cancellation SMS warning:', error.message);
      result.cancellation_sms = { success: false, error: error.message };
    }
  }
  return result;
}

function sendTransitionError(res, error, fallback = 'خطا در تغییر وضعیت نوبت') {
  const status = Number(error.statusCode || error.status || 500);
  return res.status(status).json({ success: false, code: error.code, message: status < 500 ? error.message : fallback });
}
module.exports = { transition, transitionWithConnection, cancellationSmsStatusMessage, withCancellationSmsMessage, sendTransitionError };
