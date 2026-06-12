// src/services/smsService.js
// Central SMS gateway abstraction for Kavenegar and future providers.

const settingsService = require('./settingsService');

function loadKavenegarSdk() {
    try {
        // Optional dependency. The project can still run if SMS is disabled and the SDK is not installed.
        return require('kavenegar');
    } catch (error) {
        return null;
    }
}

function normalizePhone(phone) {
    const raw = String(phone || '').trim();
    if (!raw) return '';

    const englishDigits = raw
        .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

    return englishDigits.replace(/[^0-9+]/g, '');
}

function renderTemplate(template, variables = {}) {
    return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
        if (variables[key] === undefined || variables[key] === null) return '';
        return String(variables[key]);
    });
}

function buildDefaultAppointmentMessage(variables = {}) {
    const patientName = variables.patient_name || 'بیمار گرامی';
    const date = variables.appointment_date || '';
    const time = variables.appointment_time || '';
    const doctorName = variables.doctor_name || '';
    const clinicName = variables.clinic_name || 'کلینیک نورویستا';

    return `${patientName}، یادآوری نوبت شما در ${clinicName}${doctorName ? ` با ${doctorName}` : ''}${date ? ` در تاریخ ${date}` : ''}${time ? ` ساعت ${time}` : ''}.`;
}

async function getSmsSettings(pool, { maskSecrets = false } = {}) {
    const settings = await settingsService.getSettingsMap(pool, { maskSecrets });
    return settingsService.filterSettings(settings, settingsService.SMS_SETTING_KEYS);
}

async function assertSmsCanSend(pool) {
    const settings = await getSmsSettings(pool);
    const enabled = settingsService.normalizeBoolean(settings.sms_enabled, false);

    if (!enabled) {
        return { ok: false, skipped: true, message: 'سرویس پیامک غیرفعال است' };
    }

    const provider = String(settings.sms_provider || 'kavenegar').toLowerCase();
    if (provider !== 'kavenegar') {
        const error = new Error('در حال حاضر فقط ارائه‌دهنده kavenegar پشتیبانی می‌شود');
        error.statusCode = 400;
        throw error;
    }

    const apiKey = settings.sms_api_key || process.env.SMS_API_KEY;
    const sender = settings.sms_sender || process.env.SMS_SENDER;
    if (!apiKey || !sender) {
        return { ok: false, skipped: true, message: 'تنظیمات پیامک کامل نیست' };
    }

    const Kavenegar = loadKavenegarSdk();
    if (!Kavenegar) {
        return { ok: false, skipped: true, message: 'پکیج kavenegar نصب نشده است' };
    }

    return { ok: true, provider, apiKey, sender, Kavenegar };
}

async function sendSms(pool, { receptor, message }) {
    const cleanReceptor = normalizePhone(receptor);
    const cleanMessage = String(message || '').trim();

    if (!cleanReceptor || !cleanMessage) {
        const error = new Error('شماره گیرنده و متن پیام الزامی است');
        error.statusCode = 400;
        throw error;
    }

    const state = await assertSmsCanSend(pool);
    if (!state.ok) {
        return { success: false, skipped: true, message: state.message };
    }

    const api = state.Kavenegar.KavenegarApi({ apikey: state.apiKey });

    return new Promise((resolve, reject) => {
        api.Send({
            message: cleanMessage,
            sender: state.sender,
            receptor: cleanReceptor
        }, (response, status) => {
            if (status && status >= 200 && status < 300) {
                return resolve({
                    success: true,
                    provider: state.provider,
                    receptor: cleanReceptor,
                    status,
                    response
                });
            }

            const error = new Error('ارسال پیامک ناموفق بود');
            error.statusCode = 502;
            error.providerStatus = status;
            error.providerResponse = response;
            return reject(error);
        });
    });
}

async function sendTestSms(pool, { receptor, message }) {
    return sendSms(pool, {
        receptor,
        message: message || 'پیامک تست نورویستا با موفقیت ارسال شد.'
    });
}

async function sendOtpSms(pool, { receptor, code }) {
    const settings = await getSmsSettings(pool);
    const template = settings.sms_otp_template || 'کد تایید شما: {{code}}';
    return sendSms(pool, {
        receptor,
        message: renderTemplate(template, { code })
    });
}

async function sendAppointmentReminder(pool, { receptor, variables = {} }) {
    const settings = await getSmsSettings(pool);
    const template = settings.sms_appointment_template || '';
    const message = template
        ? renderTemplate(template, variables)
        : buildDefaultAppointmentMessage(variables);

    return sendSms(pool, { receptor, message });
}

async function getSmsStatus(pool) {
    const settings = await getSmsSettings(pool, { maskSecrets: true });
    return {
        provider: settings.sms_provider || 'kavenegar',
        enabled: settingsService.normalizeBoolean(settings.sms_enabled, false),
        has_api_key: Boolean(settings.sms_api_key),
        has_sender: Boolean(settings.sms_sender),
        sdk_installed: Boolean(loadKavenegarSdk())
    };
}

module.exports = {
    normalizePhone,
    renderTemplate,
    getSmsSettings,
    getSmsStatus,
    sendSms,
    sendTestSms,
    sendOtpSms,
    sendAppointmentReminder
};
