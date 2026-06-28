'use strict';

const crypto = require('crypto');
const os = require('os');
const smsService = require('./smsService');
const { assertSchema } = require('../database/schemaGuard');
const { CLINIC_TIMEZONE } = require('../utils/clinicTime');

function clean(value, max = 1000) { return String(value || '').trim().slice(0, max); }
function stableIdempotencyKey(type, entityId, variant = 'default') {
  const raw = `${clean(type, 80)}:${clean(entityId, 100)}:${clean(variant, 100)}`;
  return `${clean(type, 40)}:${crypto.createHash('sha256').update(raw).digest('hex')}`;
}
function retryDelaySeconds(attempt) {
  const safeAttempt = Math.max(1, Math.min(10, Number(attempt) || 1));
  return Math.min(6 * 60 * 60, 30 * (2 ** (safeAttempt - 1)));
}
async function ensureSchema(connection) {
  return assertSchema(connection, 'SMS outbox', { tables: ['sms_outbox'] });
}
async function enqueue(connection, item) {
  await ensureSchema(connection);
  const receptor = smsService.normalizePhone(item.receptor);
  const message = clean(item.message, 4000);
  const idempotencyKey = clean(item.idempotencyKey, 191);
  if (!receptor || !message || !idempotencyKey) {
    const error = new Error('receptor, message and idempotencyKey are required'); error.statusCode = 400; throw error;
  }
  const [result] = await connection.query(
    `INSERT INTO sms_outbox
      (idempotency_key, message_type, receptor, message, payload_json, related_entity_type, related_entity_id, max_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [idempotencyKey, clean(item.messageType, 80) || 'transactional', receptor, message,
      item.payload ? JSON.stringify(item.payload) : null, clean(item.relatedEntityType, 80) || null,
      item.relatedEntityId || null, Math.max(1, Math.min(20, Number(item.maxAttempts) || Number(process.env.SMS_OUTBOX_MAX_ATTEMPTS) || 6))]
  );
  return { id: result.insertId, queued: result.affectedRows === 1, duplicate: result.affectedRows !== 1, idempotency_key: idempotencyKey };
}
async function claimNext(pool, workerId = `${os.hostname()}:${process.pid}`) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); await ensureSchema(connection);
    const [rows] = await connection.query(
      `SELECT * FROM sms_outbox
       WHERE status IN ('pending','retry') AND available_at <= NOW()
       ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`
    );
    if (!rows.length) { await connection.commit(); return null; }
    const row = rows[0];
    await connection.query(
      `UPDATE sms_outbox SET status='processing', locked_at=NOW(), locked_by=?, attempts=attempts+1 WHERE id=?`,
      [clean(workerId, 120), row.id]
    );
    await connection.commit();
    return { ...row, attempts: Number(row.attempts || 0) + 1 };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function claimById(pool, id, workerId = `${os.hostname()}:${process.pid}`) {
  const smsId = Number(id);
  if (!Number.isInteger(smsId) || smsId <= 0) return null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); await ensureSchema(connection);
    const [rows] = await connection.query('SELECT *, available_at <= NOW() AS available_now FROM sms_outbox WHERE id=? LIMIT 1 FOR UPDATE', [smsId]);
    if (!rows.length) { await connection.commit(); return null; }
    const row = rows[0];
    if (!['pending', 'retry'].includes(String(row.status || '')) || !Number(row.available_now)) {
      await connection.commit();
      return { ...row, claimed: false };
    }
    await connection.query(
      `UPDATE sms_outbox SET status='processing', locked_at=NOW(), locked_by=?, attempts=attempts+1 WHERE id=?`,
      [clean(workerId, 120), row.id]
    );
    await connection.commit();
    return { ...row, claimed: true, status: 'processing', attempts: Number(row.attempts || 0) + 1 };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
function providerMessageId(result) {
  const response = result?.response;
  if (Array.isArray(response) && response[0]?.messageid) return String(response[0].messageid);
  if (response?.messageid) return String(response.messageid);
  return null;
}
async function markAppointment(pool, row, status, error = null) {
  if (row.related_entity_type !== 'appointment' || !row.related_entity_id) return;
  const cancellation = row.message_type === 'appointment_cancellation';
  const statusColumn = cancellation ? 'cancellation_sms_status' : 'confirmation_sms_status';
  const sentColumn = cancellation ? 'cancellation_sms_sent_at' : 'confirmation_sms_sent_at';
  const errorColumn = cancellation ? 'cancellation_sms_error' : 'confirmation_sms_error';
  await pool.query(
    `UPDATE appointments SET ${statusColumn}=?,
      ${sentColumn}=CASE WHEN ?='sent' THEN NOW() ELSE ${sentColumn} END,
      ${errorColumn}=? WHERE id=?`,
    [status, status, error ? clean(error, 1000) : null, row.related_entity_id]
  );
}
async function processClaimed(pool, row) {
  try {
    const result = await smsService.sendSms(pool, { receptor: row.receptor, message: row.message });
    if (result?.skipped) {
      const reason = clean(result.message || 'سرویس پیامک هنوز آماده ارسال نیست', 1000);
      await pool.query(
        `UPDATE sms_outbox SET status='pending', attempts=GREATEST(attempts-1,0),
         available_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE), locked_at=NULL, locked_by=NULL,
         last_error=? WHERE id=? AND status='processing'`,
        [reason, row.id]
      );
      await markAppointment(pool, row, 'queued', reason);
      return { success: false, skipped: true, queued: true, status: 'pending', id: row.id, error: reason };
    }
    await pool.query(
      `UPDATE sms_outbox SET status='sent', sent_at=NOW(), locked_at=NULL, locked_by=NULL,
       provider=?, provider_message_id=?, provider_response_json=?, last_error=NULL WHERE id=? AND status='processing'`,
      [clean(result?.provider, 80) || null, providerMessageId(result), JSON.stringify(result?.response || null), row.id]
    );
    await markAppointment(pool, row, 'sent');
    return { success: true, status: 'sent', id: row.id };
  } catch (error) {
    const dead = Number(row.attempts) >= Number(row.max_attempts || 6);
    const delay = retryDelaySeconds(row.attempts);
    await pool.query(
      `UPDATE sms_outbox SET status=?, available_at=DATE_ADD(NOW(), INTERVAL ? SECOND),
       locked_at=NULL, locked_by=NULL, last_error=? WHERE id=? AND status='processing'`,
      [dead ? 'dead' : 'retry', delay, clean(error.message || error, 1000), row.id]
    );
    await markAppointment(pool, row, dead ? 'failed' : 'queued', error.message || error);
    return { success: false, queued: !dead, status: dead ? 'dead' : 'retry', id: row.id, dead, error: error.message || String(error) };
  }
}
async function processNext(pool, workerId) {
  const row = await claimNext(pool, workerId); if (!row) return null;
  return processClaimed(pool, row);
}
async function processById(pool, id, workerId) {
  const row = await claimById(pool, id, workerId);
  if (!row) return { success: false, skipped: true, status: 'missing', id: Number(id) || null };
  if (!row.claimed) {
    return {
      success: row.status === 'sent',
      skipped: row.status !== 'sent',
      queued: ['pending', 'retry', 'processing'].includes(String(row.status || '')),
      status: row.status,
      id: row.id,
      error: row.last_error || null
    };
  }
  return processClaimed(pool, row);
}
async function recoverStale(pool, minutes = 10) {
  await ensureSchema(pool);
  const [result] = await pool.query(
    `UPDATE sms_outbox SET status='retry', locked_at=NULL, locked_by=NULL, available_at=NOW(),
       last_error=COALESCE(last_error,'Recovered stale processing lock')
     WHERE status='processing' AND locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [Math.max(1, Number(minutes) || 10)]
  );
  return result.affectedRows || 0;
}

function validDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
function clinicDateIso(value = new Date(), timeZone = CLINIC_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}
function maskPhone(value) {
  const phone = clean(value, 30);
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}
async function list(pool, filters = {}) {
  await ensureSchema(pool);
  const today = clinicDateIso();
  const dateFrom = validDate(filters.date_from) || today;
  const dateTo = validDate(filters.date_to) || dateFrom;
  const status = ['pending','processing','retry','sent','dead'].includes(String(filters.status || '')) ? String(filters.status) : '';
  const messageType = clean(filters.message_type, 80);
  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const limit = Math.max(10, Math.min(100, Number.parseInt(filters.limit, 10) || 30));
  const offset = (page - 1) * limit;
  const where = ['created_at >= ?', 'created_at < DATE_ADD(?, INTERVAL 1 DAY)'];
  const params = [`${dateFrom} 00:00:00`, dateTo];
  if (status) { where.push('status = ?'); params.push(status); }
  if (messageType) { where.push('message_type = ?'); params.push(messageType); }

  const [rows] = await pool.query(
    `SELECT id, message_type, receptor, message, related_entity_type, related_entity_id,
            status, attempts, max_attempts, available_at, provider, provider_message_id,
            sent_at, last_error, created_at, updated_at
     FROM sms_outbox WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [totalRows] = await pool.query(`SELECT COUNT(*) AS total FROM sms_outbox WHERE ${where.join(' AND ')}`, params);
  const [summaryRows] = await pool.query(
    `SELECT status, COUNT(*) AS count FROM sms_outbox
     WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY status`,
    [`${dateFrom} 00:00:00`, dateTo]
  );
  const [types] = await pool.query(
    `SELECT DISTINCT message_type FROM sms_outbox
     WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
     ORDER BY message_type`,
    [`${dateFrom} 00:00:00`, dateTo]
  );
  const summary = { total: 0, pending: 0, processing: 0, retry: 0, sent: 0, dead: 0 };
  summaryRows.forEach((row) => { const key = String(row.status || ''); const count = Number(row.count || 0); if (key in summary) summary[key] = count; summary.total += count; });
  return {
    items: rows.map((row) => ({ ...row, receptor: maskPhone(row.receptor) })),
    summary,
    message_types: types.map((row) => row.message_type).filter(Boolean),
    pagination: { page, limit, total: Number(totalRows[0]?.total || 0), pages: Math.max(1, Math.ceil(Number(totalRows[0]?.total || 0) / limit)) },
    filters: { date_from: dateFrom, date_to: dateTo, status, message_type: messageType }
  };
}
async function retry(pool, id) {
  await ensureSchema(pool);
  const smsId = Number(id);
  if (!Number.isInteger(smsId) || smsId <= 0) { const error = new Error('شناسه پیامک نامعتبر است'); error.statusCode = 400; throw error; }
  const [result] = await pool.query(
    `UPDATE sms_outbox
     SET status='retry', available_at=NOW(), locked_at=NULL, locked_by=NULL, last_error=NULL
     WHERE id=? AND status IN ('dead','retry')`,
    [smsId]
  );
  if (!result.affectedRows) { const error = new Error('این پیامک در وضعیت قابل ارسال مجدد نیست'); error.statusCode = 409; throw error; }
  return { id: smsId, queued: true };
}

module.exports = { stableIdempotencyKey, retryDelaySeconds, enqueue, claimNext, claimById, processClaimed, processNext, processById, recoverStale, list, retry, maskPhone };
