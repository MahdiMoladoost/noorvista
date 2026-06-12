// src/routes/adminExtra.js
// Stable admin add-ons: system-admin level backups, logs and helper endpoints.
const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const db = require('../config/db');
const { protect } = require('../middleware/auth');

const router = express.Router();
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

router.get('/users', async (req, res) => {
    const connection = await pool();
    const userCols = await columns(connection, 'users');
    const fullName = userNameExpr(userCols);
    const where = [];
    const params = [];
    if (req.query.search) {
        where.push(`(${fullName} LIKE ? OR u.username LIKE ? OR COALESCE(u.phone,'') LIKE ? OR COALESCE(u.email,'') LIKE ?)`);
        const s = `%${req.query.search}%`;
        params.push(s, s, s, s);
    }
    if (req.query.role && req.query.role !== 'all') { where.push('u.role = ?'); params.push(req.query.role); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const offset = (page - 1) * limit;
    const [rows] = await connection.query(
        `SELECT u.id, ${fullName} AS full_name, u.username, u.phone, u.email, u.role, u.is_active, u.created_at
         FROM users u ${whereSql}
         ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const [countRows] = await connection.query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
    const total = countRows[0]?.total || 0;
    res.json({ success: true, users: rows, total, page, totalPages: Math.ceil(total / limit) || 1 });
});

router.get('/users/:id', async (req, res) => {
    const connection = await pool();
    const userCols = await columns(connection, 'users');
    const fullName = userNameExpr(userCols);
    const [rows] = await connection.query(`SELECT u.*, ${fullName} AS full_name FROM users u WHERE u.id = ? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
    delete rows[0].password; delete rows[0].password_hash;
    res.json({ success: true, user: rows[0] });
});

router.post('/users', async (req, res) => {
    const connection = await pool();
    const { full_name, username, phone, email, role = 'patient', password } = req.body || {};
    if (!full_name || !username || !phone || !password) return res.status(400).json({ success: false, message: 'نام، نام کاربری، تلفن و رمز الزامی است' });
    const [dups] = await connection.query('SELECT id FROM users WHERE username = ? OR phone = ? OR (email IS NOT NULL AND email <> "" AND email = ?) LIMIT 1', [username, phone, email || '']);
    if (dups.length) return res.status(409).json({ success: false, message: 'نام کاربری، موبایل یا ایمیل قبلاً ثبت شده است' });
    const hash = await bcrypt.hash(password, 10);
    const now = new Date();
    const result = await insertDynamic(connection, 'users', {
        full_name, fullname: full_name, name: full_name, username, phone, email, role,
        password: hash, password_hash: hash, is_active: 1, created_at: now, updated_at: now
    });
    const userId = result.insertId;
    if (role === 'doctor') {
        await insertDynamic(connection, 'doctors', {
            user_id: userId, specialty: 'عمومی', specialization: 'عمومی', license_number: '', medical_license_number: '',
            consultation_fee: 0, experience_years: 0, is_available: 1
        });
    }
    if (role === 'patient') await insertDynamic(connection, 'patients', { user_id: userId, created_at: now, updated_at: now });
    res.json({ success: true, message: 'کاربر با موفقیت ثبت شد', id: userId });
});

router.put('/users/:id', async (req, res) => {
    const connection = await pool();
    const { full_name, username, phone, email, role, password, is_active } = req.body || {};
    const data = { full_name, fullname: full_name, name: full_name, username, phone, email, role, updated_at: new Date() };
    if (password && String(password).trim()) {
        const hash = await bcrypt.hash(password, 10);
        data.password = hash; data.password_hash = hash;
    }
    if (is_active !== undefined) data.is_active = boolValue(is_active);
    await updateDynamic(connection, 'users', data, 'WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'کاربر با موفقیت به‌روزرسانی شد' });
});

router.put('/users/:id/status', async (req, res) => {
    const connection = await pool();
    await updateDynamic(connection, 'users', { is_active: boolValue(req.body?.is_active), updated_at: new Date() }, 'WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'وضعیت کاربر تغییر کرد' });
});

router.delete('/users/:id', async (req, res) => {
    const connection = await pool();
    await updateDynamic(connection, 'users', { is_active: 0, updated_at: new Date() }, 'WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'کاربر غیرفعال شد' });
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
    await connection.query(`CREATE TABLE IF NOT EXISTS backups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        filepath VARCHAR(500) NULL,
        size VARCHAR(50) NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await connection.query(`CREATE TABLE IF NOT EXISTS logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        user_name VARCHAR(255) NULL,
        username VARCHAR(255) NULL,
        type VARCHAR(50) NULL,
        action VARCHAR(100) NULL,
        details TEXT NULL,
        ip_address VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
function safeFilename(filename) {
    const base = path.basename(String(filename || ''));
    if (!/^backup_[\w.-]+\.json$/i.test(base)) return null;
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

router.get('/doctors', async (req, res) => {
    try {
        const connection = await pool();
        const userCols = await columns(connection, 'users');
        const docCols = await columns(connection, 'doctors');
        const fullName = userDisplayExpr(userCols, 'u');
        const spec = doctorSpecialtyExpr(docCols, 'doc');
        const license = doctorLicenseExpr(docCols, 'doc');
        const exp = docCols.has('experience_years') ? 'doc.experience_years' : '0';
        const fee = docCols.has('consultation_fee') ? 'doc.consultation_fee' : '0';
        const bio = docCols.has('bio') ? 'doc.bio' : "''";
        const available = docCols.has('is_available') ? 'doc.is_available' : 'u.is_active';
        const [rows] = await connection.query(
            `SELECT doc.id, doc.id AS doctor_id, doc.user_id,
                    ${fullName} AS full_name, u.username, u.phone, u.email, u.is_active,
                    ${spec} AS specialty, ${spec} AS specialization,
                    ${license} AS license_number, ${license} AS medical_license_number,
                    ${exp} AS experience_years, ${fee} AS consultation_fee,
                    ${bio} AS bio, ${available} AS is_available
             FROM doctors doc
             JOIN users u ON u.id = doc.user_id
             ORDER BY ${fullName} ASC`
        );
        res.json({ success: true, doctors: rows, data: rows });
    } catch (error) {
        console.error('Admin robust get doctors error:', error);
        res.status(500).json({ success: false, message: 'خطا در بارگذاری پزشکان' });
    }
});

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

router.get('/patients', async (req, res) => {
    try {
        const connection = await pool();
        const userCols = await columns(connection, 'users');
        const patCols = await columns(connection, 'patients');
        const fullName = userDisplayExpr(userCols, 'u');
        const selectExtras = ['national_code','birth_date','gender','address','emergency_contact','emergency_contact_phone','insurance_company','insurance_code','allergies','chronic_diseases','medical_history','current_medications','notes']
            .filter(c => patCols.has(c)).map(c => `p.\`${c}\``).join(', ');
        const [rows] = await connection.query(
            `SELECT p.id, p.id AS patient_id, p.user_id, ${fullName} AS full_name, u.username, u.phone, u.email, u.is_active, u.created_at
                    ${selectExtras ? ', ' + selectExtras : ''},
                    (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) AS appointment_count
             FROM patients p JOIN users u ON u.id = p.user_id
             ORDER BY u.created_at DESC`
        );
        res.json({ success: true, patients: rows, data: rows });
    } catch (error) {
        console.error('Admin robust get patients error:', error);
        res.status(500).json({ success: false, message: 'خطا در بارگذاری بیماران' });
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

router.get('/appointments', async (req, res) => {
    try {
        const connection = await pool();
        const userCols = await columns(connection, 'users');
        const docCols = await columns(connection, 'doctors');
        const patientName = userDisplayExpr(userCols, 'pu');
        const doctorName = userDisplayExpr(userCols, 'du');
        const spec = doctorSpecialtyExpr(docCols, 'doc');
        const where = [];
        const params = [];
        if (req.query.start_date) { where.push('a.appointment_date >= ?'); params.push(req.query.start_date); }
        if (req.query.end_date) { where.push('a.appointment_date <= ?'); params.push(req.query.end_date); }
        if (req.query.status && req.query.status !== 'all') { where.push('a.status = ?'); params.push(req.query.status); }
        if (req.query.doctor_id && req.query.doctor_id !== 'all') { where.push('a.doctor_id = ?'); params.push(req.query.doctor_id); }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const offset = (page - 1) * limit;
        const [rows] = await connection.query(
            `SELECT a.*, ${patientName} AS patient_name, pu.phone AS patient_phone,
                    ${doctorName} AS doctor_name, ${spec} AS doctor_specialty
             FROM appointments a
             JOIN patients pat ON pat.id = a.patient_id
             JOIN users pu ON pu.id = pat.user_id
             JOIN doctors doc ON doc.id = a.doctor_id
             JOIN users du ON du.id = doc.user_id
             ${whereSql}
             ORDER BY a.appointment_date DESC, a.appointment_time DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const [countRows] = await connection.query(`SELECT COUNT(*) AS total FROM appointments a ${whereSql}`, params);
        const total = countRows[0]?.total || 0;
        res.json({ success: true, appointments: rows, total, page, totalPages: Math.ceil(total / limit) || 1 });
    } catch (error) {
        console.error('Admin robust get appointments error:', error);
        res.status(500).json({ success: false, message: 'خطا در بارگذاری نوبت‌ها' });
    }
});

router.get('/appointments/:id', async (req, res) => {
    try {
        const connection = await pool();
        const userCols = await columns(connection, 'users');
        const patientName = userDisplayExpr(userCols, 'pu');
        const doctorName = userDisplayExpr(userCols, 'du');
        const [rows] = await connection.query(
            `SELECT a.*, ${patientName} AS patient_name, pu.phone AS patient_phone, ${doctorName} AS doctor_name
             FROM appointments a
             JOIN patients pat ON pat.id = a.patient_id
             JOIN users pu ON pu.id = pat.user_id
             JOIN doctors doc ON doc.id = a.doctor_id
             JOIN users du ON du.id = doc.user_id
             WHERE a.id = ? LIMIT 1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
        res.json({ success: true, appointment: rows[0] });
    } catch (error) {
        console.error('Admin robust get appointment error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت نوبت' });
    }
});

router.post('/appointments', async (req, res) => {
    try {
        const connection = await pool();
        const data = {
            patient_id: req.body.patient_id,
            doctor_id: req.body.doctor_id,
            appointment_date: req.body.appointment_date,
            appointment_time: req.body.appointment_time,
            type: req.body.type || 'regular',
            reason: req.body.reason || '',
            notes: req.body.notes || '',
            status: req.body.status || 'pending',
            created_by: req.user?.id
        };
        const result = await insertDynamic(connection, 'appointments', data);
        res.json({ success: true, message: 'نوبت ثبت شد', id: result.insertId });
    } catch (error) {
        console.error('Admin robust create appointment error:', error);
        res.status(500).json({ success: false, message: 'خطا در ثبت نوبت' });
    }
});

router.put('/appointments/:id', async (req, res) => {
    try {
        const connection = await pool();
        await updateDynamic(connection, 'appointments', {
            patient_id: req.body.patient_id,
            doctor_id: req.body.doctor_id,
            appointment_date: req.body.appointment_date,
            appointment_time: req.body.appointment_time,
            type: req.body.type,
            reason: req.body.reason,
            notes: req.body.notes,
            status: req.body.status,
            updated_at: new Date()
        }, 'WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'نوبت ذخیره شد' });
    } catch (error) {
        console.error('Admin robust update appointment error:', error);
        res.status(500).json({ success: false, message: 'خطا در ذخیره نوبت' });
    }
});

router.delete('/appointments/:id', async (req, res) => {
    try {
        const connection = await pool();
        await updateDynamic(connection, 'appointments', { status: 'cancelled', updated_at: new Date() }, 'WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'نوبت لغو شد' });
    } catch (error) {
        console.error('Admin robust cancel appointment error:', error);
        res.status(500).json({ success: false, message: 'خطا در لغو نوبت' });
    }
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
        res.json({ success: true, payments: rows, total_income: sum(paid), paid_total: sum(paid), pending_total: sum(pending) });
    } catch (error) {
        console.error('Admin robust get payments error:', error);
        res.status(500).json({ success: false, message: 'خطا در بارگذاری پرداخت‌ها' });
    }
});
router.put('/payments/:id', async (req, res) => {
    try {
        const connection = await pool();
        await updateDynamic(connection, 'payments', {
            amount: req.body.amount, final_amount: req.body.amount,
            payment_method: req.body.payment_method,
            status: req.body.status === 'cancelled' ? 'refunded' : req.body.status,
            receipt_number: req.body.receipt_number,
            transaction_id: req.body.transaction_id,
            description: req.body.description,
            updated_at: new Date()
        }, 'WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'پرداخت ذخیره شد' });
    } catch (error) {
        console.error('Admin robust update payment error:', error);
        res.status(500).json({ success: false, message: 'خطا در ذخیره پرداخت' });
    }
});
router.delete('/payments/:id', async (req, res) => {
    try {
        const connection = await pool();
        await updateDynamic(connection, 'payments', { status: 'refunded', updated_at: new Date() }, 'WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'پرداخت ابطال شد' });
    } catch (error) {
        console.error('Admin robust delete payment error:', error);
        res.status(500).json({ success: false, message: 'خطا در ابطال پرداخت' });
    }
});

router.get('/logs', async (req, res) => {
    const connection = await pool();
    await ensureAdminTables(connection);
    const col = await columns(connection, 'logs');
    const typeExpr = col.has('type') ? 'l.type' : (col.has('action') ? 'l.action' : "'info'");
    const userExpr = col.has('user_name') ? 'l.user_name' : (col.has('username') ? 'l.username' : 'u.full_name');
    const userJoin = col.has('user_id') ? 'LEFT JOIN users u ON u.id = l.user_id' : '';
    const where = [];
    const params = [];
    if (req.query.type && req.query.type !== 'all') { where.push(`${typeExpr} = ?`); params.push(req.query.type); }
    if (req.query.start_date) { where.push('DATE(l.created_at) >= ?'); params.push(req.query.start_date); }
    if (req.query.end_date) { where.push('DATE(l.created_at) <= ?'); params.push(req.query.end_date); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const offset = (page - 1) * limit;
    const [rows] = await connection.query(
        `SELECT l.id, ${userExpr} AS user_name, ${typeExpr} AS type, l.action, l.details, l.ip_address, l.created_at
         FROM logs l ${userJoin} ${whereSql}
         ORDER BY l.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [countRows] = await connection.query(`SELECT COUNT(*) AS total FROM logs l ${whereSql}`, params);
    const total = countRows[0]?.total || 0;
    res.json({ success: true, logs: rows, total, page, totalPages: Math.ceil(total / limit) || 1 });
});

router.delete('/logs/clear', async (req, res) => {
    const connection = await pool();
    await ensureAdminTables(connection);
    await connection.query('DELETE FROM logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)');
    res.json({ success: true, message: 'لاگ‌های قدیمی پاک شدند' });
});

router.get('/backups', async (req, res) => {
    const connection = await pool();
    await ensureAdminTables(connection);
    await ensureDir();
    const [rows] = await connection.query('SELECT id, filename, filepath, size, created_at FROM backups ORDER BY created_at DESC LIMIT 100');
    const backups = rows.map(row => ({
        id: row.id,
        filename: row.filename,
        filepath: row.filepath,
        size: row.size || '-',
        date: row.created_at,
        created_at: row.created_at
    }));
    res.json({ success: true, backups });
});

router.post('/backup', async (req, res) => {
    const connection = await pool();
    await ensureAdminTables(connection);
    await ensureDir();
    const [tableRows] = await connection.query('SHOW TABLES');
    const tableKey = Object.keys(tableRows[0] || {})[0];
    const tables = tableRows.map(row => row[tableKey]).filter(Boolean);
    const backup = { created_at: new Date().toISOString(), database: process.env.DB_NAME || '', tables: {} };
    for (const table of tables) {
        if (table === 'backups') continue;
        try {
            const [rows] = await connection.query('SELECT * FROM `' + String(table).replace(/`/g, '') + '` LIMIT 5000');
            backup.tables[table] = rows;
        } catch (err) {
            backup.tables[table] = { error: err.message };
        }
    }
    const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    await fsp.writeFile(filepath, JSON.stringify(backup, null, 2), 'utf8');
    const stat = await fsp.stat(filepath);
    await connection.query('INSERT INTO backups (filename, filepath, size, created_by) VALUES (?, ?, ?, ?)', [filename, filepath, formatBytes(stat.size), req.user.id]);
    res.json({ success: true, message: 'پشتیبان با موفقیت ایجاد شد', filename, size: formatBytes(stat.size) });
});

router.get('/backup/download/:filename', async (req, res) => {
    await ensureDir();
    const filename = safeFilename(req.params.filename);
    if (!filename) return res.status(400).json({ success: false, message: 'نام فایل نامعتبر است' });
    const filepath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ success: false, message: 'فایل پشتیبان یافت نشد' });
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

router.post('/backup/restore/:filename', async (req, res) => {
    // Safety: restoring a full DB from UI is intentionally not automatic.
    res.status(400).json({
        success: false,
        message: 'برای جلوگیری از حذف ناخواسته اطلاعات، بازیابی کامل دیتابیس فعلاً دستی انجام می‌شود. فایل را دانلود و پس از بکاپ جدید، در محیط امن بازیابی کنید.'
    });
});

module.exports = router;
