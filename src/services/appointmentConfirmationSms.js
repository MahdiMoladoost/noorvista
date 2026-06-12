// src/services/appointmentConfirmationSms.js
// NOORVISTA - SMS confirmation for appointment queue numbers

let smsService = null;
try {
    smsService = require('./smsService');
} catch (error) {
    smsService = null;
}

function clean(value, fallback = '') {
    const text = String(value || '').trim();
    return text || fallback;
}

function dateText(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value || '').slice(0, 10);
}

function timeText(value) {
    return String(value || '').slice(0, 5);
}

function buildConfirmationMessage(row) {
    const patientName = clean(row.patient_name, 'بیمار گرامی');
    const doctorName = clean(row.doctor_name, 'پزشک');
    const centerName = clean(row.medical_center_name, 'مرکز درمانی نورویستا');
    const serviceName = clean(row.service_name, 'خدمت درمانی');
    const appointmentDate = dateText(row.appointment_date);
    const appointmentTime = timeText(row.appointment_time || row.start_time);
    const queueNumber = row.appointment_queue_number ? String(row.appointment_queue_number) : '۱';
    const capacity = Number(row.capacity || 1);
    const tracking = clean(row.tracking_code, '');

    const queuePart = capacity > 1
        ? `شماره نوبت شما ${queueNumber} از ${capacity} است.`
        : `شماره نوبت شما ${queueNumber} است.`;

    return `${patientName}، نوبت شما تایید شد. ${serviceName} با ${doctorName} در ${centerName}، تاریخ ${appointmentDate} ساعت ${appointmentTime}. ${queuePart}${tracking ? ` کد رهگیری: ${tracking}` : ''}`;
}

async function ensureSmsColumns(poolOrConnection) {
    const queries = [
        "ALTER TABLE appointments ADD COLUMN appointment_queue_number INT NULL AFTER appointment_slot_id",
        "ALTER TABLE appointments ADD COLUMN confirmed_at DATETIME NULL AFTER tracking_code",
        "ALTER TABLE appointments ADD COLUMN confirmation_sms_sent_at DATETIME NULL AFTER confirmed_at",
        "ALTER TABLE appointments ADD COLUMN confirmation_sms_status VARCHAR(30) NULL AFTER confirmation_sms_sent_at",
        "ALTER TABLE appointments ADD COLUMN confirmation_sms_error TEXT NULL AFTER confirmation_sms_status",
        "ALTER TABLE appointments ADD INDEX idx_appointment_queue_number (appointment_slot_id, appointment_queue_number)"
    ];

    for (const sql of queries) {
        try {
            await poolOrConnection.query(sql);
        } catch (error) {
            if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME'].includes(error.code)) throw error;
        }
    }
}

async function getAppointmentSmsRow(poolOrConnection, appointmentId) {
    const [rows] = await poolOrConnection.query(
        `SELECT a.*,
                COALESCE(p.full_name, p.username, pu.full_name, pu.username, 'بیمار گرامی') AS patient_name,
                COALESCE(p.phone, p.mobile, pu.phone, '') AS patient_phone,
                COALESCE(du.full_name, d.full_name, du.username, 'پزشک') AS doctor_name,
                mc.name AS medical_center_name,
                s.name AS service_name,
                aps.capacity,
                aps.start_time
         FROM appointments a
         LEFT JOIN patients p ON p.id = a.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = a.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN medical_centers mc ON mc.id = a.medical_center_id
         LEFT JOIN services s ON s.id = a.service_id
         LEFT JOIN appointment_slots aps ON aps.id = a.appointment_slot_id
         WHERE a.id = ?
         LIMIT 1`,
        [appointmentId]
    );
    return rows[0] || null;
}

async function markSms(poolOrConnection, appointmentId, status, error = null) {
    await ensureSmsColumns(poolOrConnection);
    await poolOrConnection.query(
        `UPDATE appointments
         SET confirmation_sms_status = ?,
             confirmation_sms_sent_at = CASE WHEN ? = 'sent' THEN NOW() ELSE confirmation_sms_sent_at END,
             confirmation_sms_error = ?
         WHERE id = ?`,
        [status, status, error ? String(error).slice(0, 1000) : null, appointmentId]
    );
}

async function sendAppointmentConfirmationSms(poolOrConnection, appointmentId) {
    await ensureSmsColumns(poolOrConnection);

    const row = await getAppointmentSmsRow(poolOrConnection, appointmentId);
    if (!row) return { success: false, skipped: true, message: 'نوبت یافت نشد' };

    const receptor = clean(row.patient_phone);
    if (!receptor) {
        await markSms(poolOrConnection, appointmentId, 'skipped', 'شماره تماس بیمار ثبت نشده است');
        return { success: false, skipped: true, message: 'شماره تماس بیمار ثبت نشده است' };
    }

    if (!smsService || typeof smsService.sendSms !== 'function') {
        await markSms(poolOrConnection, appointmentId, 'skipped', 'ماژول پیامک در دسترس نیست');
        return { success: false, skipped: true, message: 'ماژول پیامک در دسترس نیست' };
    }

    const message = buildConfirmationMessage(row);

    try {
        const result = await smsService.sendSms(poolOrConnection, { receptor, message });
        await markSms(poolOrConnection, appointmentId, result && result.skipped ? 'skipped' : 'sent', result && result.message);
        return { success: true, status: result && result.skipped ? 'skipped' : 'sent', result };
    } catch (error) {
        await markSms(poolOrConnection, appointmentId, 'failed', error.message || error);
        return { success: false, status: 'failed', error: error.message || String(error) };
    }
}

module.exports = {
    ensureSmsColumns,
    getAppointmentSmsRow,
    buildConfirmationMessage,
    sendAppointmentConfirmationSms
};
