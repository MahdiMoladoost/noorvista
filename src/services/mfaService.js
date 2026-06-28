'use strict';

const crypto = require('crypto');
const { secret, isProduction } = require('../config/security');

const MFA_KEY = crypto.createHash('sha256').update(secret('MFA_ENCRYPTION_KEY')).digest();
const RECOVERY_PEPPER = secret('MFA_RECOVERY_PEPPER');
const STAFF_ROLES = new Set([
  'system_admin', 'admin', 'super_admin', 'site_admin', 'clinic_admin',
  'clinic_manager', 'manager', 'doctor', 'receptionist', 'reception'
]);
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isStaffRole(role) {
  return STAFF_ROLES.has(normalizeRole(role));
}

function isMfaExplicitlyDisabled() {
  return ['false', '0', 'no', 'off', 'disabled'].includes(
    String(process.env.MFA_REQUIRED_FOR_STAFF || '').trim().toLowerCase()
  ) || ['true', '1', 'yes', 'on'].includes(
    String(process.env.MFA_DISABLE_ALL || '').trim().toLowerCase()
  );
}

function isMfaRequiredForRole(role) {
  if (!isStaffRole(role)) return false;
  if (isMfaExplicitlyDisabled()) return false;
  if (String(process.env.MFA_REQUIRED_FOR_STAFF || '').trim().toLowerCase() === 'true') return true;
  if (isProduction) return true;
  return false;
}

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(value) {
  const normalized = String(value || '').toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function counterBuffer(counter) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  return buffer;
}

function generateTotp(secretValue, at = Date.now(), stepSeconds = 30, digits = 6) {
  const counter = Math.floor(Number(at) / 1000 / stepSeconds);
  const digest = crypto.createHmac('sha1', base32Decode(secretValue)).update(counterBuffer(counter)).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

function verifyTotp(secretValue, code, { at = Date.now(), window = 1 } = {}) {
  const normalized = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateTotp(secretValue, Number(at) + offset * 30_000);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return true;
  }
  return false;
}

function encryptSecret(secretValue) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MFA_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(secretValue), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptSecret(payload) {
  const packed = Buffer.from(String(payload || ''), 'base64');
  if (packed.length < 29) throw new Error('Invalid encrypted MFA secret');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', MFA_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function recoveryHash(userId, code) {
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHmac('sha256', RECOVERY_PEPPER).update(`${userId}:${normalized}`).digest('hex');
}

function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(crypto.randomBytes(8)).slice(0, 12);
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

function otpauthUri({ secretValue, username, issuer = 'NoorVista' }) {
  const label = encodeURIComponent(`${issuer}:${username}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secretValue)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  isMfaExplicitlyDisabled,
  isStaffRole,
  isMfaRequiredForRole,
  generateSecret,
  generateTotp,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  recoveryHash,
  generateRecoveryCodes,
  otpauthUri,
  base32Encode,
  base32Decode
};
