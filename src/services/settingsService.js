// src/services/settingsService.js
// Centralized system/AI/SMS settings access. Secrets are never returned unmasked to admin UI.

const smsTemplates = require('./smsTemplateService');

const DEFAULT_CLINIC_NAME = '';

const SECRET_SETTING_KEYS = new Set(['ai_api_key', 'sms_api_key']);

const AI_SETTING_KEYS = new Set([
    'ai_enabled',
    'ai_base_url',
    'ai_api_key',
    'ai_model',
    'ai_temperature',
    'ai_max_tokens',
    'ai_system_prompt',
    'ai_use_faq_first'
]);

const SOCIAL_PLATFORM_KEYS = [
    'whatsapp',
    'telegram',
    'instagram',
    'bale',
    'eitaa',
    'rubika',
    'soroush',
    'gap',
    'igap',
    'nava',
];

const SOCIAL_LINK_SETTING_KEYS = new Set(SOCIAL_PLATFORM_KEYS.map(key => `social_${key}`));
const SOCIAL_VISIBILITY_SETTING_KEYS = new Set(SOCIAL_PLATFORM_KEYS.map(key => `social_${key}_enabled`));

const PUBLIC_SITE_SETTING_KEYS = new Set([
    'clinic_name',
    'clinic_short_name',
    'clinic_phone',
    'clinic_secondary_phone',
    'clinic_email',
    'clinic_address',
    'clinic_address_primary',
    'clinic_address_primary_enabled',
    'clinic_address_secondary',
    'clinic_address_secondary_enabled',
    'working_hours',
    'clinic_opening_note',
    'clinic_latitude',
    'clinic_longitude',
    'clinic_map_url',
    'footer_signature_text',
    'footer_signature_url',
    ...SOCIAL_LINK_SETTING_KEYS,
    ...SOCIAL_VISIBILITY_SETTING_KEYS
]);

const SYSTEM_BRANDING_SETTING_KEYS = PUBLIC_SITE_SETTING_KEYS;

const SMS_SETTING_KEYS = new Set([
    'sms_enabled',
    'sms_provider',
    'sms_base_url',
    'sms_api_key',
    'sms_sender',
    'sms_otp_template',
    'sms_otp_enabled',
    'sms_appointment_template',
    'sms_appointment_confirmation_template',
    'sms_appointment_confirmation_enabled',
    'sms_appointment_cancellation_template',
    'sms_appointment_cancellation_enabled',
    'sms_appointment_reminder_template',
    'sms_payment_success_template',
    'sms_payment_success_enabled',
    'sms_general_notification_template',
    'sms_general_notification_enabled',
    'sms_appointment_reminder_enabled',
    'sms_appointment_reminder_default_minutes'
]);

const SMS_TEMPLATE_SETTING_KEYS = new Set([
    ...smsTemplates.SMS_TEMPLATE_KEYS,
    ...smsTemplates.SMS_TEMPLATE_ENABLED_KEYS
]);

function normalizeBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    return ['1', 'true', 'yes', 'on', 'enabled', 'فعال'].includes(String(value).toLowerCase());
}

function normalizeNumber(value, defaultValue, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return defaultValue;
    return Math.min(max, Math.max(min, num));
}

function maskSecret(value) {
    if (!value) return '';
    const stringValue = String(value);
    if (stringValue.length <= 4) return '****';
    return `${'*'.repeat(Math.max(8, stringValue.length - 4))}${stringValue.slice(-4)}`;
}

function isMaskedSecret(value) {
    return typeof value === 'string' && /^\*{4,}.{0,12}$/.test(value.trim());
}

function settingGroupForKey(key) {
    if (PUBLIC_SITE_SETTING_KEYS.has(key)) return 'system';
    if (SYSTEM_BRANDING_SETTING_KEYS.has(key)) return 'system';
    if (AI_SETTING_KEYS.has(key)) return 'ai';
    if (SMS_SETTING_KEYS.has(key)) return 'sms';
    if (key.startsWith('ai_')) return 'ai';
    if (key.startsWith('sms_')) return 'sms';
    return 'system';
}

function normalizeSettingsRows(rows, { maskSecrets = false } = {}) {
    const settings = {};
    rows.forEach(row => {
        const key = row.setting_key;
        settings[key] = maskSecrets && SECRET_SETTING_KEYS.has(key)
            ? maskSecret(row.setting_value)
            : (row.setting_value ?? '');
    });
    return settings;
}

async function ensureSettingsTable(pool) {
    const [rows] = await pool.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' LIMIT 1`
    );
    if (!rows.length) {
        const error = new Error('Database migration required: settings table is missing');
        error.statusCode = 503;
        error.code = 'MIGRATION_REQUIRED';
        throw error;
    }
}

async function ensureDefaultSettings(pool) {
    await ensureSettingsTable(pool);

    const defaults = [
        ['clinic_name', process.env.CLINIC_NAME || '', 'system'],
        ['clinic_short_name', process.env.CLINIC_SHORT_NAME || '', 'system'],
        ['clinic_phone', process.env.CLINIC_PHONE || '', 'system'],
        ['clinic_secondary_phone', process.env.CLINIC_SECONDARY_PHONE || '', 'system'],
        ['clinic_email', process.env.CLINIC_EMAIL || '', 'system'],
        ['clinic_address', process.env.CLINIC_ADDRESS || '', 'system'],
        ['clinic_address_primary', process.env.CLINIC_ADDRESS_PRIMARY || process.env.CLINIC_ADDRESS || '', 'system'],
        ['clinic_address_primary_enabled', process.env.CLINIC_ADDRESS_PRIMARY_ENABLED || 'false', 'system'],
        ['clinic_address_secondary', process.env.CLINIC_ADDRESS_SECONDARY || '', 'system'],
        ['clinic_address_secondary_enabled', process.env.CLINIC_ADDRESS_SECONDARY_ENABLED || 'false', 'system'],
        ['working_hours', process.env.CLINIC_WORKING_HOURS || '', 'system'],
        ['clinic_opening_note', process.env.CLINIC_OPENING_NOTE || '', 'system'],
        ['clinic_latitude', process.env.CLINIC_LATITUDE || '', 'system'],
        ['clinic_longitude', process.env.CLINIC_LONGITUDE || '', 'system'],
        ['clinic_map_url', process.env.CLINIC_MAP_URL || '', 'system'],
        ['footer_signature_text', process.env.FOOTER_SIGNATURE_TEXT || '', 'system'],
        ['footer_signature_url', process.env.FOOTER_SIGNATURE_URL || '', 'system'],
        ['social_whatsapp', process.env.SOCIAL_WHATSAPP || '', 'system'],
        ['social_whatsapp_enabled', process.env.SOCIAL_WHATSAPP_ENABLED || 'false', 'system'],
        ['social_telegram', process.env.SOCIAL_TELEGRAM || '', 'system'],
        ['social_telegram_enabled', process.env.SOCIAL_TELEGRAM_ENABLED || 'false', 'system'],
        ['social_instagram', process.env.SOCIAL_INSTAGRAM || '', 'system'],
        ['social_instagram_enabled', process.env.SOCIAL_INSTAGRAM_ENABLED || 'false', 'system'],
        ['social_bale', process.env.SOCIAL_BALE || '', 'system'],
        ['social_bale_enabled', process.env.SOCIAL_BALE_ENABLED || 'false', 'system'],
        ['social_eitaa', process.env.SOCIAL_EITAA || '', 'system'],
        ['social_eitaa_enabled', process.env.SOCIAL_EITAA_ENABLED || 'false', 'system'],
        ['social_rubika', process.env.SOCIAL_RUBIKA || '', 'system'],
        ['social_rubika_enabled', process.env.SOCIAL_RUBIKA_ENABLED || 'false', 'system'],
        ['social_soroush', process.env.SOCIAL_SOROUSH || '', 'system'],
        ['social_soroush_enabled', process.env.SOCIAL_SOROUSH_ENABLED || 'false', 'system'],
        ['social_gap', process.env.SOCIAL_GAP || '', 'system'],
        ['social_gap_enabled', process.env.SOCIAL_GAP_ENABLED || 'false', 'system'],
        ['social_igap', process.env.SOCIAL_IGAP || '', 'system'],
        ['social_igap_enabled', process.env.SOCIAL_IGAP_ENABLED || 'false', 'system'],
        ['social_nava', process.env.SOCIAL_NAVA || '', 'system'],
        ['social_nava_enabled', process.env.SOCIAL_NAVA_ENABLED || 'false', 'system'],
        ['ai_enabled', process.env.AI_ENABLED || 'false', 'ai'],
        ['ai_base_url', process.env.AI_BASE_URL || '', 'ai'],
        ['ai_api_key', process.env.AI_API_KEY || '', 'ai'],
        ['ai_model', process.env.AI_MODEL || '', 'ai'],
        ['ai_temperature', '0.2', 'ai'],
        ['ai_max_tokens', '400', 'ai'],
        ['ai_use_faq_first', 'true', 'ai'],
        ['ai_system_prompt', 'شما دستیار هوشمند کلینیک چشم\u200cپزشکی دکتر محمدصادق حق\u200cپرست هستید. فقط درباره چشم\u200cپزشکی، خدمات کلینیک، آمادگی مراجعه، هزینه، بیمه، ساعت کاری و نوبت\u200cدهی پاسخ دهید. پاسخ باید فارسی، محترمانه، کوتاه، کاربردی و مستقیم باشد. ابتدا سؤال بیمار را با بهترین پاسخ مرتبط از پرسش\u200cهای پرتکرار و دانش تأییدشده کلینیک جواب بده؛ اگر پاسخ دقیق پیدا نشد، راهنمایی عمومی و ایمن بده. از پاسخ\u200cهای کلی مثل «چه سوالی دارید؟» یا فهرست همه خدمات استفاده نکن، مگر اینکه خود کاربر درباره خدمات کلی پرسیده باشد. تشخیص قطعی، تجویز دارو، تعیین دوز یا تغییر دارو ممنوع است. در علائم هشدار مثل درد شدید، کاهش ناگهانی دید، ضربه، ترشح شدید، تماس مواد شیمیایی، جرقه نور یا سایه در دید، بیمار را به مراجعه فوری به پزشک یا اورژانس راهنمایی کن. در پایان پاسخ\u200cهای مرتبط با علائم، عمل، انتخاب خدمت یا معاینه، خیلی کوتاه بگو برای بررسی دقیق\u200cتر می\u200cتواند از دکمه «رزرو نوبت» سایت وقت بگیرد.', 'ai'],
        ['sms_enabled', process.env.SMS_ENABLED || 'false', 'sms'],
        ['sms_provider', process.env.SMS_PROVIDER || 'kavenegar', 'sms'],
        ['sms_base_url', process.env.SMS_BASE_URL || '', 'sms'],
        ['sms_api_key', process.env.SMS_API_KEY || '', 'sms'],
        ['sms_sender', process.env.SMS_SENDER || '10002000', 'sms'],
        ['sms_otp_template', smsTemplates.getDefaultTemplate('sms_otp_template'), 'sms'],
        ['sms_otp_enabled', 'true', 'sms'],
        ['sms_appointment_template', smsTemplates.getDefaultTemplate('sms_appointment_confirmation_template'), 'sms'],
        ['sms_appointment_confirmation_template', smsTemplates.getDefaultTemplate('sms_appointment_confirmation_template'), 'sms'],
        ['sms_appointment_confirmation_enabled', 'true', 'sms'],
        ['sms_appointment_cancellation_template', smsTemplates.getDefaultTemplate('sms_appointment_cancellation_template'), 'sms'],
        ['sms_appointment_cancellation_enabled', 'true', 'sms'],
        ['sms_appointment_reminder_template', smsTemplates.getDefaultTemplate('sms_appointment_reminder_template'), 'sms'],
        ['sms_payment_success_template', smsTemplates.getDefaultTemplate('sms_payment_success_template'), 'sms'],
        ['sms_payment_success_enabled', 'true', 'sms'],
        ['sms_general_notification_template', smsTemplates.getDefaultTemplate('sms_general_notification_template'), 'sms'],
        ['sms_general_notification_enabled', 'true', 'sms'],
        ['sms_appointment_reminder_enabled', 'true', 'sms'],
        ['sms_appointment_reminder_default_minutes', '1440', 'sms']
    ];

    for (const [key, value, group] of defaults) {
        await pool.query(
            `INSERT INTO settings (setting_key, setting_value, setting_group)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_key = setting_key`,
            [key, value, group]
        );
    }
}

async function getSettingsMap(pool, { maskSecrets = false } = {}) {
    await ensureDefaultSettings(pool);
    const [rows] = await pool.query('SELECT setting_key, setting_value, setting_group FROM settings');
    return normalizeSettingsRows(rows, { maskSecrets });
}

async function upsertSettings(pool, settings, allowedKeys = null) {
    await ensureDefaultSettings(pool);

    for (const [rawKey, rawValue] of Object.entries(settings || {})) {
        const key = String(rawKey || '').trim();
        if (!key) continue;
        if (allowedKeys && !allowedKeys.has(key)) continue;
        if (SECRET_SETTING_KEYS.has(key) && isMaskedSecret(rawValue)) continue;

        const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
        await pool.query(
            `INSERT INTO settings (setting_key, setting_value, setting_group)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_group = VALUES(setting_group)`,
            [key, value, settingGroupForKey(key)]
        );
    }
}

function filterSettings(settings, allowedKeys) {
    return Object.fromEntries(Object.entries(settings || {}).filter(([key]) => allowedKeys.has(key)));
}

module.exports = {
    DEFAULT_CLINIC_NAME,
    SECRET_SETTING_KEYS,
    PUBLIC_SITE_SETTING_KEYS,
    SOCIAL_PLATFORM_KEYS,
    SOCIAL_LINK_SETTING_KEYS,
    SOCIAL_VISIBILITY_SETTING_KEYS,
    SYSTEM_BRANDING_SETTING_KEYS,
    AI_SETTING_KEYS,
    SMS_SETTING_KEYS,
    SMS_TEMPLATE_SETTING_KEYS,
    normalizeBoolean,
    normalizeNumber,
    maskSecret,
    isMaskedSecret,
    settingGroupForKey,
    ensureDefaultSettings,
    getSettingsMap,
    upsertSettings,
    filterSettings
};
