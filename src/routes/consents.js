'use strict';

const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const crypto = require('crypto');
const db = require('../config/db');
const { protect, restrictTo, isPatient } = require('../middleware/auth');
const { assertSchema } = require('../database/schemaGuard');

const router = createAsyncRouter(express);
const CONSENT_TYPES = new Set(['treatment', 'surgery', 'image', 'sms', 'data_processing', 'ai_processing']);

const COMPATIBLE_CONSENT_DOCUMENTS = Object.freeze([
  {
    id: 91001,
    consent_type: 'treatment',
    version: '1.0',
    title: 'رضایت آگاهانه برای دریافت خدمات درمانی',
    content: 'با مطالعه این متن تأیید می‌کنم که توضیحات لازم درباره روند معاینه و درمان، منافع مورد انتظار، محدودیت‌ها و احتمال نیاز به بررسی‌های تکمیلی را دریافت کرده‌ام. می‌دانم که می‌توانم پیش از انجام هر اقدام درمانی پرسش‌های خود را مطرح کنم و رضایت خود را تا پیش از شروع اقدام، با هماهنگی کلینیک پس بگیرم.'
  },
  {
    id: 91002,
    consent_type: 'sms',
    version: '1.0',
    title: 'اجازه ارسال پیامک‌های مرتبط با درمان',
    content: 'اجازه می‌دهم پیامک‌های ضروری مرتبط با نوبت، یادآوری مراجعه، تغییر برنامه پزشک و پیگیری خدمات درمانی به شماره ثبت‌شده در پرونده من ارسال شود. این اجازه شامل پیام‌های تبلیغاتی خارج از خدمات کلینیک نیست و هر زمان می‌توانم آن را لغو کنم.'
  },
  {
    id: 91003,
    consent_type: 'data_processing',
    version: '1.0',
    title: 'رضایت پردازش اطلاعات پرونده سلامت',
    content: 'اجازه می‌دهم اطلاعات هویتی، تماس، نوبت‌ها، پرداخت‌ها و اطلاعات پزشکی ضروری من فقط برای ارائه خدمات درمانی، نگهداری پرونده، هماهنگی مراجعه و الزامات قانونی کلینیک پردازش و نگهداری شود. دسترسی به این اطلاعات باید محدود به افراد مجاز باشد.'
  }
]);


function cleanText(value, max = 1000) {
  return String(value || '').trim().replace(/\r\n/g, '\n').slice(0, max);
}
function contentHash(content) {
  return crypto.createHash('sha256').update(String(content).replace(/\r\n/g, '\n').trim(), 'utf8').digest('hex');
}

function compatibleDocuments() {
  return COMPATIBLE_CONSENT_DOCUMENTS.map((document) => ({
    ...document,
    content_hash: contentHash(document.content),
    published_at: null,
    compatibility_mode: true
  }));
}

function compatibleDocumentById(documentId) {
  return compatibleDocuments().find((document) => Number(document.id) === Number(documentId)) || null;
}

async function consentSchemaMode(connection) {
  try {
    await ensureSchema(connection);
    return 'full';
  } catch (error) {
    if (error?.code === 'MIGRATION_REQUIRED') return 'compatible';
    throw error;
  }
}

async function listCompatiblePatientConsents(connection, patientId) {
  try {
    const [rows] = await connection.query(
      `SELECT id, consent_type, document_version, document_hash, accepted_at, revoked_at,
              NULL AS revocation_reason, NULL AS signed_name, NULL AS document_id
       FROM patient_consents
       WHERE patient_id = ? ORDER BY accepted_at DESC`,
      [patientId]
    );
    const titles = new Map(compatibleDocuments().map((document) => [document.consent_type, document.title]));
    return rows.map((row) => ({ ...row, title: titles.get(String(row.consent_type)) || null, compatibility_mode: true }));
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

function validId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
async function ensureSchema(connection) {
  await assertSchema(connection, 'consent workflow', {
    tables: ['consent_documents', 'patient_consents', 'consent_audit'],
    columns: {
      patient_consents: ['consent_document_id', 'source', 'signed_name', 'revoked_by_user_id', 'revocation_reason']
    }
  });
}

function consentErrorMessage(error, fallback) {
  if (error?.code === 'MIGRATION_REQUIRED') {
    return 'بخش رضایت‌نامه‌ها در حالت سازگار در دسترس است؛ مدیر سامانه می‌تواند برای فعال‌شدن ثبت جزئیات کامل، به‌روزرسانی پایگاه داده را اجرا کند.';
  }
  return error?.statusCode ? error.message : fallback;
}
async function audit(connection, req, action, values = {}) {
  await connection.query(
    `INSERT INTO consent_audit
      (actor_user_id, patient_id, consent_document_id, patient_consent_id, action, reason, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, values.patientId || null, values.documentId || null, values.consentId || null,
      action, cleanText(values.reason, 500) || null, req.ip || null, cleanText(req.get('user-agent'), 500) || null]
  );
}

router.use(protect);

router.get('/documents', async (req, res) => {
  try {
    const pool = await db.getPool();
    const mode = await consentSchemaMode(pool);
    const requestedType = cleanText(req.query.type, 100);
    if (mode === 'compatible') {
      const documents = compatibleDocuments().filter((document) => !requestedType || document.consent_type === requestedType);
      return res.json({ success: true, documents, compatibility_mode: true });
    }
    const params = [];
    let where = "status = 'active'";
    if (requestedType) { where += ' AND consent_type = ?'; params.push(requestedType); }
    const [rows] = await pool.query(
      `SELECT id, consent_type, version, title, content, content_hash, published_at
       FROM consent_documents WHERE ${where} ORDER BY consent_type, published_at DESC`, params
    );
    return res.json({ success: true, documents: rows });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: consentErrorMessage(error, 'خطا در دریافت متن رضایت‌نامه‌ها') });
  }
});

router.get('/me', restrictTo('patient'), isPatient, async (req, res) => {
  try {
    const pool = await db.getPool();
    const mode = await consentSchemaMode(pool);
    if (mode === 'compatible') {
      const rows = await listCompatiblePatientConsents(pool, req.patientId);
      return res.json({ success: true, consents: rows, compatibility_mode: true });
    }
    const [rows] = await pool.query(
      `SELECT pc.id, pc.consent_type, pc.document_version, pc.document_hash, pc.accepted_at, pc.revoked_at,
              pc.revocation_reason, pc.signed_name, cd.id AS document_id, cd.title
       FROM patient_consents pc
       LEFT JOIN consent_documents cd ON cd.id = pc.consent_document_id
       WHERE pc.patient_id = ? ORDER BY pc.accepted_at DESC`, [req.patientId]
    );
    await audit(pool, req, 'read', { patientId: req.patientId });
    return res.json({ success: true, consents: rows });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: consentErrorMessage(error, 'خطا در دریافت رضایت‌های ثبت‌شده') });
  }
});

router.post('/:documentId/accept', restrictTo('patient'), isPatient, async (req, res) => {
  const documentId = validId(req.params.documentId);
  const signedName = cleanText(req.body?.signed_name, 255);
  if (!documentId || !req.patientId) return res.status(403).json({ success: false, message: 'ثبت رضایت فقط توسط بیمار احرازشده ممکن است' });
  if (signedName.length < 3) return res.status(400).json({ success: false, message: 'نام و نام خانوادگی تأییدکننده الزامی است' });
  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const mode = await consentSchemaMode(connection);
    if (mode === 'compatible') {
      const document = compatibleDocumentById(documentId);
      if (!document) { await connection.rollback(); return res.status(404).json({ success: false, message: 'رضایت‌نامه فعال یافت نشد' }); }
      await connection.query(
        `UPDATE patient_consents SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE patient_id = ? AND consent_type = ? AND revoked_at IS NULL`,
        [req.patientId, document.consent_type]
      );
      const [result] = await connection.query(
        `INSERT INTO patient_consents
         (patient_id, consent_type, document_version, document_hash, accepted_at,
          accepted_by_user_id, ip_address, user_agent)
         VALUES (?, ?, ?, ?, NOW(), ?, ?, ?)`,
        [req.patientId, document.consent_type, document.version, document.content_hash,
          req.user.id, req.ip || null, cleanText(req.get('user-agent'), 500) || null]
      );
      await connection.commit();
      return res.status(201).json({
        success: true,
        consent_id: result.insertId,
        compatibility_mode: true,
        message: 'رضایت شما ثبت شد. پس از تکمیل به‌روزرسانی پایگاه داده، جزئیات امضا نیز نگهداری خواهد شد.'
      });
    }
    const [documents] = await connection.query(
      `SELECT id, consent_type, version, content_hash FROM consent_documents
       WHERE id = ? AND status = 'active' LIMIT 1 FOR UPDATE`, [documentId]
    );
    const document = documents[0];
    if (!document) { await connection.rollback(); return res.status(404).json({ success: false, message: 'رضایت‌نامه فعال یافت نشد' }); }
    await connection.query(
      `UPDATE patient_consents SET revoked_at = COALESCE(revoked_at, NOW()), revoked_by_user_id = ?,
         revocation_reason = COALESCE(revocation_reason, 'نسخه جدید پذیرفته شد')
       WHERE patient_id = ? AND consent_type = ? AND revoked_at IS NULL`,
      [req.user.id, req.patientId, document.consent_type]
    );
    const [result] = await connection.query(
      `INSERT INTO patient_consents
       (patient_id, consent_document_id, consent_type, document_version, document_hash, accepted_at,
        accepted_by_user_id, source, signed_name, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, 'patient_portal', ?, ?, ?)`,
      [req.patientId, document.id, document.consent_type, document.version, document.content_hash,
        req.user.id, signedName, req.ip || null, cleanText(req.get('user-agent'), 500) || null]
    );
    await audit(connection, req, 'accept', { patientId: req.patientId, documentId, consentId: result.insertId });
    await connection.commit();
    return res.status(201).json({ success: true, consent_id: result.insertId, message: 'رضایت شما با نسخه و اثر انگشت متن ثبت شد' });
  } catch (error) {
    await connection.rollback();
    return res.status(error.statusCode || 500).json({ success: false, message: consentErrorMessage(error, 'خطا در ثبت رضایت') });
  } finally { connection.release(); }
});

router.post('/:consentId/revoke', restrictTo('patient'), isPatient, async (req, res) => {
  const consentId = validId(req.params.consentId);
  const reason = cleanText(req.body?.reason, 500);
  if (!consentId || !req.patientId) return res.status(403).json({ success: false, message: 'لغو رضایت فقط توسط بیمار احرازشده ممکن است' });
  if (reason.length < 3) return res.status(400).json({ success: false, message: 'دلیل لغو رضایت الزامی است' });
  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const mode = await consentSchemaMode(connection);
    if (mode === 'compatible') {
      const [result] = await connection.query(
        `UPDATE patient_consents SET revoked_at = NOW()
         WHERE id = ? AND patient_id = ? AND revoked_at IS NULL`, [consentId, req.patientId]
      );
      if (!result.affectedRows) { await connection.rollback(); return res.status(404).json({ success: false, message: 'رضایت فعال یافت نشد' }); }
      await connection.commit();
      return res.json({ success: true, compatibility_mode: true, message: 'لغو رضایت ثبت شد.' });
    }
    const [result] = await connection.query(
      `UPDATE patient_consents SET revoked_at = NOW(), revoked_by_user_id = ?, revocation_reason = ?
       WHERE id = ? AND patient_id = ? AND revoked_at IS NULL`, [req.user.id, reason, consentId, req.patientId]
    );
    if (!result.affectedRows) { await connection.rollback(); return res.status(404).json({ success: false, message: 'رضایت فعال یافت نشد' }); }
    await audit(connection, req, 'revoke', { patientId: req.patientId, consentId, reason });
    await connection.commit();
    return res.json({ success: true, message: 'لغو رضایت ثبت شد؛ اثر آن بر خدمات جاری باید با کلینیک بررسی شود' });
  } catch (error) {
    await connection.rollback();
    return res.status(error.statusCode || 500).json({ success: false, message: consentErrorMessage(error, 'خطا در لغو رضایت') });
  } finally { connection.release(); }
});

const consentEditor = restrictTo('system_admin', 'admin', 'clinic_admin', 'clinic_manager', 'doctor');

router.get('/admin/documents', consentEditor, async (req, res) => {
  const pool = await db.getPool(); await ensureSchema(pool);
  const [rows] = await pool.query(`SELECT id, consent_type, version, title, content_hash, status,
    clinical_reviewed_at, legal_reviewed_at, published_at, retired_at, created_at, updated_at
    FROM consent_documents ORDER BY created_at DESC`);
  return res.json({ success: true, documents: rows });
});

router.post('/admin/documents', consentEditor, async (req, res) => {
  const type = cleanText(req.body?.consent_type, 100);
  const version = cleanText(req.body?.version, 50);
  const title = cleanText(req.body?.title, 255);
  const content = cleanText(req.body?.content, 100000);
  if (!CONSENT_TYPES.has(type) || !version || title.length < 3 || content.length < 50) {
    return res.status(400).json({ success: false, message: 'نوع، نسخه، عنوان و متن معتبر رضایت‌نامه الزامی است' });
  }
  const pool = await db.getPool(); const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); await ensureSchema(connection);
    const [result] = await connection.query(
      `INSERT INTO consent_documents (consent_type, version, title, content, content_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`, [type, version, title, content, contentHash(content), req.user.id]
    );
    await audit(connection, req, 'create_document', { documentId: result.insertId });
    await connection.commit();
    return res.status(201).json({ success: true, id: result.insertId, status: 'draft' });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'این نوع و نسخه قبلاً ثبت شده است' });
    return res.status(500).json({ success: false, message: 'خطا در ایجاد رضایت‌نامه' });
  } finally { connection.release(); }
});

router.post('/admin/documents/:id/clinical-review', consentEditor, restrictTo('doctor', 'system_admin', 'admin'), async (req, res) => {
  const id = validId(req.params.id); if (!id) return res.status(400).json({ success: false, message: 'شناسه نامعتبر است' });
  const pool = await db.getPool(); await ensureSchema(pool);
  const [result] = await pool.query(`UPDATE consent_documents SET clinical_reviewed_by = ?, clinical_reviewed_at = NOW(),
    status = IF(status='draft','review',status) WHERE id = ? AND status IN ('draft','review')`, [req.user.id, id]);
  if (!result.affectedRows) return res.status(409).json({ success: false, message: 'سند قابل بازبینی نیست' });
  await audit(pool, req, 'clinical_review', { documentId: id });
  return res.json({ success: true });
});

router.post('/admin/documents/:id/legal-review', consentEditor, restrictTo('system_admin', 'admin'), async (req, res) => {
  const id = validId(req.params.id); if (!id) return res.status(400).json({ success: false, message: 'شناسه نامعتبر است' });
  const pool = await db.getPool(); await ensureSchema(pool);
  const [result] = await pool.query(`UPDATE consent_documents SET legal_reviewed_by = ?, legal_reviewed_at = NOW(),
    status = IF(status='draft','review',status) WHERE id = ? AND status IN ('draft','review')`, [req.user.id, id]);
  if (!result.affectedRows) return res.status(409).json({ success: false, message: 'سند قابل بازبینی نیست' });
  await audit(pool, req, 'legal_review', { documentId: id });
  return res.json({ success: true });
});

router.post('/admin/documents/:id/publish', consentEditor, restrictTo('system_admin', 'admin'), async (req, res) => {
  const id = validId(req.params.id); if (!id) return res.status(400).json({ success: false, message: 'شناسه نامعتبر است' });
  const pool = await db.getPool(); const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); await ensureSchema(connection);
    const [docs] = await connection.query('SELECT consent_type, clinical_reviewed_at, legal_reviewed_at FROM consent_documents WHERE id = ? AND status = \'review\' FOR UPDATE', [id]);
    if (!docs[0]?.clinical_reviewed_at || !docs[0]?.legal_reviewed_at) {
      await connection.rollback(); return res.status(409).json({ success: false, message: 'تأیید بالینی و حقوقی پیش از انتشار الزامی است' });
    }
    await connection.query("UPDATE consent_documents SET status='retired', retired_at=NOW() WHERE consent_type=? AND status='active'", [docs[0].consent_type]);
    await connection.query("UPDATE consent_documents SET status='active', published_by=?, published_at=NOW() WHERE id=?", [req.user.id, id]);
    await audit(connection, req, 'publish', { documentId: id });
    await connection.commit(); return res.json({ success: true });
  } catch (error) { await connection.rollback(); return res.status(500).json({ success: false, message: 'خطا در انتشار رضایت‌نامه' }); }
  finally { connection.release(); }
});

module.exports = router;
