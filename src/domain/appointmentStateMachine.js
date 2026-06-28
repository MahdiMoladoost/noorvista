'use strict';

const ALIASES = new Map([['canceled', 'cancelled']]);
const STATUS_LABELS = Object.freeze({
  pending: 'در انتظار تأیید',
  confirmed: 'تأییدشده',
  rescheduled: 'تغییر زمان داده‌شده',
  completed: 'انجام‌شده',
  no_show: 'عدم مراجعه',
  cancelled: 'لغوشده'
});
function statusLabel(value) {
  const normalized = normalizeStatus(value);
  return STATUS_LABELS[normalized] || 'نامشخص';
}
const TRANSITIONS = new Map([
  ['pending', new Set(['confirmed', 'cancelled', 'rescheduled'])],
  ['confirmed', new Set(['completed', 'no_show', 'cancelled', 'rescheduled'])],
  ['rescheduled', new Set(['confirmed', 'cancelled'])],
  ['completed', new Set()],
  ['no_show', new Set()],
  ['cancelled', new Set()]
]);

function normalizeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ALIASES.get(normalized) || normalized;
}

function knownStatus(value) { return TRANSITIONS.has(normalizeStatus(value)); }
function canTransition(from, to) {
  const source = normalizeStatus(from || 'pending');
  const target = normalizeStatus(to);
  if (!knownStatus(source) || !knownStatus(target)) return false;
  if (source === target) return true;
  return TRANSITIONS.get(source).has(target);
}
function assertTransition(from, to) {
  const source = normalizeStatus(from || 'pending');
  const target = normalizeStatus(to);
  if (!knownStatus(target)) {
    const error = new Error('وضعیت نوبت نامعتبر است'); error.statusCode = 400; error.code = 'INVALID_APPOINTMENT_STATUS'; throw error;
  }
  if (!canTransition(source, target)) {
    let explanation;
    if (target === 'cancelled' && source === 'completed') {
      explanation = 'این نوبت قبلاً به‌عنوان انجام‌شده ثبت شده و دیگر قابل لغو نیست. برای حفظ سوابق مالی و پرونده بیمار، آن را در لیست نگه دارید یا در صورت نیاز فقط یادداشت اصلاحی ثبت کنید.';
    } else if (target === 'cancelled' && source === 'no_show') {
      explanation = 'برای این نوبت وضعیت عدم مراجعه ثبت شده و دیگر قابل لغو نیست. برای تغییر گزارش‌ها، یادداشت مدیریتی ثبت کنید یا نوبت جدید بسازید.';
    } else if (source === 'cancelled') {
      explanation = 'تغییر وضعیت نوبت لغوشده به وضعیت دیگر مجاز نیست؛ برای جلوگیری از ناسازگاری ظرفیت و پرداخت، یک نوبت جدید ثبت کنید.';
    } else {
      explanation = `تغییر وضعیت نوبت از «${statusLabel(source)}» به «${statusLabel(target)}» مجاز نیست.`;
    }
    const error = new Error(explanation);
    error.statusCode = 409; error.code = 'INVALID_APPOINTMENT_TRANSITION'; error.from = source; error.to = target; throw error;
  }
  return target;
}
module.exports = { normalizeStatus, knownStatus, canTransition, assertTransition, statusLabel, STATUS_LABELS, TRANSITIONS };
