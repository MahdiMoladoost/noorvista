// src/controllers/adminController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const moment = require('moment-jalaali');

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
        query += ' AND role = ?';
        params.push(role);
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
            countQuery += ' AND role = ?';
            countParams.push(role);
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
            `SELECT u.id, u.full_name, u.phone, u.email, u.is_active, 
                    d.specialty, d.license_number, d.experience_years, d.consultation_fee, d.bio, d.is_available
             FROM users u
             JOIN doctors d ON u.id = d.user_id
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
            `SELECT u.id, u.full_name, u.phone, u.email, u.created_at,
                    (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) as appointment_count
             FROM users u
             JOIN patients p ON u.id = p.user_id
             WHERE u.role = 'patient'
             ORDER BY u.created_at DESC`
        );
        
        res.json({ patients: rows });
    } catch (error) {
        console.error('Get patients error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== دریافت لیست نوبت‌ها ====================
const getAppointments = async (req, res) => {
    const { limit = 50, page = 1, start_date, end_date, status, doctor_id } = req.query;
    let query = `
        SELECT a.*, 
               p.full_name as patient_name, p.phone as patient_phone,
               d.full_name as doctor_name, d.specialty as doctor_specialty
        FROM appointments a
        JOIN patients pat ON a.patient_id = pat.id
        JOIN users p ON pat.user_id = p.id
        JOIN doctors doc ON a.doctor_id = doc.id
        JOIN users d ON doc.user_id = d.id
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
                    p.full_name as patient_name, p.phone as patient_phone,
                    d.full_name as doctor_name
             FROM appointments a
             JOIN patients pat ON a.patient_id = pat.id
             JOIN users p ON pat.user_id = p.id
             JOIN doctors doc ON a.doctor_id = doc.id
             JOIN users d ON doc.user_id = d.id
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
    const { id } = req.params;
    const { patient_id, doctor_id, appointment_date, appointment_time, type, reason, status } = req.body;
    
    try {
        await db.query(
            `UPDATE appointments 
             SET patient_id = ?, doctor_id = ?, appointment_date = ?, appointment_time = ?, 
                 type = ?, reason = ?, status = ?
             WHERE id = ?`,
            [patient_id, doctor_id, appointment_date, appointment_time, type, reason, status, id]
        );
        
        res.json({ message: 'نوبت با موفقیت به‌روزرسانی شد' });
    } catch (error) {
        console.error('Update appointment error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== حذف نوبت ====================
const deleteAppointment = async (req, res) => {
    const { id } = req.params;
    
    try {
        await db.query('UPDATE appointments SET status = "cancelled" WHERE id = ?', [id]);
        res.json({ message: 'نوبت با موفقیت حذف شد' });
    } catch (error) {
        console.error('Delete appointment error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== ایجاد کاربر جدید ====================
const createUser = async (req, res) => {
    const { full_name, username, phone, email, role, password } = req.body;
    
    if (!full_name || !username || !phone || !password) {
        return res.status(400).json({ message: 'اطلاعات کاربر کامل نیست' });
    }
    
    try {
        const [existing] = await db.query('SELECT id FROM users WHERE username = ? OR phone = ?', [username, phone]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'نام کاربری یا شماره تلفن تکراری است' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await db.query(
            `INSERT INTO users (full_name, username, phone, email, role, password, is_active) 
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [full_name, username, phone, email, role, hashedPassword]
        );
        
        if (role === 'doctor') {
            await db.query(
                `INSERT INTO doctors (user_id, specialty, license_number, consultation_fee) 
                 VALUES (?, 'عمومی', '', 250000)`,
                [result.insertId]
            );
        } else if (role === 'patient') {
            await db.query(
                `INSERT INTO patients (user_id) VALUES (?)`,
                [result.insertId]
            );
        }
        
        res.json({ message: 'کاربر با موفقیت ثبت شد', id: result.insertId });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

// ==================== به‌روزرسانی کاربر ====================
const updateUser = async (req, res) => {
    const { id } = req.params;
    const { full_name, username, phone, email, role, password, is_active } = req.body;
    
    try {
        let query = 'UPDATE users SET full_name = ?, username = ?, phone = ?, email = ?, role = ?';
        const params = [full_name, username, phone, email, role];
        
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }
        
        if (is_active !== undefined) {
            query += ', is_active = ?';
            params.push(is_active);
        }
        
        query += ' WHERE id = ?';
        params.push(id);
        
        await db.query(query, params);
        
        res.json({ message: 'کاربر با موفقیت به‌روزرسانی شد' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ message: 'خطای سرور' });
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

// ==================== دریافت لیست پشتیبان‌ها ====================
const getBackups = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM backups ORDER BY created_at DESC');
        res.json({ backups: rows });
    } catch (error) {
        console.error('Get backups error:', error);
        res.json({ backups: [] });
    }
};

// ==================== ایجاد پشتیبان ====================
const createBackup = async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup_${timestamp}.sql`;
        
        await db.query(
            'INSERT INTO backups (filename, filepath, size, created_by) VALUES (?, ?, 0, ?)',
            [filename, `backups/${filename}`, req.user.id]
        );
        
        res.json({ message: 'پشتیبان با موفقیت ایجاد شد', filename });
    } catch (error) {
        console.error('Create backup error:', error);
        res.status(500).json({ message: 'خطای سرور' });
    }
};

module.exports = {
    getStats,
    getUsers,
    getDoctors,
    getPatients,
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
    createBackup
};