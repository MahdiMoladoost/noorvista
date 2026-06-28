// src/controllers/adminController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const moment = require('moment-jalaali');
const appointmentStatusService = require('../services/appointmentStatusService');
const secureBackupService = require('../services/secureBackupService');
const databaseMaintenanceService = require('../services/databaseMaintenanceService');
const temporarySqlExportService = require('../services/temporarySqlExportService');
const fsp = require('node:fs/promises');

const MANAGED_USER_ROLE_ALIASES = Object.freeze({
    system_admin: 'system_admin', admin: 'system_admin', super_admin: 'system_admin',
    clinic_manager: 'clinic_manager', clinic_admin: 'clinic_manager', manager: 'clinic_manager',
    doctor: 'doctor',
    receptionist: 'receptionist', reception: 'receptionist', secretary: 'receptionist', staff: 'receptionist',
    patient: 'patient'
});
const MANAGED_USER_ROLES = new Set(['system_admin', 'clinic_manager', 'doctor', 'receptionist', 'patient']);

function normalizeManagedUserRole(value) {
    const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return MANAGED_USER_ROLE_ALIASES[key] || '';
}

function managedRoleFilterValues(value) {
    const role = normalizeManagedUserRole(value);
    if (role === 'system_admin') return ['system_admin', 'admin', 'super_admin'];
    if (role === 'clinic_manager') return ['clinic_manager', 'clinic_admin', 'manager'];
    if (role === 'receptionist') return ['receptionist', 'reception', 'secretary', 'staff'];
    return role ? [role] : [];
}

function validAdminPassword(value) {
    const password = String(value || '');
    return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

// ==================== آمار داشبورد ====================
const getStats = async (req, res) => {
    try {
        const [totalUsers] = await db.query('SELECT COUNT(*) as count FROM users');
        const [totalDoctors] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = "doctor"');
        const [totalPatients] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = "patient"');
        const [totalAppointments] = await db.query('SELECT COUNT(*) as count FROM appointments');
        const [todayAppointments] = await db.query('SELECT COUNT(*) as count FROM appointments WHERE appointment_date = CURDATE()');
        
        const [totalRevenue] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'
        `);
        
        const [pendingApps] = await db.query(`
            SELECT COUNT(*) as count FROM appointments WHERE status = 'pending'
        `);
        
        res.json({
            success: true,
            totalUsers: totalUsers[0].count,
            totalDoctors: totalDoctors[0].count,
            totalPatients: totalPatients[0].count,
            totalAppointments: totalAppointments[0].count,
            todayAppointments: todayAppointments[0].count,
            totalRevenue: totalRevenue[0].total,
            pendingAppointments: pendingApps[0].count
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== دریافت لیست کاربران ====================
const getUsers = async (req, res) => {
    const { search, role, page = 1, limit = 10 } = req.query;
    let query = 'SELECT id, full_name, username, phone, email, role, is_active, created_at FROM users WHERE 1=1';
    const params = [];
    
    if (search) {
        query += ' AND (full_name LIKE ? OR username LIKE ? OR phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (role && role !== 'all') {
        const roles = managedRoleFilterValues(role);
        if (roles.length) {
            query += ` AND role IN (${roles.map(() => '?').join(',')})`;
            params.push(...roles);
        }
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    try {
        const [rows] = await db.query(query, params);
        
        let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
        const countParams = [];
        if (search) {
            countQuery += ' AND (full_name LIKE ? OR username LIKE ? OR phone LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (role && role !== 'all') {
            const roles = managedRoleFilterValues(role);
            if (roles.length) {
                countQuery += ` AND role IN (${roles.map(() => '?').join(',')})`;
                countParams.push(...roles);
            }
        }
        const [total] = await db.query(countQuery, countParams);
        
        res.json({
            users: rows,
            total: total[0].total,
            page: parseInt(page),
            totalPages: Math.ceil(total[0].total / parseInt(limit))
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== دریافت لیست پزشکان ====================
const getDoctors = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT d.id, u.id AS user_id,
                    COALESCE(d.full_name, u.full_name) AS full_name,
                    COALESCE(d.phone, u.phone) AS phone,
                    COALESCE(d.email, u.email) AS email,
                    u.username,
                    u.is_active,
                    d.specialty, d.license_number, d.experience_years, d.consultation_fee, d.bio, d.is_available
             FROM doctors d
             JOIN users u ON u.id = d.user_id
             WHERE u.role = 'doctor'
             ORDER BY u.full_name ASC`
        );
        res.json({ doctors: rows });
    } catch (error) {
        console.error('Get doctors error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== دریافت لیست بیماران ====================
const getPatients = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT p.id, u.id AS user_id,
                    COALESCE(p.full_name, u.full_name) AS full_name,
                    COALESCE(p.phone, u.phone) AS phone,
                    COALESCE(p.email, u.email) AS email,
                    u.username, u.is_active,
                    p.national_code, p.birth_date, p.gender, p.address,
                    p.emergency_contact_name, p.emergency_contact_phone,
                    p.insurance_provider, p.insurance_number,
                    p.allergies, p.medications, p.chronic_diseases,
                    p.medical_history, p.notes,
                    COALESCE(p.created_at, u.created_at) AS created_at,
                    (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) AS appointment_count
             FROM patients p
             LEFT JOIN users u ON u.id = p.user_id
             WHERE COALESCE(p.is_active, u.is_active, 1) = 1
             ORDER BY u.created_at DESC`
        );
        
        res.json({ success: true, patients: rows });
    } catch (error) {
        console.error('Get patients error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};


const getPatientById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(
            `SELECT p.id, u.id AS user_id,
                    COALESCE(p.full_name, p.username, u.full_name, u.username) AS full_name,
                    COALESCE(p.phone, p.mobile, u.phone) AS phone,
                    COALESCE(p.email, u.email) AS email,
                    COALESCE(p.username, u.username) AS username,
                    COALESCE(p.is_active, u.is_active, 1) AS is_active,
                    p.national_code, p.birth_date, p.gender, p.address,
                    p.emergency_contact_name, p.emergency_contact_phone,
                    p.insurance_provider, p.insurance_number,
                    p.allergies, p.medications, p.chronic_diseases,
                    p.medical_history, p.notes,
                    COALESCE(p.created_at, u.created_at) AS created_at,
                    (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) AS appointment_count
             FROM patients p
             LEFT JOIN users u ON u.id = p.user_id
             WHERE p.id = ?
             LIMIT 1`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'بیمار یافت نشد' });
        res.json({ success: true, patient: rows[0] });
    } catch (error) {
        console.error('Get patient by id error:', error);
        res.status(500).json({ success: false, message: 'خطای سرور' });
    }
};

const createPatient = async (req, res) => {
    try {
        // مسیر امن و کامل ثبت بیمار در کنترلر کلینیک پیاده‌سازی شده؛ برای مدیر سیستم هم همان منطق استفاده می‌شود.
        const clinicController = require('./clinicController');
        return clinicController.createPatient(req, res);
    } catch (error) {
        console.error('Admin create patient error:', error);
        res.status(500).json({ success: false, message: 'خطای سرور' });
    }
};

const updatePatient = async (req, res) => {
    try {
        const clinicController = require('./clinicController');
        return clinicController.updatePatient(req, res);
    } catch (error) {
        console.error('Admin update patient error:', error);
        res.status(500).json({ success: false, message: 'خطای سرور' });
    }
};

async function deletePatientHard(req, res) {
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
        return res.status(400).json({ success: false, message: 'شناسه بیمار نامعتبر است' });
    }

    const connection = await db.beginTransaction();
    try {
        const [rows] = await connection.query('SELECT id, user_id FROM patients WHERE id = ? LIMIT 1 FOR UPDATE', [patientId]);
        if (!rows.length) {
            await db.rollback(connection);
            return res.status(404).json({ success: false, message: 'بیمار یافت نشد' });
        }

        const userId = rows[0].user_id ? Number(rows[0].user_id) : null;

        // برای حفظ سوابق مالی/نوبت‌ها، اتصال نوبت‌ها به بیمار حذف‌شده قطع می‌شود؛ سپس پرونده و کاربر حذف می‌شوند.
        await connection.query('UPDATE appointments SET patient_id = NULL WHERE patient_id = ?', [patientId]).catch(async (error) => {
            if (error && error.code !== 'ER_BAD_FIELD_ERROR') throw error;
        });

        await connection.query('DELETE FROM patients WHERE id = ?', [patientId]);
        if (userId) {
            await connection.query('DELETE FROM users WHERE id = ? AND role = ?', [userId, 'patient']);
        }

        await db.commit(connection);
        return res.json({ success: true, hard_deleted: true, message: 'بیمار و حساب کاربری او حذف شد' });
    } catch (error) {
        await db.rollback(connection).catch(() => {});
        console.error('Hard delete patient error:', error);
        return res.status(500).json({ success: false, message: 'حذف کامل بیمار انجام نشد' });
    }
}

const deletePatient = deletePatientHard;


// ==================== دریافت لیست نوبت‌ها ====================
const getAppointments = async (req, res) => {
    const { limit = 50, page = 1, start_date, end_date, status, doctor_id } = req.query;
    let query = `
        SELECT a.*, 
               COALESCE(pat.full_name, pat.username, p.full_name, p.username) AS patient_name, COALESCE(pat.phone, pat.mobile, p.phone) AS patient_phone,
               COALESCE(doc.full_name, d.full_name) AS doctor_name, doc.specialty AS doctor_specialty,
               mc.name AS medical_center_name, s.name AS service_name,
               pay.id AS payment_id, pay.status AS payment_record_status,
               pay.payment_method, pay.receipt_number AS payment_receipt_number,
               pay.payment_date, pay.provider AS payment_provider,
               pay.provider_reference AS payment_reference,
               pay.provider_authority AS payment_authority, pay.verified_at AS payment_verified_at,
               pay.idempotency_key AS payment_idempotency_key,
               CASE
                 WHEN a.payment_status = 'free' THEN 'free'
                 WHEN pay.status = 'completed' OR a.payment_status = 'paid' THEN 'paid'
                 WHEN pay.status = 'pending' OR a.payment_status = 'pending' THEN 'pending'
                 WHEN pay.status IN ('cancelled','failed') THEN pay.status
                 ELSE COALESCE(a.payment_status, 'unpaid')
               END AS resolved_payment_status
        FROM appointments a
        LEFT JOIN patients pat ON a.patient_id = pat.id
        LEFT JOIN users p ON pat.user_id = p.id
        LEFT JOIN doctors doc ON a.doctor_id = doc.id
        LEFT JOIN users d ON doc.user_id = d.id
        LEFT JOIN medical_centers mc ON mc.id = a.medical_center_id
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN payments pay ON pay.id = (
          SELECT p2.id FROM payments p2 WHERE p2.appointment_id = a.id ORDER BY p2.id DESC LIMIT 1
        )
        WHERE 1=1
    `;
    const params = [];
    
    if (start_date) {
        query += ' AND a.appointment_date >= ?';
        params.push(start_date);
    }
    if (end_date) {
        query += ' AND a.appointment_date <= ?';
        params.push(end_date);
    }
    if (status && status !== 'all') {
        query += ' AND a.status = ?';
        params.push(status);
    }
    if (doctor_id && doctor_id !== 'all') {
        query += ' AND a.doctor_id = ?';
        params.push(doctor_id);
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    try {
        const [rows] = await db.query(query, params);
        
        let countQuery = `
            SELECT COUNT(*) as total
            FROM appointments a
            WHERE 1=1
        `;
        const countParams = [];
        if (start_date) {
            countQuery += ' AND a.appointment_date >= ?';
            countParams.push(start_date);
        }
        if (end_date) {
            countQuery += ' AND a.appointment_date <= ?';
            countParams.push(end_date);
        }
        if (status && status !== 'all') {
            countQuery += ' AND a.status = ?';
            countParams.push(status);
        }
        if (doctor_id && doctor_id !== 'all') {
            countQuery += ' AND a.doctor_id = ?';
            countParams.push(doctor_id);
        }
        const [total] = await db.query(countQuery, countParams);
        
        res.json({
            appointments: rows,
            total: total[0].total,
            page: parseInt(page),
            totalPages: Math.ceil(total[0].total / parseInt(limit))
        });
    } catch (error) {
        console.error('Get appointments error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== دریافت یک نوبت ====================
const getAppointmentById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(
            `SELECT a.*, 
                    COALESCE(pat.full_name, pat.username, p.full_name, p.username) AS patient_name, COALESCE(pat.phone, pat.mobile, p.phone) AS patient_phone,
                    COALESCE(doc.full_name, d.full_name) AS doctor_name, doc.specialty AS doctor_specialty,
                    mc.name AS medical_center_name, s.name AS service_name,
                    pay.id AS payment_id, pay.status AS payment_record_status,
                    pay.payment_method, pay.receipt_number AS payment_receipt_number,
                    pay.payment_date, pay.provider AS payment_provider,
                    pay.provider_reference AS payment_reference,
               pay.provider_authority AS payment_authority, pay.verified_at AS payment_verified_at,
               pay.idempotency_key AS payment_idempotency_key,
                    CASE
                      WHEN a.payment_status = 'free' THEN 'free'
                 WHEN pay.status = 'completed' OR a.payment_status = 'paid' THEN 'paid'
                      WHEN pay.status = 'pending' OR a.payment_status = 'pending' THEN 'pending'
                      WHEN pay.status IN ('cancelled','failed') THEN pay.status
                      ELSE COALESCE(a.payment_status, 'unpaid')
                    END AS resolved_payment_status
             FROM appointments a
             LEFT JOIN patients pat ON a.patient_id = pat.id
             LEFT JOIN users p ON pat.user_id = p.id
             LEFT JOIN doctors doc ON a.doctor_id = doc.id
             LEFT JOIN users d ON doc.user_id = d.id
             LEFT JOIN medical_centers mc ON mc.id = a.medical_center_id
             LEFT JOIN services s ON s.id = a.service_id
             LEFT JOIN payments pay ON pay.id = (
               SELECT p2.id FROM payments p2 WHERE p2.appointment_id = a.id ORDER BY p2.id DESC LIMIT 1
             )
             WHERE a.id = ?`,
            [id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'نوبت یافت نشد' });
        }
        
        res.json({ appointment: rows[0] });
    } catch (error) {
        console.error('Get appointment by id error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== ایجاد نوبت جدید ====================
const createAppointment = async (req, res) => {
    const { patient_id, doctor_id, appointment_date, appointment_time, type, reason } = req.body;
    
    if (!patient_id || !doctor_id || !appointment_date || !appointment_time) {
        return res.status(400).json({ message: 'اطلاعات نوبت کامل نیست' });
    }
    
    try {
        const [result] = await db.query(
            `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, type, reason, status) 
             VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [patient_id, doctor_id, appointment_date, appointment_time, type || 'regular', reason || '']
        );
        
        res.json({ message: 'نوبت با موفقیت ثبت شد', id: result.insertId });
    } catch (error) {
        console.error('Create appointment error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== به‌روزرسانی نوبت ====================
const updateAppointment = async (req, res) => {
    const appointmentId = Number(req.params.id);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
        return res.status(400).json({ success: false, message: 'شناسه نوبت نامعتبر است' });
    }

    const allowedFields = new Map([
        ['patient_id', 'patient_id'], ['doctor_id', 'doctor_id'],
        ['appointment_date', 'appointment_date'], ['appointment_time', 'appointment_time'],
        ['type', 'type'], ['reason', 'reason']
    ]);
    const assignments = [];
    const params = [];
    for (const [bodyField, column] of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(req.body, bodyField)) {
            assignments.push(`${column} = ?`);
            params.push(req.body[bodyField] === '' ? null : req.body[bodyField]);
        }
    }

    try {
        const pool = await db.getPool();
        if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
            await appointmentStatusService.transition(pool, {
                appointmentId,
                targetStatus: req.body.status,
                reason: req.body.status_reason || null,
                actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip },
                extraUpdateSql: assignments.join(', '),
                extraParams: params
            });
        } else {
            if (!assignments.length) {
                return res.status(400).json({ success: false, message: 'هیچ فیلد قابل ویرایشی ارسال نشده است' });
            }
            const [result] = await pool.query(`UPDATE appointments SET ${assignments.join(', ')} WHERE id = ?`, [...params, appointmentId]);
            if (!result.affectedRows) return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
        }
        res.json({ success: true, message: 'نوبت با موفقیت به‌روزرسانی شد' });
    } catch (error) {
        console.error('Update appointment error:', error);
        return appointmentStatusService.sendTransitionError(res, error, 'خطا در به‌روزرسانی نوبت');
    }
};

// ==================== حذف نوبت ====================
const deleteAppointment = async (req, res) => {
    const appointmentId = Number(req.params.id);
    try {
        const pool = await db.getPool();
        const transitionResult = await appointmentStatusService.transition(pool, {
            appointmentId,
            targetStatus: 'cancelled',
            reason: req.body?.reason || 'لغو توسط مدیر سیستم',
            actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
        });
        res.json({
            success: true,
            sms: transitionResult.cancellation_sms || null,
            message: appointmentStatusService.withCancellationSmsMessage('نوبت لغو شد؛ سابقه آن حذف نشده است', transitionResult.cancellation_sms)
        });
    } catch (error) {
        if (error?.code === 'INVALID_APPOINTMENT_TRANSITION') {
            console.warn('Cancel appointment blocked:', error.message);
        } else {
            console.error('Cancel appointment error:', error);
        }
        return appointmentStatusService.sendTransitionError(res, error, 'خطا در لغو نوبت');
    }
};


function cleanOptionalText(value, max = 1000) {
    const text = String(value ?? '').trim();
    return text ? text.slice(0, max) : null;
}
function cleanOptionalInt(value, defaultValue = 0) {
    const num = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(num) ? Math.max(0, Math.round(num)) : defaultValue;
}
function cleanOptionalMoney(value, defaultValue = 0) {
    const num = Number(String(value ?? '').replace(/[^0-9]/g, ''));
    return Number.isFinite(num) ? Math.max(0, Math.round(num)) : defaultValue;
}

// ==================== ایجاد کاربر جدید ====================
const createUser = async (req, res) => {
    const { full_name, username, phone, email, password } = req.body || {};
    const role = normalizeManagedUserRole(req.body?.role);
    const cleanName = String(full_name || '').trim();
    const cleanUsername = String(username || '').trim();
    const cleanPhone = String(phone || '').trim();
    const cleanEmail = String(email || '').trim() || null;

    if (!cleanName || !cleanUsername || !cleanPhone || !role || !MANAGED_USER_ROLES.has(role) || !password) {
        return res.status(400).json({ success: false, message: 'اطلاعات کاربر کامل یا نقش انتخاب‌شده نامعتبر است' });
    }
    if (!validAdminPassword(password)) {
        return res.status(400).json({ success: false, message: 'رمز عبور باید حداقل ۸ نویسه و شامل حرف و عدد باشد' });
    }

    const pool = await db.getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [existing] = await connection.query(
            'SELECT id FROM users WHERE username = ? OR phone = ? OR (? IS NOT NULL AND email = ?) LIMIT 1 FOR UPDATE',
            [cleanUsername, cleanPhone, cleanEmail, cleanEmail]
        );
        if (existing.length > 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'نام کاربری، شماره تلفن یا رایانامه تکراری است' });
        }

        const hashedPassword = await bcrypt.hash(String(password), 12);
        const [result] = await connection.query(
            `INSERT INTO users (full_name, username, phone, email, role, password, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [cleanName, cleanUsername, cleanPhone, cleanEmail, role, hashedPassword]
        );

        if (role === 'doctor') {
            const specialty = cleanOptionalText(req.body.specialty, 200) || 'چشم‌پزشکی';
            const licenseNumber = cleanOptionalText(req.body.license_number || req.body.medical_license_number, 100) || '';
            await connection.query(
                `INSERT INTO doctors (user_id, full_name, phone, email, specialty, license_number, experience_years, consultation_fee, bio)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [result.insertId, cleanName, cleanPhone, cleanEmail, specialty, licenseNumber,
                 cleanOptionalInt(req.body.experience_years, 0), cleanOptionalMoney(req.body.consultation_fee, 250000), cleanOptionalText(req.body.bio, 2000)]
            );
        } else if (role === 'patient') {
            await connection.query(
                `INSERT INTO patients (user_id, username, full_name, phone, mobile, email, national_code, birth_date, gender, address)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [result.insertId, cleanUsername, cleanName, cleanPhone, cleanPhone, cleanEmail,
                 cleanOptionalText(req.body.national_code, 20), cleanOptionalText(req.body.birth_date, 20), cleanOptionalText(req.body.gender, 10), cleanOptionalText(req.body.address, 1000)]
            );
        }

        await connection.commit();
        return res.status(201).json({ success: true, message: 'کاربر با موفقیت ثبت شد', id: result.insertId });
    } catch (error) {
        await connection.rollback();
        console.error('Create user error:', error);
        return res.status(500).json({ success: false, message: 'خطا در ثبت کاربر' });
    } finally {
        connection.release();
    }
};

// ==================== به‌روزرسانی کاربر ====================
const updateUser = async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'شناسه کاربر نامعتبر است' });
    }

    const body = req.body || {};
    const cleanName = String(body.full_name || '').trim();
    const cleanUsername = String(body.username || '').trim();
    const cleanPhone = String(body.phone || '').trim();
    const cleanEmail = String(body.email || '').trim() || null;
    const requestedRole = String(body.role || '').trim();
    const password = String(body.password || '');

    if (!cleanName || !cleanUsername || !cleanPhone) {
        return res.status(400).json({ success: false, message: 'نام، نام کاربری و شماره تلفن الزامی است' });
    }
    if (password && !validAdminPassword(password)) {
        return res.status(400).json({ success: false, message: 'رمز عبور جدید باید حداقل ۸ نویسه و شامل حرف و عدد باشد' });
    }

    const pool = await db.getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [currentRows] = await connection.query(
            'SELECT id, role FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
            [id]
        );
        if (!currentRows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
        }

        const currentRole = normalizeManagedUserRole(currentRows[0].role) || currentRows[0].role;
        const finalRole = requestedRole ? normalizeManagedUserRole(requestedRole) : currentRole;
        if (!finalRole || !MANAGED_USER_ROLES.has(finalRole)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'نقش کاربری انتخاب‌شده نامعتبر است' });
        }

        const [duplicates] = await connection.query(
            `SELECT id FROM users
             WHERE id <> ? AND (username = ? OR phone = ? OR (? IS NOT NULL AND email = ?))
             LIMIT 1 FOR UPDATE`,
            [id, cleanUsername, cleanPhone, cleanEmail, cleanEmail]
        );
        if (duplicates.length) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'نام کاربری، شماره تلفن یا رایانامه متعلق به کاربر دیگری است' });
        }

        let query = 'UPDATE users SET full_name = ?, username = ?, phone = ?, email = ?, role = ?';
        const params = [cleanName, cleanUsername, cleanPhone, cleanEmail, finalRole];
        if (password) {
            query += ', password = ?';
            params.push(await bcrypt.hash(password, 12));
        }
        if (body.is_active !== undefined) {
            query += ', is_active = ?';
            params.push(body.is_active ? 1 : 0);
        }
        query += ', updated_at = NOW() WHERE id = ?';
        params.push(id);
        await connection.query(query, params);

        if (finalRole === 'doctor') {
            await connection.query(
                `INSERT INTO doctors (user_id, full_name, phone, email, specialty, license_number, consultation_fee)
                 SELECT ?, ?, ?, ?, 'چشم‌پزشکی', '', 250000
                 WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE user_id = ?)`,
                [id, cleanName, cleanPhone, cleanEmail, id]
            );
            if (body.specialty !== undefined || body.license_number !== undefined || body.experience_years !== undefined || body.consultation_fee !== undefined || body.bio !== undefined) {
                await connection.query(
                    `UPDATE doctors SET full_name = ?, phone = ?, email = ?, specialty = COALESCE(NULLIF(?, ''), specialty), license_number = COALESCE(NULLIF(?, ''), license_number), experience_years = COALESCE(?, experience_years), consultation_fee = COALESCE(?, consultation_fee), bio = COALESCE(?, bio), updated_at = NOW() WHERE user_id = ?`,
                    [cleanName, cleanPhone, cleanEmail, cleanOptionalText(body.specialty, 200) || '', cleanOptionalText(body.license_number || body.medical_license_number, 100) || '', body.experience_years !== undefined && body.experience_years !== '' ? cleanOptionalInt(body.experience_years, 0) : null, body.consultation_fee !== undefined && body.consultation_fee !== '' ? cleanOptionalMoney(body.consultation_fee, 0) : null, cleanOptionalText(body.bio, 2000), id]
                );
            }
        } else if (finalRole === 'patient') {
            await connection.query(
                `INSERT INTO patients (user_id, username, full_name, phone, mobile, email)
                 SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM patients WHERE user_id = ?)`,
                [id, cleanUsername, cleanName, cleanPhone, cleanPhone, cleanEmail, id]
            );
            if (body.national_code !== undefined || body.birth_date !== undefined || body.gender !== undefined || body.address !== undefined) {
                await connection.query(
                    `UPDATE patients SET username = ?, full_name = ?, phone = ?, mobile = ?, email = ?, national_code = COALESCE(?, national_code), birth_date = COALESCE(?, birth_date), gender = COALESCE(?, gender), address = COALESCE(?, address), updated_at = NOW() WHERE user_id = ?`,
                    [cleanUsername, cleanName, cleanPhone, cleanPhone, cleanEmail, cleanOptionalText(body.national_code, 20), cleanOptionalText(body.birth_date, 20), cleanOptionalText(body.gender, 10), cleanOptionalText(body.address, 1000), id]
                );
            }
        }

        await connection.commit();
        return res.json({ success: true, message: 'کاربر با موفقیت به‌روزرسانی شد' });
    } catch (error) {
        await connection.rollback();
        console.error('Update user error:', error);
        return res.status(500).json({ success: false, message: 'خطا در ویرایش کاربر' });
    } finally {
        connection.release();
    }
};

// ==================== تغییر وضعیت کاربر ====================
const toggleUserStatus = async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;
    
    try {
        await db.query('UPDATE users SET is_active = ? WHERE id = ?', [is_active, id]);
        res.json({ message: 'وضعیت کاربر با موفقیت تغییر کرد' });
    } catch (error) {
        console.error('Toggle user status error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== حذف کاربر ====================
const deleteUser = async (req, res) => {
    const { id } = req.params;
    
    try {
        await db.query('DELETE FROM doctors WHERE user_id = ?', [id]);
        await db.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'کاربر با موفقیت حذف شد' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== ساعات آزاد پزشک ====================
const getDoctorAvailableSlots = async (req, res) => {
    const { id } = req.params;
    const { date } = req.query;
    
    if (!date) {
        return res.json({ available_slots: [] });
    }
    
    try {
        const startHour = 9;
        const endHour = 17;
        const slotDuration = 30;
        
        const slots = [];
        for (let hour = startHour; hour < endHour; hour++) {
            for (let minute = 0; minute < 60; minute += slotDuration) {
                const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                slots.push(time);
            }
        }
        
        const [booked] = await db.query(
            `SELECT appointment_time FROM appointments 
             WHERE doctor_id = ? AND appointment_date = ? AND status != 'cancelled'`,
            [id, date]
        );
        
        const bookedTimes = new Set(booked.map(b => b.appointment_time));
        const availableSlots = slots.filter(slot => !bookedTimes.has(slot));
        
        res.json({ available_slots: availableSlots });
    } catch (error) {
        console.error('Get doctor available slots error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== دریافت لاگ‌های سیستم ====================
const getSystemLogs = async (req, res) => {
    const { limit = 100, type, page = 1 } = req.query;
    
    let query = 'SELECT * FROM logs WHERE 1=1';
    const params = [];
    
    if (type && type !== 'all') {
        query += ' AND action = ?';
        params.push(type);
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    try {
        const [rows] = await db.query(query, params);
        
        const [countResult] = await db.query(
            'SELECT COUNT(*) as total FROM logs' + (type && type !== 'all' ? ' WHERE action = ?' : ''),
            type && type !== 'all' ? [type] : []
        );
        
        res.json({
            logs: rows,
            total: countResult[0]?.total || 0,
            page: parseInt(page),
            totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
        });
    } catch (error) {
        console.error('Get system logs error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== دریافت تنظیمات سیستم ====================
const SECRET_SETTING_KEYS = new Set(['ai_api_key', 'sms_api_key']);

function maskSecret(value) {
    if (!value) return '';
    const str = String(value);
    if (str.length <= 4) return '****';
    return `${'*'.repeat(Math.max(8, str.length - 4))}${str.slice(-4)}`;
}

function isMaskedSecret(value) {
    return typeof value === 'string' && /^\*{4,}.{0,12}$/.test(value.trim());
}

function settingGroupForKey(key) {
    if (key.startsWith('ai_')) return 'ai';
    if (key.startsWith('sms_')) return 'sms';
    if (key.includes('fee') || key.includes('payment')) return 'financial';
    if (key.includes('reminder') || key.includes('notification')) return 'notifications';
    return 'system';
}

const getSystemSettings = async (req, res) => {
    try {
        const pool = await db.getPool();
        const [rows] = await pool.query('SELECT setting_key, setting_value, setting_group FROM settings');
        const settings = {};
        rows.forEach(row => {
            settings[row.setting_key] = SECRET_SETTING_KEYS.has(row.setting_key)
                ? maskSecret(row.setting_value)
                : (row.setting_value ?? '');
        });
        res.json(settings);
    } catch (error) {
        console.error('Get system settings error:', error);
        res.status(500).json({ success: false, message: 'خطای سرور' });
    }
};

// ==================== به‌روزرسانی تنظیمات سیستم ====================
const updateSystemSettings = async (req, res) => {
    const settings = req.body || {};

    try {
        const pool = await db.getPool();
        for (const [key, rawValue] of Object.entries(settings)) {
            if (SECRET_SETTING_KEYS.has(key) && isMaskedSecret(rawValue)) continue;
            const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
            await pool.query(
                `INSERT INTO settings (setting_key, setting_value, setting_group)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_group = VALUES(setting_group)`,
                [key, value, settingGroupForKey(key)]
            );
        }
        res.json({ success: true, message: 'تنظیمات با موفقیت ذخیره شد' });
    } catch (error) {
        console.error('Update system settings error:', error);
        res.status(500).json({ success: false, message: 'خطای سرور' });
    }
};

// ==================== دریافت لیست پشتیبان‌های رمزنگاری‌شده ====================
const getBackups = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, filename, size, created_by, created_at
             FROM backups
             WHERE filename LIKE '%.nvbak'
             ORDER BY created_at DESC`
        );
        res.set('Cache-Control', 'no-store');
        res.json({ backups: rows });
    } catch (error) {
        console.error('Get backups error:', error);
        res.status(503).json({
            success: false,
            code: 'BACKUP_CATALOG_UNAVAILABLE',
            message: 'فهرست پشتیبان‌های امن در دسترس نیست'
        });
    }
};

// ==================== ایجاد پشتیبان ====================
const createBackup = async (req, res) => {
    try {
        const backup = await secureBackupService.createEncryptedDatabaseBackup();
        await db.query(
            `INSERT INTO backups (filename, filepath, size, created_by, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [backup.filename, backup.filepath, backup.size, req.user?.id || null]
        );
        res.status(201).json({
            success: true,
            message: 'نسخه پشتیبان رمزنگاری‌شده با موفقیت ایجاد شد',
            backup: {
                filename: backup.filename,
                size: backup.size,
                sha256: backup.sha256
            }
        });
    } catch (error) {
        console.error('Create secure backup error:', error.code || error.message);
        const clientErrors = new Set([
            'BACKUP_KEY_MISSING', 'BACKUP_DB_CONFIG_MISSING',
            'MYSQLDUMP_NOT_FOUND', 'MYSQLDUMP_FAILED', 'BACKUP_TIMEOUT'
        ]);
        const status = clientErrors.has(error.code) ? 503 : 500;
        res.status(status).json({
            success: false,
            code: error.code || 'BACKUP_CREATION_FAILED',
            message: error.message || 'ایجاد نسخه پشتیبان ناموفق بود'
        });
    }
};


async function verifyCurrentAdminPassword(connection, userId, password) {
    const [rows] = await connection.query(
        'SELECT * FROM users WHERE id = ? LIMIT 1',
        [userId]
    );
    const hash = String(rows[0]?.password || rows[0]?.password_hash || '');
    const valid = Boolean(hash && /^\$2[aby]\$/.test(hash) && await bcrypt.compare(String(password || ''), hash));
    if (!valid) {
        const error = new Error('رمز عبور مدیر سیستم نادرست است');
        error.code = 'DATABASE_RESET_PASSWORD_INVALID';
        throw error;
    }
}

async function createAndCatalogBackup(connection, userId) {
    const backup = await secureBackupService.createEncryptedDatabaseBackup();
    await connection.query(
        `INSERT INTO backups (filename, filepath, size, created_by, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [backup.filename, backup.filepath, backup.size, userId || null]
    );
    return backup;
}

const getDatabaseMaintenanceStatus = async (_req, res) => {
    const pool = await db.getPool();
    const connection = await pool.getConnection();
    try {
        const status = await databaseMaintenanceService.getMaintenanceStatus(connection);
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, ...status });
    } catch (error) {
        console.error('Database maintenance status error:', error.code || error.message);
        res.status(503).json({
            success: false,
            code: error.code || 'DATABASE_MAINTENANCE_STATUS_FAILED',
            message: 'وضعیت نگهداری پایگاه داده قابل دریافت نیست'
        });
    } finally {
        connection.release();
    }
};

const exportDatabaseSql = async (req, res) => {
    let dump = null;
    const pool = await db.getPool();
    const connection = await pool.getConnection();
    try {
        await verifyCurrentAdminPassword(connection, req.user.id, req.body?.password);
        dump = await temporarySqlExportService.createTemporarySqlDump();
        res.set('Cache-Control', 'no-store');
        res.set('Pragma', 'no-cache');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Type', 'application/sql; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="${dump.filename}"`);
        return res.sendFile(dump.filepath, async (error) => {
            await fsp.rm(dump.filepath, { force: true }).catch(() => {});
            if (error && !res.headersSent) {
                res.status(500).json({ success: false, message: 'دانلود نسخه SQL ناموفق بود' });
            }
        });
    } catch (error) {
        if (dump?.filepath) await fsp.rm(dump.filepath, { force: true }).catch(() => {});
        console.error('Database SQL export error:', error.code || error.message);
        const status = error.code === 'DATABASE_RESET_PASSWORD_INVALID' ? 401 : 503;
        return res.status(status).json({
            success: false,
            code: error.code || 'SQL_EXPORT_FAILED',
            message: error.message || 'ایجاد نسخه SQL ناموفق بود'
        });
    } finally {
        connection.release();
    }
};

const resetDatabase = async (req, res) => {
    const mode = String(req.body?.mode || '');
    const acknowledgeBackup = req.body?.acknowledge_backup === true;
    if (!acknowledgeBackup) {
        return res.status(400).json({
            success: false,
            code: 'DATABASE_RESET_BACKUP_ACK_REQUIRED',
            message: 'تأیید تهیه پشتیبان ایمنی الزامی است'
        });
    }

    try {
        databaseMaintenanceService.assertConfirmation(mode, req.body?.confirmation_text);
    } catch (error) {
        return res.status(400).json({ success: false, code: error.code, message: error.message });
    }

    const pool = await db.getPool();
    const connection = await pool.getConnection();
    try {
        await verifyCurrentAdminPassword(connection, req.user.id, req.body?.password);
        const backup = await createAndCatalogBackup(connection, req.user.id);
        const result = await databaseMaintenanceService.resetDatabaseData({
            connection,
            currentUserId: Number(req.user.id),
            currentSessionId: Number(req.user.session_id || 0),
            mode,
            backupFilename: backup.filename,
            ipAddress: req.ip
        });
        res.set('Cache-Control', 'no-store');
        return res.json({
            success: true,
            message: mode === 'full'
                ? 'اطلاعات جدول‌ها پاک شد و دسترسی مدیر فعلی حفظ شد'
                : 'داده‌های عملیاتی پاک شد و حساب‌ها و تنظیمات پایه حفظ شدند',
            result: {
                ...result,
                backup: {
                    filename: backup.filename,
                    size: backup.size,
                    sha256: backup.sha256
                }
            }
        });
    } catch (error) {
        console.error('Database reset error:', error.code || error.message);
        const clientErrors = new Set([
            'DATABASE_RESET_DISABLED',
            'DATABASE_RESET_MODE_INVALID',
            'DATABASE_RESET_CONFIRMATION_INVALID',
            'DATABASE_RESET_PASSWORD_INVALID',
            'DATABASE_RESET_IN_PROGRESS',
            'DATABASE_RESET_LOCKED',
            'DATABASE_RESET_BACKUP_REQUIRED',
            'BACKUP_KEY_MISSING',
            'BACKUP_DB_CONFIG_MISSING',
            'MYSQLDUMP_NOT_FOUND',
            'MYSQLDUMP_FAILED',
            'BACKUP_TIMEOUT'
        ]);
        const status = error.code === 'DATABASE_RESET_PASSWORD_INVALID'
            ? 401
            : error.code === 'DATABASE_RESET_DISABLED'
                ? 403
                : ['DATABASE_RESET_IN_PROGRESS', 'DATABASE_RESET_LOCKED'].includes(error.code)
                    ? 409
                    : clientErrors.has(error.code)
                        ? 400
                        : 500;
        return res.status(status).json({
            success: false,
            code: error.code || 'DATABASE_RESET_FAILED',
            message: error.message || 'پاک‌سازی پایگاه داده ناموفق بود'
        });
    } finally {
        connection.release();
    }
};


module.exports = {
    getStats,
    getUsers,
    getDoctors,
    getPatients,
    getPatientById,
    createPatient,
    updatePatient,
    deletePatient,
    getAppointments,
    getAppointmentById,
    createAppointment,
    updateAppointment,
    deleteAppointment,
    createUser,
    updateUser,
    toggleUserStatus,
    deleteUser,
    getDoctorAvailableSlots,
    getSystemLogs,
    getSystemSettings,
    updateSystemSettings,
    getBackups,
    createBackup,
    getDatabaseMaintenanceStatus,
    exportDatabaseSql,
    resetDatabase
};