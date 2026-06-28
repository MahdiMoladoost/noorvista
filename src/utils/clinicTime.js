'use strict';

const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Tehran';

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw Object.assign(new Error('تاریخ باید با قالب YYYY-MM-DD باشد'), { statusCode: 400 });
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw Object.assign(new Error('تاریخ نامعتبر است'), { statusCode: 400 });
  }
  return { year, month, day, iso: `${match[1]}-${match[2]}-${match[3]}`, utcDate: date };
}

function parseTime(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw Object.assign(new Error('زمان باید با قالب HH:mm باشد'), { statusCode: 400 });
  const hour = Number(match[1]); const minute = Number(match[2]); const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) throw Object.assign(new Error('زمان نامعتبر است'), { statusCode: 400 });
  return { hour, minute, second };
}

function saturdayBasedWeekday(dateValue) {
  const { utcDate } = parseDateOnly(dateValue);
  const jsDay = utcDate.getUTCDay(); // Sunday=0 ... Saturday=6
  return jsDay === 6 ? 0 : jsDay + 1; // Saturday=0 ... Friday=6
}

function zonedParts(epochMs, timeZone = CLINIC_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(epochMs));
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
}

function zonedDateTimeToUtc(dateValue, timeValue, timeZone = CLINIC_TIMEZONE) {
  const date = parseDateOnly(dateValue); const time = parseTime(timeValue);
  const desiredUtcLike = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, time.second);
  let guess = desiredUtcLike;
  for (let i = 0; i < 3; i += 1) {
    const actual = zonedParts(guess, timeZone);
    const actualUtcLike = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour === 24 ? 0 : actual.hour, actual.minute, actual.second);
    guess += desiredUtcLike - actualUtcLike;
  }
  const check = zonedParts(guess, timeZone);
  if (check.year !== date.year || check.month !== date.month || check.day !== date.day ||
      (check.hour === 24 ? 0 : check.hour) !== time.hour || check.minute !== time.minute) {
    throw Object.assign(new Error('زمان محلی در منطقه زمانی کلینیک معتبر نیست'), { statusCode: 400 });
  }
  return new Date(guess);
}

function formatClinicDateTime(value, timeZone = CLINIC_TIMEZONE, locale = 'fa-IR') {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

module.exports = { CLINIC_TIMEZONE, parseDateOnly, parseTime, saturdayBasedWeekday, zonedDateTimeToUtc, formatClinicDateTime };
