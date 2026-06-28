// src/services/appointmentConfirmationSms.js
// NOORVISTA - durable SMS notifications for appointment confirmation and cancellation.

'use strict';

const smsOutbox = require('./smsOutboxService');
const settingsService = require('./settingsService');
const smsTemplates = require('./smsTemplateService');

function clean(value, fallback = '') {
    const text = String(value || '').trim();
    return text || fallback;
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function toPersianDigits(value) {
    return String(value ?? '').replace(/\d/g, digit => FA_DIGITS[Number(digit)]);
}

function dateText(value) {
    const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return toPersianDigits(raw);
    try {
        return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
            year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran'
        }).format(new Date(`${raw}T12:00:00Z`));
    } catch (_) {
        return toPersianDigits(raw.replace(/-/g, '/'));
    }
}

function timeText(value) {
    return toPersianDigits(String(value || '').slice(0, 5));
}

function buildConfirmationMessage(row, settings = {}, options = {}) {
    const variables = smsTemplates.appointmentVariables(row, {
        clinic_name: settings.clinic_name,
        clinic_phone: settings.clinic_phone,
        ...options
    });
    const templateKey = options.templateKey === 'sms_payment_success_template'
        ? 'sms_payment_success_template'
        : 'sms_appointment_confirmation_template';
    const template = settings[templateKey]
        || (templateKey === 'sms_appointment_confirmation_template' ? settings.sms_appointment_template : '')
        || smsTemplates.getDefaultTemplate(templateKey);
    return smsTemplates.renderSmsTemplate(template, variables);
}

function buildCancellationMessage(row, options = {}, settings = {}) {
    const variables = smsTemplates.appointmentVariables(row, {
        clinic_name: settings.clinic_name,
        clinic_phone: settings.clinic_phone,
        ...options
    });
    const template = settings.sms_appointment_cancellation_template
        || smsTemplates.getDefaultTemplate('sms_appointment_cancellation_template');
    return smsTemplates.renderSmsTemplate(template, variables);
}

function resolveAppointmentSmsConfig(kind, options = {}) {
    if (kind === 'cancellation') {
        return {
            templateKey: 'sms_appointment_cancellation_template',
            messageType: 'appointment_cancellation',
            disabledMessage: 'ارسال پیامک لغو نوبت در تنظیمات غیرفعال است'
        };
    }
    if (options.templateKey === 'sms_payment_success_template' || options.messageType === 'payment_success') {
        return {
            templateKey: 'sms_payment_success_template',
            messageType: 'payment_success',
            disabledMessage: 'ارسال پیامک پرداخت موفق در تنظیمات غیرفعال است'
        };
    }
    return {
        templateKey: 'sms_appointment_confirmation_template',
        messageType: 'appointment_confirmation',
        disabledMessage: 'ارسال پیامک رزرو و تأیید نوبت در تنظیمات غیرفعال است'
    };
}

async function getSmsTemplateSettings(poolOrConnection) {
    try {
        return await settingsService.getSettingsMap(poolOrConnection);
    } catch (error) {
        console.warn('SMS template settings warning:', error.message || error);
        return {};
    }
}

let smsSchemaVerified = false;

async function ensureSmsColumns(poolOrConnection) {
    if (smsSchemaVerified) return;
    const required = [
        'appointment_queue_number',
        'confirmed_at',
        'confirmation_sms_sent_at',
        'confirmation_sms_status',
        'confirmation_sms_error',
        'cancellation_sms_status',
        'cancellation_sms_sent_at',
        'cancellation_sms_error'
    ];
    const [rows] = await poolOrConnection.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'appointments'
           AND COLUMN_NAME IN (?)`,
        [required]
    );
    const present = new Set(rows.map((row) => row.COLUMN_NAME || row.column_name));
    const missing = required.filter((name) => !present.has(name));
    if (missing.length) {
        const error = new Error(`Database migration required; missing appointment SMS columns: ${missing.join(', ')}`);
        error.statusCode = 503;
        error.code = 'DATABASE_MIGRATION_REQUIRED';
        throw error;
    }
    smsSchemaVerified = true;
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

async function markSms(poolOrConnection, appointmentId, kind, status, error = null) {
    await ensureSmsColumns(poolOrConnection);
    const cancellation = kind === 'cancellation';
    const statusColumn = cancellation ? 'cancellation_sms_status' : 'confirmation_sms_status';
    const sentColumn = cancellation ? 'cancellation_sms_sent_at' : 'confirmation_sms_sent_at';
    const errorColumn = cancellation ? 'cancellation_sms_error' : 'confirmation_sms_error';
    await poolOrConnection.query(
        `UPDATE appointments
         SET ${statusColumn} = ?,
             ${sentColumn} = CASE WHEN ? = 'sent' THEN NOW() ELSE ${sentColumn} END,
             ${errorColumn} = ?
         WHERE id = ?`,
        [status, status, error ? String(error).slice(0, 1000) : null, appointmentId]
    );
}

async function queueAppointmentSms(poolOrConnection, appointmentId, options = {}) {
    await ensureSmsColumns(poolOrConnection);
    const kind = options.kind === 'cancellation' ? 'cancellation' : 'confirmation';
    const row = await getAppointmentSmsRow(poolOrConnection, appointmentId);
    if (!row) return { success: false, skipped: true, status: 'missing', message: 'نوبت یافت نشد' };

    const receptor = clean(row.patient_phone);
    if (!receptor) {
        await markSms(poolOrConnection, appointmentId, kind, 'skipped', 'شماره تماس بیمار ثبت نشده است');
        return { success: false, skipped: true, status: 'skipped', message: 'شماره تماس بیمار ثبت نشده است' };
    }

    const templateSettings = await getSmsTemplateSettings(poolOrConnection);
    const smsConfig = resolveAppointmentSmsConfig(kind, options);
    if (!smsTemplates.isEnabledValue(templateSettings.sms_enabled, false)) {
        const disabledMessage = 'سرویس پیامک در تنظیمات سامانه غیرفعال است';
        await markSms(poolOrConnection, appointmentId, kind, 'skipped', disabledMessage);
        return {
            success: false,
            skipped: true,
            disabled: true,
            global_disabled: true,
            status: 'skipped',
            message: disabledMessage
        };
    }
    if (!smsTemplates.isTemplateEnabled(templateSettings, smsConfig.templateKey, true)) {
        await markSms(poolOrConnection, appointmentId, kind, 'skipped', smsConfig.disabledMessage);
        return {
            success: false,
            skipped: true,
            disabled: true,
            status: 'skipped',
            message: smsConfig.disabledMessage
        };
    }

    const message = kind === 'cancellation'
        ? buildCancellationMessage(row, options, templateSettings)
        : buildConfirmationMessage(row, templateSettings, { ...options, templateKey: smsConfig.templateKey });
    const messageType = smsConfig.messageType;
    let queued;
    try {
        queued = await smsOutbox.enqueue(poolOrConnection, {
            idempotencyKey: smsOutbox.stableIdempotencyKey(messageType, appointmentId),
            messageType,
            receptor,
            message,
            relatedEntityType: 'appointment',
            relatedEntityId: appointmentId,
            payload: {
                appointment_id: appointmentId,
                tracking_code: row.tracking_code || null,
                reason: options.reason || null
            }
        });
        await markSms(poolOrConnection, appointmentId, kind, 'queued');
    } catch (error) {
        await markSms(poolOrConnection, appointmentId, kind, 'failed', error.message || error);
        return { success: false, status: 'failed', error: error.message || String(error) };
    }

    const canDispatchImmediately = options.dispatchImmediately !== false
        && typeof poolOrConnection?.getConnection === 'function';
    if (!canDispatchImmediately) {
        return {
            success: true,
            status: queued.duplicate ? 'duplicate' : 'queued',
            queued: true,
            ...queued,
            message: queued.duplicate ? 'این پیامک قبلاً در صف ثبت شده است' : 'پیامک در صف ارسال قرار گرفت'
        };
    }

    try {
        const delivery = await smsOutbox.processById(
            poolOrConnection,
            queued.id,
            `appointment-${kind}:${process.pid}`
        );
        if (delivery.success && delivery.status === 'sent') {
            await markSms(poolOrConnection, appointmentId, kind, 'sent');
            return { success: true, status: 'sent', ...queued, delivery, message: 'پیامک با موفقیت ارسال شد' };
        }
        if (delivery.status === 'dead') {
            await markSms(poolOrConnection, appointmentId, kind, 'failed', delivery.error || 'ارسال پیامک ناموفق بود');
        }
        return {
            success: false,
            status: delivery.status || 'queued',
            queued: delivery.queued !== false,
            skipped: Boolean(delivery.skipped),
            ...queued,
            delivery,
            error: delivery.error || null,
            message: delivery.error || 'پیامک در صف ارسال مجدد باقی ماند'
        };
    } catch (error) {
        return {
            success: false,
            status: 'queued',
            queued: true,
            ...queued,
            error: error.message || String(error),
            message: 'ارسال فوری انجام نشد و پیامک برای تلاش مجدد در صف باقی ماند'
        };
    }
}

async function sendAppointmentConfirmationSms(poolOrConnection, appointmentId, options = {}) {
    return queueAppointmentSms(poolOrConnection, appointmentId, { ...options, kind: 'confirmation' });
}

async function sendAppointmentCancellationSms(poolOrConnection, appointmentId, options = {}) {
    return queueAppointmentSms(poolOrConnection, appointmentId, { ...options, kind: 'cancellation' });
}

module.exports = {
    ensureSmsColumns,
    getAppointmentSmsRow,
    buildConfirmationMessage,
    buildCancellationMessage,
    resolveAppointmentSmsConfig,
    getSmsTemplateSettings,
    sendAppointmentConfirmationSms,
    sendAppointmentCancellationSms
};
