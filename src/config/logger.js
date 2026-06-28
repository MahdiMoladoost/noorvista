'use strict';

const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = process.env.LOG_DIR || 'logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true, mode: 0o750 });

const SECRET_KEYS = /pass(word)?|token|authorization|cookie|secret|otp|api[_-]?key|card|national[_-]?code|medical[_-]?history|diagnosis|prescription/i;
const PHONE = /(?:\+98|0098|0)?9\d{9}/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CARD = /\b(?:\d[ -]*?){16}\b/g;

function scrubString(value) {
  return String(value)
    .replace(EMAIL, '[REDACTED_EMAIL]')
    .replace(PHONE, '[REDACTED_PHONE]')
    .replace(CARD, '[REDACTED_CARD]');
}

function redact(value, key = '', seen = new WeakSet()) {
  if (SECRET_KEYS.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return scrubString(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => redact(item, '', seen));
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey, seen)]));
}

const redactFormat = winston.format((info) => redact(info));
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  format: winston.format.combine(
    redactFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: process.env.NODE_ENV !== 'production' }),
    winston.format.json()
  ),
  defaultMeta: { service: 'noorvista-clinic' },
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error', options: { mode: 0o640 } }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log'), options: { mode: 0o640 } })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({ format: winston.format.combine(redactFormat(), winston.format.simple()) }));
}

module.exports = logger;
module.exports.redact = redact;
