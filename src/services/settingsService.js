// src/services/settingsService.js
// Centralized system/AI/SMS settings access. Secrets are never returned unmasked to admin UI.

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

const SMS_SETTING_KEYS = new Set([
    'sms_enabled',
    'sms_provider',
    'sms_base_url',
    'sms_api_key',
    'sms_sender',
    'sms_otp_template',
    'sms_appointment_template',
    'sms_appointment_reminder_enabled',
    'sms_appointment_reminder_default_minutes'
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
    await pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(100) UNIQUE NOT NULL,
            setting_value TEXT,
            setting_group VARCHAR(50) DEFAULT 'system',
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_setting_key (setting_key),
            INDEX idx_setting_group (setting_group)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);
}

async function ensureDefaultSettings(pool) {
    await ensureSettingsTable(pool);

    const defaults = [
        ['ai_enabled', process.env.AI_ENABLED || 'false', 'ai'],
        ['ai_base_url', process.env.AI_BASE_URL || 'https://api.gapgpt.app/v1', 'ai'],
        ['ai_api_key', process.env.AI_API_KEY || '', 'ai'],
        ['ai_model', process.env.AI_MODEL || 'gapgpt-qwen-3.5', 'ai'],
        ['ai_temperature', '0.7', 'ai'],
        ['ai_max_tokens', '500', 'ai'],
        ['ai_use_faq_first', 'true', 'ai'],
        ['ai_system_prompt', 'شما یک دستیار هوشمند برای کلینیک تخصصی چشم پزشکی NoorVista هستید. فقط به پرسش‌های مرتبط با چشم‌پزشکی و خدمات کلینیک پاسخ دهید. پاسخ‌ها باید فارسی، مؤدبانه، کوتاه و بدون ادعای تشخیص قطعی باشند. در موارد اورژانسی یا علائم شدید، کاربر را به مراجعه فوری به پزشک یا اورژانس راهنمایی کنید.', 'ai'],
        ['sms_enabled', process.env.SMS_ENABLED || 'false', 'sms'],
        ['sms_provider', process.env.SMS_PROVIDER || 'kavenegar', 'sms'],
        ['sms_base_url', process.env.SMS_BASE_URL || '', 'sms'],
        ['sms_api_key', process.env.SMS_API_KEY || '', 'sms'],
        ['sms_sender', process.env.SMS_SENDER || '10002000', 'sms'],
        ['sms_otp_template', '', 'sms'],
        ['sms_appointment_template', '{{patient_name}} عزیز، نوبت شما در تاریخ {{appointment_date}} ساعت {{appointment_time}} است.', 'sms'],
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
    SECRET_SETTING_KEYS,
    AI_SETTING_KEYS,
    SMS_SETTING_KEYS,
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
