'use strict';

const DEFAULT_CLINIC_NAME = 'کلینیک چشم پزشکی دکتر محمدصادق حق پرست';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const SMS_TEMPLATE_DEFINITIONS = Object.freeze([
  {
    key: 'sms_otp_template',
    enabledKey: 'sms_otp_enabled',
    title: 'کد ورود / تأیید شماره موبایل',
    category: 'احراز هویت',
    icon: 'icon-lock',
    description: 'برای ارسال کد یک‌بارمصرف ورود با پیامک استفاده می‌شود.',
    defaultText: 'کد تأیید {{clinic_name}}: {{code}}\nاین کد تا {{expires_minutes}} دقیقه معتبر است.',
    variables: [
      { key: 'code', label: 'کد تأیید', sample: '123456' },
      { key: 'expires_minutes', label: 'مدت اعتبار', sample: '۵' },
      { key: 'clinic_name', label: 'نام کلینیک', sample: DEFAULT_CLINIC_NAME }
    ]
  },
  {
    key: 'sms_appointment_confirmation_template',
    enabledKey: 'sms_appointment_confirmation_enabled',
    legacyKey: 'sms_appointment_template',
    title: 'رزرو / تأیید نوبت',
    category: 'نوبت‌دهی',
    icon: 'icon-calendar',
    description: 'بعد از قطعی‌شدن نوبت یا تأیید پرداخت برای بیمار ارسال می‌شود.',
    defaultText: '{{patient_name}} عزیز، نوبت شما برای {{service_name}} با {{doctor_name}} در {{center_name}} ثبت شد. تاریخ: {{appointment_date}} ساعت {{appointment_time}}. شماره نوبت: {{queue_number}}. کد پیگیری: {{tracking_code}}',
    variables: [
      { key: 'patient_name', label: 'نام بیمار', sample: 'علی رضایی' },
      { key: 'doctor_name', label: 'نام پزشک', sample: 'دکتر محمدصادق حق پرست' },
      { key: 'center_name', label: 'مرکز درمانی', sample: DEFAULT_CLINIC_NAME },
      { key: 'service_name', label: 'خدمت', sample: 'ویزیت چشم' },
      { key: 'appointment_date', label: 'تاریخ نوبت', sample: '۳۱ خرداد ۱۴۰۵' },
      { key: 'appointment_time', label: 'ساعت نوبت', sample: '۰۸:۳۰' },
      { key: 'queue_number', label: 'شماره نوبت', sample: '۳' },
      { key: 'queue_capacity', label: 'ظرفیت بازه', sample: '۵' },
      { key: 'tracking_code', label: 'کد پیگیری', sample: 'NV-14050331-1234' }
    ]
  },
  {
    key: 'sms_appointment_cancellation_template',
    enabledKey: 'sms_appointment_cancellation_enabled',
    title: 'لغو نوبت',
    category: 'نوبت‌دهی',
    icon: 'icon-ban',
    description: 'وقتی نوبت از سمت بیمار، پزشک یا پذیرش لغو می‌شود ارسال می‌شود.',
    defaultText: '{{patient_name}} عزیز، نوبت {{service_name}} با {{doctor_name}} در تاریخ {{appointment_date}} ساعت {{appointment_time}} لغو شد. علت: {{reason}}. کد پیگیری: {{tracking_code}}',
    variables: [
      { key: 'patient_name', label: 'نام بیمار', sample: 'علی رضایی' },
      { key: 'doctor_name', label: 'نام پزشک', sample: 'دکتر محمدصادق حق پرست' },
      { key: 'service_name', label: 'خدمت', sample: 'ویزیت چشم' },
      { key: 'appointment_date', label: 'تاریخ نوبت', sample: '۳۱ خرداد ۱۴۰۵' },
      { key: 'appointment_time', label: 'ساعت نوبت', sample: '۰۸:۳۰' },
      { key: 'reason', label: 'علت لغو', sample: 'درخواست بیمار' },
      { key: 'tracking_code', label: 'کد پیگیری', sample: 'NV-14050331-1234' },
      { key: 'clinic_phone', label: 'تلفن کلینیک', sample: '02100000000' }
    ]
  },
  {
    key: 'sms_appointment_reminder_template',
    enabledKey: 'sms_appointment_reminder_enabled',
    legacyKey: 'sms_appointment_template',
    title: 'یادآوری نوبت',
    category: 'یادآوری',
    icon: 'icon-clock-o',
    description: 'برای یادآوری زمان مراجعه قبل از نوبت استفاده می‌شود.',
    defaultText: '{{patient_name}} عزیز، یادآوری نوبت شما در {{center_name}} با {{doctor_name}}، تاریخ {{appointment_date}} ساعت {{appointment_time}}. لطفاً کمی زودتر در کلینیک حضور داشته باشید.',
    variables: [
      { key: 'patient_name', label: 'نام بیمار', sample: 'علی رضایی' },
      { key: 'doctor_name', label: 'نام پزشک', sample: 'دکتر محمدصادق حق پرست' },
      { key: 'center_name', label: 'مرکز درمانی', sample: DEFAULT_CLINIC_NAME },
      { key: 'appointment_date', label: 'تاریخ نوبت', sample: '۳۱ خرداد ۱۴۰۵' },
      { key: 'appointment_time', label: 'ساعت نوبت', sample: '۰۸:۳۰' },
      { key: 'clinic_phone', label: 'تلفن کلینیک', sample: '02100000000' }
    ]
  },
  {
    key: 'sms_payment_success_template',
    enabledKey: 'sms_payment_success_enabled',
    title: 'پرداخت موفق نوبت',
    category: 'پرداخت',
    icon: 'icon-credit-card',
    description: 'برای اطلاع‌رسانی پرداخت موفق و کد پیگیری رزرو قابل استفاده است.',
    defaultText: '{{patient_name}} عزیز، پرداخت نوبت شما با مبلغ {{amount}} تومان با موفقیت ثبت شد. کد پیگیری: {{tracking_code}}. تاریخ نوبت: {{appointment_date}} ساعت {{appointment_time}}',
    variables: [
      { key: 'patient_name', label: 'نام بیمار', sample: 'علی رضایی' },
      { key: 'amount', label: 'مبلغ', sample: '۴۰۰,۰۰۰' },
      { key: 'tracking_code', label: 'کد پیگیری', sample: 'NV-14050331-1234' },
      { key: 'appointment_date', label: 'تاریخ نوبت', sample: '۳۱ خرداد ۱۴۰۵' },
      { key: 'appointment_time', label: 'ساعت نوبت', sample: '۰۸:۳۰' },
      { key: 'center_name', label: 'مرکز درمانی', sample: DEFAULT_CLINIC_NAME }
    ]
  },
  {
    key: 'sms_general_notification_template',
    enabledKey: 'sms_general_notification_enabled',
    title: 'پیام عمومی و اطلاع‌رسانی',
    category: 'عمومی',
    icon: 'icon-bell',
    description: 'برای پیام‌های عمومی سامانه، اطلاع‌رسانی‌های کلینیک و پیام‌های دستی کاربرد دارد.',
    defaultText: '{{patient_name}} عزیز، {{message}}\n{{clinic_name}}',
    variables: [
      { key: 'patient_name', label: 'نام مخاطب', sample: 'بیمار گرامی' },
      { key: 'message', label: 'متن پیام', sample: 'پیام شما با موفقیت ثبت شد.' },
      { key: 'clinic_name', label: 'نام کلینیک', sample: DEFAULT_CLINIC_NAME },
      { key: 'clinic_phone', label: 'تلفن کلینیک', sample: '02100000000' }
    ]
  }
]);

const SMS_TEMPLATE_KEYS = new Set(SMS_TEMPLATE_DEFINITIONS.map(item => item.key));
const SMS_TEMPLATE_ENABLED_KEYS = new Set(SMS_TEMPLATE_DEFINITIONS.map(item => item.enabledKey).filter(Boolean));
const LEGACY_TEMPLATE_KEYS = new Set(SMS_TEMPLATE_DEFINITIONS.map(item => item.legacyKey).filter(Boolean));
const ALL_SMS_TEMPLATE_KEYS = new Set([...SMS_TEMPLATE_KEYS, ...LEGACY_TEMPLATE_KEYS]);

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

function moneyText(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return '۰';
  return toPersianDigits(Math.round(num).toLocaleString('en-US'));
}

function clean(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function defaultTemplateMap() {
  return Object.fromEntries(SMS_TEMPLATE_DEFINITIONS.map(item => [item.key, item.defaultText]));
}

function getDefinition(key) {
  return SMS_TEMPLATE_DEFINITIONS.find(item => item.key === key || item.legacyKey === key) || null;
}

function getDefaultTemplate(key) {
  return getDefinition(key)?.defaultText || '';
}

function isEnabledValue(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on', 'enabled', 'فعال'].includes(String(value).trim().toLowerCase());
}

function isTemplateEnabled(settings = {}, key, defaultValue = true) {
  const definition = getDefinition(key);
  if (!definition?.enabledKey) return defaultValue;
  return isEnabledValue(settings[definition.enabledKey], defaultValue);
}

function renderSmsTemplate(template, variables = {}) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (variables[key] === undefined || variables[key] === null) return '';
    return String(variables[key]);
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function appointmentVariables(row = {}, options = {}) {
  const capacity = Math.max(1, Number(row.capacity || row.queue_capacity || 1));
  const queueNumber = row.appointment_queue_number || row.queue_number || '1';
  return {
    patient_name: clean(row.patient_name, 'بیمار گرامی'),
    patient_phone: clean(row.patient_phone),
    doctor_name: clean(row.doctor_name, 'پزشک'),
    center_name: clean(row.medical_center_name || row.center_name, DEFAULT_CLINIC_NAME),
    clinic_name: clean(row.medical_center_name || row.center_name || options.clinic_name, DEFAULT_CLINIC_NAME),
    clinic_phone: clean(options.clinic_phone || row.clinic_phone),
    service_name: clean(row.service_name, 'خدمت درمانی'),
    appointment_date: dateText(row.appointment_date),
    appointment_time: timeText(row.appointment_time || row.start_time),
    queue_number: toPersianDigits(queueNumber),
    queue_capacity: toPersianDigits(capacity),
    tracking_code: clean(row.tracking_code, '-'),
    reason: clean(options.reason, 'لغو نوبت'),
    amount: moneyText(row.amount || row.payment_amount || options.amount),
    message: clean(options.message)
  };
}

function templateRowsFromSettings(settings = {}) {
  return SMS_TEMPLATE_DEFINITIONS.map(definition => {
    const legacyValue = definition.legacyKey ? settings[definition.legacyKey] : '';
    const value = settings[definition.key] || legacyValue || definition.defaultText;
    const enabled = isEnabledValue(settings[definition.enabledKey], true);
    return { ...definition, value, enabled };
  });
}

function sanitizeTemplatePayload(payload = {}) {
  const templateSource = payload.templates && typeof payload.templates === 'object' ? payload.templates : payload;
  const enabledSource = payload.enabled && typeof payload.enabled === 'object' ? payload.enabled : payload;
  const sanitized = {};

  for (const definition of SMS_TEMPLATE_DEFINITIONS) {
    if (Object.prototype.hasOwnProperty.call(templateSource || {}, definition.key)) {
      sanitized[definition.key] = String(templateSource[definition.key] ?? '').trim().slice(0, 1200);
    }

    if (definition.enabledKey && Object.prototype.hasOwnProperty.call(enabledSource || {}, definition.key)) {
      sanitized[definition.enabledKey] = isEnabledValue(enabledSource[definition.key], true) ? 'true' : 'false';
    } else if (definition.enabledKey && Object.prototype.hasOwnProperty.call(enabledSource || {}, definition.enabledKey)) {
      sanitized[definition.enabledKey] = isEnabledValue(enabledSource[definition.enabledKey], true) ? 'true' : 'false';
    }
  }
  return sanitized;
}

module.exports = {
  SMS_TEMPLATE_DEFINITIONS,
  SMS_TEMPLATE_KEYS,
  SMS_TEMPLATE_ENABLED_KEYS,
  LEGACY_TEMPLATE_KEYS,
  ALL_SMS_TEMPLATE_KEYS,
  toPersianDigits,
  dateText,
  timeText,
  defaultTemplateMap,
  getDefinition,
  getDefaultTemplate,
  isEnabledValue,
  isTemplateEnabled,
  renderSmsTemplate,
  appointmentVariables,
  templateRowsFromSettings,
  sanitizeTemplatePayload
};
