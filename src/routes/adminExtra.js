// src/routes/adminExtra.js
// Stable admin add-ons: system-admin level backups, logs and helper endpoints.
const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const db = require('../config/db');
const { protect } = require('../middleware/auth');
const { assertSchema } = require('../database/schemaGuard');

const router = createAsyncRouter(express);
const BACKUP_DIR = path.join(process.cwd(), 'backups', 'admin');

function normalizeRoleName(role) {
    const raw = String(role || '').trim().toLowerCase();
    const normalized = raw.replace(/[\s-]+/g, '_');
    const compact = normalized.replace(/_/g, '');
    const faCompact = String(role || '').replace(/\s+/g, '').trim();
    return { raw, normalized, compact, faCompact };
}

function isSystemAdminRole(role) {
    const { normalized, compact, faCompact } = normalizeRoleName(role);
    const allowed = new Set([
        'system_admin', 'admin', 'super_admin', 'site_admin', 'owner',
        'systemadmin', 'superadmin', 'siteadmin'
    ]);
    const allowedFa = new Set([
        'مدیرسیستم', 'مديرسيستم', 'مدیرسایت', 'مديرسايت',
        'مدیرکل', 'مديركل', 'ادمین', 'ادمين'
    ]);
    return allowed.has(normalized) || allowed.has(compact) || allowedFa.has(faCompact);
}

function adminOnly(req, res, next) {
    if (!isSystemAdminRole(req.user?.role)) {
        console.warn('Admin API forbidden for role:', req.user?.role || 'unknown');
        return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }
    next();
}

router.use(protect, adminOnly);


// ---------- Robust user management overrides for admin panel ----------
const bcrypt = require('bcryptjs');

function boolValue(value) {
    if (value === true || value === 1 || value === '1' || value === 'true') return 1;
    if (value === false || value === 0 || value === '0' || value === 'false') return 0;
    return value ? 1 : 0;
}
async function insertDynamic(connection, table, data) {
    const col = await columns(connection, table);
    const entries = Object.entries(data).filter(([key, value]) => col.has(key) && value !== undefined);
    if (!entries.length) return { insertId: null };
    const sql = `INSERT INTO \`${table}\` SET ` + entries.map(([key]) => `\`${key}\` = ?`).join(', ');
    const [result] = await connection.query(sql, entries.map(([, value]) => value));
    return result;
}
async function updateDynamic(connection, table, data, whereSql, whereParams) {
    const col = await columns(connection, table);
    const entries = Object.entries(data).filter(([key, value]) => col.has(key) && value !== undefined);
    if (!entries.length) return;
    const sql = `UPDATE \`${table}\` SET ` + entries.map(([key]) => `\`${key}\` = ?`).join(', ') + ' ' + whereSql;
    await connection.query(sql, [...entries.map(([, value]) => value), ...whereParams]);
}
function userNameExpr(userCols) {
    const parts = [];
    if (userCols.has('full_name')) parts.push('u.full_name');
    if (userCols.has('fullname')) parts.push('u.fullname');
    if (userCols.has('name')) parts.push('u.name');
    parts.push('u.username');
    return `COALESCE(${parts.join(', ')})`;
}



router.get('/users/:id', async (req, res) => {
    const connection = await pool();
    const userCols = await columns(connection, 'users');
    const fullName = userNameExpr(userCols);
    const [rows] = await connection.query(`SELECT u.*, ${fullName} AS full_name FROM users u WHERE u.id = ? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
    delete rows[0].password; delete rows[0].password_hash;
    res.json({ success: true, user: rows[0] });
});









async function pool() { return db.getPool(); }
async function ensureDir() { await fsp.mkdir(BACKUP_DIR, { recursive: true }); }
async function tableExists(connection, tableName) {
    const [rows] = await connection.query('SHOW TABLES LIKE ?', [tableName]);
    return rows.length > 0;
}
async function columns(connection, tableName) {
    try {
        const [rows] = await connection.query('SHOW COLUMNS FROM `' + tableName.replace(/`/g, '') + '`');
        return new Set(rows.map(r => r.Field));
    } catch (_) { return new Set(); }
}
async function ensureAdminTables(connection) {
    return assertSchema(connection, 'admin backup and audit tables', {
        backups: ['id', 'filename', 'filepath', 'size', 'created_by', 'created_at'],
        logs: ['id', 'user_id', 'type', 'action', 'details', 'ip_address', 'created_at']
    });
}

function safeFilename(filename) {
    const base = path.basename(String(filename || ''));
    if (!/^backup_[\w.-]+\.nvbak$/i.test(base)) return null;
    return base;
}
function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
}


// ---------- Robust clinic-management endpoints for system admin ----------
function sqlCoalesce(colSet, alias, candidates, fallbackSql = "''") {
    const parts = candidates.filter(c => colSet.has(c)).map(c => `${alias}.\`${c}\``);
    parts.push(fallbackSql);
    return `COALESCE(${parts.join(', ')})`;
}
function userDisplayExpr(colSet, alias = 'u') {
    return sqlCoalesce(colSet, alias, ['full_name', 'fullname', 'name', 'username'], `${alias}.username`);
}
function doctorSpecialtyExpr(colSet, alias = 'doc') {
    return sqlCoalesce(colSet, alias, ['specialty', 'specialization', 'sub_specialty'], "''");
}
function doctorLicenseExpr(colSet, alias = 'doc') {
    return sqlCoalesce(colSet, alias, ['license_number', 'medical_license_number'], "''");
}
function normalizeRoleForStaff(role) {
    const r = String(role || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (r === 'reception') return 'receptionist';
    return r;
}



router.get('/doctors/:id', async (req, res) => {
    try {
        const connection = await pool();
        const userCols = await columns(connection, 'users');
        const docCols = await columns(connection, 'doctors');
        const fullName = userDisplayExpr(userCols, 'u');
        const spec = doctorSpecialtyExpr(docCols, 'doc');
        const license = doctorLicenseExpr(docCols, 'doc');
        const [rows] = await connection.query(
            `SELECT doc.*, doc.id AS doctor_id, ${fullName} AS full_name, u.username, u.phone, u.email, u.is_active,
                    ${spec} AS specialty, ${license} AS license_number
             FROM doctors doc JOIN users u ON u.id = doc.user_id
             WHERE doc.id = ? OR doc.user_id = ? LIMIT 1`,
            [req.params.id, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'پزشک یافت نشد' });
        res.json({ success: true, doctor: rows[0] });
    } catch (error) {
        console.error('Admin robust get doctor error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت پزشک' });
    }
});

router.put('/doctors/:id', async (req, res) => {
    try {
        const connection = await pool();
        const docId = req.params.id;
        const [docRows] = await connection.query('SELECT * FROM doctors WHERE id = ? OR user_id = ? LIMIT 1', [docId, docId]);
        if (!docRows.length) return res.status(404).json({ success: false, message: 'پزشک یافت نشد' });
        const doc = docRows[0];
        const fullName = req.body.full_name || req.body.name;
        if (fullName || req.body.phone || req.body.email || req.body.is_active !== undefined) {
            await updateDynamic(connection, 'users', {
                full_name: fullName, fullname: fullName, name: fullName,
                phone: req.body.phone, email: req.body.email,
                is_active: req.body.is_active !== undefined ? boolValue(req.body.is_active) : undefined,
                updated_at: new Date()
            }, 'WHERE id = ?', [doc.user_id]);
        }
        const spec = req.body.specialty || req.body.specialization;
        const lic = req.body.license_number || req.body.medical_license_number;
        await updateDynamic(connection, 'doctors', {
            specialty: spec, specialization: spec, sub_specialty: req.body.sub_specialty,
            license_number: lic, medical_license_number: lic,
            experience_years: req.body.experience_years,
            consultation_fee: req.body.consultation_fee,
            bio: req.body.bio,
            is_available: req.body.is_available !== undefined ? boolValue(req.body.is_available) : undefined,
            updated_at: new Date()
        }, 'WHERE id = ?', [doc.id]);
        res.json({ success: true, message: 'اطلاعات پزشک ذخیره شد' });
    } catch (error) {
        console.error('Admin robust update doctor error:', error);
        res.status(500).json({ success: false, message: 'خطا در ذخیره پزشک' });
    }
});

router.delete('/doctors/:id', async (req, res) => {
    try {
        const connection = await pool();
        const [docRows] = await connection.query('SELECT user_id FROM doctors WHERE id = ? OR user_id = ? LIMIT 1', [req.params.id, req.params.id]);
        if (docRows.length) await updateDynamic(connection, 'users', { is_active: 0, updated_at: new Date() }, 'WHERE id = ?', [docRows[0].user_id]);
        res.json({ success: true, message: 'پزشک غیرفعال شد' });
    } catch (error) {
        console.error('Admin robust delete doctor error:', error);
        res.status(500).json({ success: false, message: 'خطا در حذف پزشک' });
    }
});



router.get('/staff', async (req, res) => {
    try {
        const connection = await pool();
        const userCols = await columns(connection, 'users');
        const fullName = userDisplayExpr(userCols, 'u');
        const [rows] = await connection.query(
            `SELECT u.id, ${fullName} AS full_name, u.username, u.phone, u.email, u.role, u.is_active, u.created_at AS hire_date
             FROM users u
             WHERE u.role IN ('clinic_admin','clinic_manager','receptionist','reception','staff')
             ORDER BY FIELD(u.role,'clinic_admin','clinic_manager','receptionist','reception','staff'), ${fullName}`
        );
        res.json({ success: true, staff: rows, data: rows });
    } catch (error) {
        console.error('Admin robust get staff error:', error);
        res.status(500).json({ success: false, message: 'خطا در بارگذاری کارکنان' });
    }
});

router.get('/staff/:id', async (req, res) => {
    try {
        const connection = await pool();
        const userCols = await columns(connection, 'users');
        const fullName = userDisplayExpr(userCols, 'u');
        const [rows] = await connection.query(`SELECT u.*, ${fullName} AS full_name FROM users u WHERE u.id = ? LIMIT 1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'کارمند یافت نشد' });
        delete rows[0].password; delete rows[0].password_hash;
        res.json({ success: true, staff: rows[0] });
    } catch (error) {
        console.error('Admin robust get staff item error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت کارمند' });
    }
});

router.post('/staff', async (req, res) => {
    try {
        const connection = await pool();
        const { full_name, fullname, username, phone, email, password } = req.body || {};
        const name = full_name || fullname || req.body.name;
        const role = normalizeRoleForStaff(req.body.role || 'receptionist');
        if (!name || !username || !phone || !password) {
            return res.status(400).json({ success: false, message: 'نام، نام کاربری، تلفن و رمز عبور الزامی است' });
        }
        const [dups] = await connection.query('SELECT id FROM users WHERE username = ? OR phone = ? OR (email IS NOT NULL AND email <> "" AND email = ?) LIMIT 1', [username, phone, email || '']);
        if (dups.length) return res.status(409).json({ success: false, message: 'نام کاربری، موبایل یا ایمیل قبلاً ثبت شده است' });
        const hash = await bcrypt.hash(password, 10);
        const result = await insertDynamic(connection, 'users', {
            full_name: name, fullname: name, name, username, phone, email, role,
            password: hash, password_hash: hash, is_active: 1, created_at: new Date(), updated_at: new Date()
        });
        res.json({ success: true, message: 'کارمند ثبت شد', id: result.insertId });
    } catch (error) {
        console.error('Admin robust create staff error:', error);
        res.status(500).json({ success: false, message: 'خطا در ثبت کارمند' });
    }
});

router.put('/staff/:id', async (req, res) => {
    try {
        const connection = await pool();
        const fullName = req.body.full_name || req.body.fullname || req.body.name;
        const data = {
            full_name: fullName, fullname: fullName, name: fullName,
            username: req.body.username, phone: req.body.phone, email: req.body.email,
            role: normalizeRoleForStaff(req.body.role || 'receptionist'), updated_at: new Date()
        };
        if (req.body.password && String(req.body.password).trim()) {
            const hash = await bcrypt.hash(req.body.password, 10);
            data.password = hash; data.password_hash = hash;
        }
        await updateDynamic(connection, 'users', data, 'WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'اطلاعات کارمند ذخیره شد' });
    } catch (error) {
        console.error('Admin robust update staff error:', error);
        res.status(500).json({ success: false, message: 'خطا در ذخیره کارمند' });
    }
});
router.put('/staff/:id/status', async (req, res) => {
    const connection = await pool();
    await updateDynamic(connection, 'users', { is_active: boolValue(req.body?.is_active), updated_at: new Date() }, 'WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'وضعیت کارمند تغییر کرد' });
});
router.delete('/staff/:id', async (req, res) => {
    const connection = await pool();
    await updateDynamic(connection, 'users', { is_active: 0, updated_at: new Date() }, 'WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'کارمند غیرفعال شد' });
});











router.get('/payments', async (req, res) => {
    try {
        const connection = await pool();
        const userCols = await columns(connection, 'users');
        const paymentCols = await columns(connection, 'payments');
        const patientName = userDisplayExpr(userCols, 'pu');
        const where = [];
        const params = [];
        if (req.query.start) { where.push('DATE(pay.payment_date) >= ?'); params.push(req.query.start); }
        if (req.query.end) { where.push('DATE(pay.payment_date) <= ?'); params.push(req.query.end); }
        if (req.query.status && req.query.status !== 'all') { where.push('pay.status = ?'); params.push(req.query.status); }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const amountExpr = paymentCols.has('amount') ? 'pay.amount' : (paymentCols.has('final_amount') ? 'pay.final_amount' : '0');
        const [rows] = await connection.query(
            `SELECT pay.*, ${amountExpr} AS amount, ${patientName} AS patient_name
             FROM payments pay
             LEFT JOIN appointments a ON a.id = pay.appointment_id
             LEFT JOIN patients pat ON pat.id = a.patient_id
             LEFT JOIN users pu ON pu.id = pat.user_id
             ${whereSql}
             ORDER BY pay.payment_date DESC, pay.id DESC`, params);
        const paid = rows.filter(r => ['completed','paid','success'].includes(String(r.status || '').toLowerCase()));
        const pending = rows.filter(r => String(r.status || '').toLowerCase() === 'pending');
        const sum = list => list.reduce((acc, r) => acc + Number(r.amount || r.final_amount || 0), 0);
        const [checkoutSessions] = await connection.query(`
            SELECT r.id, r.patient_id, r.doctor_id, r.appointment_slot_id,
                   r.medical_center_id, r.service_id, r.appointment_date,
                   r.appointment_time, r.amount, r.currency, r.status,
                   r.provider, r.provider_authority, r.provider_reference,
                   r.payment_id, r.appointment_id, r.expires_at, r.paid_at,
                   r.cancelled_at, r.failed_at, r.last_error_code,
                   r.last_error_message, r.created_at, r.updated_at,
                   ${patientName} AS patient_name, pu.phone AS patient_phone,
                   du.full_name AS doctor_name, d.specialty AS doctor_specialty,
                   mc.name AS medical_center_name, s.name AS service_name,
                   (SELECT COUNT(*) FROM appointment_payment_events e WHERE e.reservation_id=r.id) AS event_count,
                   (SELECT e2.event_type FROM appointment_payment_events e2 WHERE e2.reservation_id=r.id ORDER BY e2.id DESC LIMIT 1) AS latest_event_type,
                   (SELECT e3.created_at FROM appointment_payment_events e3 WHERE e3.reservation_id=r.id ORDER BY e3.id DESC LIMIT 1) AS latest_event_at
            FROM appointment_payment_reservations r
            JOIN patients pat ON pat.id=r.patient_id
            JOIN users pu ON pu.id=pat.user_id
            JOIN doctors d ON d.id=r.doctor_id
            JOIN users du ON du.id=d.user_id
            LEFT JOIN medical_centers mc ON mc.id=r.medical_center_id
            LEFT JOIN services s ON s.id=r.service_id
            ORDER BY r.created_at DESC
            LIMIT 500`);
        if (checkoutSessions.length) {
            const ids = checkoutSessions.map(item => Number(item.id));
            const placeholders = ids.map(() => '?').join(',');
            const [events] = await connection.query(
                `SELECT id, reservation_id, payment_id, appointment_id, event_type,
                        actor_type, actor_user_id, provider, provider_authority,
                        provider_reference, request_id, payload, created_at
                 FROM appointment_payment_events
                 WHERE reservation_id IN (${placeholders}) ORDER BY id ASC`, ids
            );
            const grouped = new Map();
            events.forEach(event => {
                const key = Number(event.reservation_id);
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(event);
            });
            checkoutSessions.forEach(session => { session.events = grouped.get(Number(session.id)) || []; });
        }
        res.json({ success: true, payments: rows, checkout_sessions: checkoutSessions, total_income: sum(paid), paid_total: sum(paid), pending_total: sum(pending) });
    } catch (error) {
        console.error('Admin robust get payments error:', error);
        res.status(500).json({ success: false, message: 'خطا در بارگذاری پرداخت‌ها' });
    }
});
router.put('/payments/:id', (req, res) => {
    return res.status(405).json({
        success: false,
        code: 'PAYMENT_IMMUTABLE',
        message: 'ویرایش مستقیم مبلغ یا وضعیت پرداخت ممنوع است؛ از فرایند تأیید، رد یا بازپرداخت استفاده کنید'
    });
});
router.delete('/payments/:id', (req, res) => {
    return res.status(405).json({
        success: false,
        code: 'PAYMENT_IMMUTABLE',
        message: 'حذف یا ابطال مستقیم سابقه مالی ممنوع است؛ درخواست بازپرداخت ثبت کنید'
    });
});



router.delete('/logs/clear', async (req, res) => {
    const connection = await pool();
    await ensureAdminTables(connection);
    await connection.query('DELETE FROM logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)');
    res.json({ success: true, message: 'لاگ‌های قدیمی پاک شدند' });
});





router.get('/backup/download/:filename', async (req, res) => {
    await ensureDir();
    const filename = safeFilename(req.params.filename);
    if (!filename) return res.status(400).json({ success: false, message: 'نام فایل نامعتبر است' });
    const filepath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ success: false, message: 'فایل پشتیبان یافت نشد' });
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.download(filepath, filename);
});

router.delete('/backup/:filename', async (req, res) => {
    const connection = await pool();
    await ensureAdminTables(connection);
    await ensureDir();
    const filename = safeFilename(req.params.filename);
    if (!filename) return res.status(400).json({ success: false, message: 'نام فایل نامعتبر است' });
    const filepath = path.join(BACKUP_DIR, filename);
    if (fs.existsSync(filepath)) await fsp.unlink(filepath);
    await connection.query('DELETE FROM backups WHERE filename = ?', [filename]);
    res.json({ success: true, message: 'پشتیبان حذف شد' });
});

router.post('/backup/restore/:filename', async (_req, res) => {
    // بازیابی از UI عمداً ممنوع است: عملیات باید در محیط جدا، پس از Verify
    // رمزنگاری و با ثبت مجوز دو نفره اجرا شود.
    res.status(405).json({
        success: false,
        code: 'BACKUP_RESTORE_UI_DISABLED',
        message: 'بازیابی دیتابیس از پنل ممنوع است؛ Runbook بازیابی نظارت‌شده را اجرا کنید'
    });
});


// ---------- Visitor analytics for system admin ----------
router.get('/visitor-analytics/summary', async (req, res) => {
    const connection = await pool();
    await connection.query(`CREATE TABLE IF NOT EXISTS visitor_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      visitor_id VARCHAR(64) NULL,
      ip_address VARCHAR(64) NULL,
      country VARCHAR(80) NULL,
      city VARCHAR(120) NULL,
      path VARCHAR(512) NULL,
      method VARCHAR(10) NULL,
      referrer TEXT NULL,
      device_type VARCHAR(50) NULL,
      os VARCHAR(80) NULL,
      browser VARCHAR(80) NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_visitor_created (created_at),
      INDEX idx_visitor_path (path),
      INDEX idx_visitor_country (country),
      INDEX idx_visitor_device (device_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`);
    const days = Math.max(1, Math.min(90, Number(req.query.days || 30)));
    const params = [days];
    const [[totals]] = await connection.query(`SELECT COUNT(*) AS total_views, COUNT(DISTINCT visitor_id) AS unique_visitors,
      SUM(created_at >= CURDATE()) AS today_views, COUNT(DISTINCT CASE WHEN created_at >= CURDATE() THEN visitor_id END) AS today_unique
      FROM visitor_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`, params);
    async function groupBy(field, limit = 10) {
      const allowed = new Set(['country','device_type','os','browser','path']);
      if (!allowed.has(field)) return [];
      const [rows] = await connection.query(`SELECT COALESCE(NULLIF(${field}, ''), 'نامشخص') AS label, COUNT(*) AS count,
        COUNT(DISTINCT visitor_id) AS unique_count FROM visitor_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY label ORDER BY count DESC LIMIT ${Number(limit) || 10}`, params);
      return rows;
    }
    const [hours] = await connection.query(`SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00') AS label, COUNT(*) AS count
      FROM visitor_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY label ORDER BY label DESC LIMIT 48`, params);
    const [recent] = await connection.query(`SELECT path, country, city, device_type, os, browser, ip_address, created_at
      FROM visitor_events ORDER BY created_at DESC LIMIT 30`);
    res.json({ success: true, data: { totals, by_country: await groupBy('country'), by_device: await groupBy('device_type'), by_os: await groupBy('os'), by_browser: await groupBy('browser'), top_pages: await groupBy('path'), hours, recent } });
});

module.exports = router;
