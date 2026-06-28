'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { isProduction } = require('../config/security');

const execFileAsync = promisify(execFile);
const MAX_BYTES = Math.max(1, Number(process.env.MAX_UPLOAD_SIZE_MB || 10)) * 1024 * 1024;
const ALLOWED_CATEGORIES = new Set(['consents', 'medical-records', 'patient-documents']);
const MIME_SIGNATURES = new Map([
  ['application/pdf', buffer => buffer.subarray(0, 5).toString('ascii') === '%PDF-'],
  ['image/jpeg', buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff],
  ['image/png', buffer => buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))],
  ['application/dicom', buffer => buffer.length > 132 && buffer.subarray(128, 132).toString('ascii') === 'DICM']
]);

function parseEncryptionKey(value = process.env.PRIVATE_FILE_ENCRYPTION_KEY) {
  const text = String(value || '').trim();
  let key = null;
  if (/^[0-9a-f]{64}$/i.test(text)) key = Buffer.from(text, 'hex');
  else if (text) {
    try { key = Buffer.from(text, 'base64'); } catch (_) { key = null; }
  }
  if (!key || key.length !== 32) {
    const error = new Error('PRIVATE_FILE_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key');
    error.statusCode = 503;
    error.code = 'FILE_ENCRYPTION_NOT_CONFIGURED';
    throw error;
  }
  return key;
}

function validateFileBuffer(buffer, claimedMime) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error('فایل خالی یا نامعتبر است');
    error.statusCode = 400;
    throw error;
  }
  if (buffer.length > MAX_BYTES) {
    const error = new Error('حجم فایل بیش از حد مجاز است');
    error.statusCode = 413;
    throw error;
  }
  if (buffer.subarray(0, 2).toString('ascii') === 'MZ' || buffer.subarray(0, 4).equals(Buffer.from('7f454c46', 'hex')) || buffer.subarray(0, 2).toString('ascii') === '#!') {
    const error = new Error('فایل اجرایی مجاز نیست');
    error.statusCode = 415;
    throw error;
  }
  const mime = String(claimedMime || '').split(';')[0].trim().toLowerCase();
  const detector = MIME_SIGNATURES.get(mime);
  if (!detector || !detector(buffer)) {
    const error = new Error('نوع واقعی فایل با نوع اعلام‌شده سازگار نیست یا پشتیبانی نمی‌شود');
    error.statusCode = 415;
    throw error;
  }
  return mime;
}

function encryptBuffer(buffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv, tag };
}

function decryptBuffer(encrypted, key, iv, tag) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

async function malwareScan(buffer) {
  const scanner = String(process.env.CLAMDSCAN_PATH || '').trim();
  const required = isProduction || String(process.env.MALWARE_SCAN_REQUIRED || '').toLowerCase() === 'true';
  if (!scanner) {
    if (required) {
      const error = new Error('Malware scanner is required but not configured');
      error.statusCode = 503;
      error.code = 'MALWARE_SCANNER_NOT_CONFIGURED';
      throw error;
    }
    return 'not_configured';
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'noorvista-scan-'));
  const tempFile = path.join(tempDir, crypto.randomUUID());
  try {
    await fs.promises.writeFile(tempFile, buffer, { mode: 0o600 });
    await execFileAsync(scanner, ['--no-summary', tempFile], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    return 'clean';
  } catch (error) {
    const scanError = new Error('فایل در بررسی بدافزار تأیید نشد');
    scanError.statusCode = 422;
    scanError.code = 'MALWARE_SCAN_FAILED';
    throw scanError;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function normalizeOriginalName(name) {
  const base = path.basename(String(name || 'document')).replace(/[\r\n\0]/g, '').slice(0, 240);
  return base || 'document';
}

async function assertUploadPermission(pool, user, category, patientId) {
  const role = String(user.role || '').toLowerCase();
  if (['system_admin', 'admin', 'clinic_admin', 'clinic_manager'].includes(role)) return;
  if (['receptionist', 'reception', 'staff'].includes(role)) {
    if (category === 'medical-records') {
      const error = new Error('منشی اجازه بارگذاری فایل پزشکی در پرونده را ندارد');
      error.statusCode = 403;
      throw error;
    }
    return;
  }
  if (role === 'doctor') {
    const doctorId = Number(user.doctor_id);
    const [rows] = await pool.query(
      `SELECT id FROM appointments WHERE doctor_id = ? AND patient_id = ?
       AND status NOT IN ('cancelled','no_show') LIMIT 1`,
      [doctorId, patientId]
    );
    if (rows.length) return;
  }
  const error = new Error('اجازه بارگذاری فایل برای این بیمار وجود ندارد');
  error.statusCode = 403;
  throw error;
}

async function assertDownloadPermission(pool, user, metadata) {
  const role = String(user.role || '').toLowerCase();
  if (['system_admin', 'admin', 'clinic_admin', 'clinic_manager'].includes(role)) return;
  if (role === 'patient' && Number(user.patient_id) === Number(metadata.patient_id)) return;
  if (['receptionist', 'reception', 'staff'].includes(role) && metadata.category !== 'medical-records') return;
  if (role === 'doctor') {
    const [rows] = await pool.query(
      `SELECT id FROM appointments WHERE doctor_id = ? AND patient_id = ?
       AND status NOT IN ('cancelled','no_show') LIMIT 1`,
      [Number(user.doctor_id), Number(metadata.patient_id)]
    );
    if (rows.length) return;
  }
  const error = new Error('دسترسی به این فایل مجاز نیست');
  error.statusCode = 403;
  throw error;
}

async function savePrivateFile(pool, options) {
  const category = String(options.category || '').trim();
  const patientId = Number(options.patientId);
  if (!ALLOWED_CATEGORIES.has(category) || !Number.isInteger(patientId) || patientId <= 0) {
    const error = new Error('دسته‌بندی یا شناسه بیمار معتبر نیست');
    error.statusCode = 400;
    throw error;
  }
  await assertUploadPermission(pool, options.user, category, patientId);
  const mime = validateFileBuffer(options.buffer, options.mimeType);
  const scanStatus = await malwareScan(options.buffer);
  const key = parseEncryptionKey(options.encryptionKey);
  const { encrypted, iv, tag } = encryptBuffer(options.buffer, key);
  const sha256 = crypto.createHash('sha256').update(options.buffer).digest('hex');
  const storageName = `${crypto.randomUUID()}.nvenc`;
  const rootDir = path.resolve(options.rootDir || process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'var', 'private-uploads'));
  const categoryDir = path.join(rootDir, category);
  await fs.promises.mkdir(categoryDir, { recursive: true, mode: 0o700 });
  const target = path.join(categoryDir, storageName);
  await fs.promises.writeFile(target, encrypted, { mode: 0o600, flag: 'wx' });

  try {
    const [result] = await pool.query(
      `INSERT INTO private_files
       (category, patient_id, medical_record_id, appointment_id, storage_name, original_name,
        mime_type, size_bytes, sha256, encryption_iv, encryption_tag, scan_status, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [category, patientId, options.medicalRecordId || null, options.appointmentId || null, storageName,
       normalizeOriginalName(options.originalName), mime, options.buffer.length, sha256, iv, tag, scanStatus, options.user.id]
    );
    return { id: result.insertId, mime_type: mime, size_bytes: options.buffer.length, sha256, scan_status: scanStatus };
  } catch (error) {
    await fs.promises.unlink(target).catch(() => {});
    throw error;
  }
}

async function readPrivateFile(pool, { id, user, rootDir, encryptionKey }) {
  const [rows] = await pool.query(
    `SELECT * FROM private_files WHERE id = ? AND status = 'active' LIMIT 1`,
    [Number(id)]
  );
  const metadata = rows[0];
  if (!metadata) {
    const error = new Error('فایل یافت نشد');
    error.statusCode = 404;
    throw error;
  }
  await assertDownloadPermission(pool, user, metadata);
  const root = path.resolve(rootDir || process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'var', 'private-uploads'));
  const target = path.resolve(root, metadata.category, metadata.storage_name);
  if (!target.startsWith(path.join(root, metadata.category) + path.sep)) {
    const error = new Error('مسیر فایل نامعتبر است');
    error.statusCode = 400;
    throw error;
  }
  const encrypted = await fs.promises.readFile(target);
  const key = parseEncryptionKey(encryptionKey);
  const buffer = decryptBuffer(encrypted, key, Buffer.from(metadata.encryption_iv), Buffer.from(metadata.encryption_tag));
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(checksum, 'hex'), Buffer.from(metadata.sha256, 'hex'))) {
    const error = new Error('یکپارچگی فایل تأیید نشد');
    error.statusCode = 500;
    error.code = 'FILE_INTEGRITY_FAILED';
    throw error;
  }
  return { metadata, buffer };
}

module.exports = {
  ALLOWED_CATEGORIES,
  MAX_BYTES,
  parseEncryptionKey,
  validateFileBuffer,
  encryptBuffer,
  decryptBuffer,
  malwareScan,
  savePrivateFile,
  readPrivateFile
};
