// src/controllers/doctorController.js
const db = require('../config/db');

// ============ آمار داشبورد ============
async function getDashboardStats(req, res) {
    try {
        const doctorId = req.doctorId;
        if (!doctorId) return res.status(400).json({ success: false, message: 'اطلاعات پزشک یافت نشد' });

        const [todayApps] = await db.query(
            `SELECT COUNT(*) as count FROM appointments 
             WHERE doctor_id = ? AND appointment_date = CURDATE() AND status != 'cancelled'`,
            [doctorId]
        );
        const [upcomingApps] = await db.query(
            `SELECT COUNT(*) as count FROM appointments 
             WHERE doctor_id = ? AND appointment_date > CURDATE() AND status NOT IN ('cancelled', 'completed')`,
            [doctorId]
        );
        const [totalPatients] = await db.query(
            `SELECT COUNT(DISTINCT patient_id) as count FROM appointments WHERE doctor_id = ?`,
            [doctorId]
        );
        const [completedVisits] = await db.query(
            `SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ? AND status = 'completed'`,
            [doctorId]
        );

        res.json({
            success: true,
            stats: {
                today_appointments: todayApps[0]?.count || 0,
                upcoming_appointments: upcomingApps[0]?.count || 0,
                total_patients: totalPatients[0]?.count || 0,
                completed_visits: completedVisits[0]?.count || 0
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در دریافت آمار' });
    }
}

// ============ نوبت‌های امروز ============
async function getTodayAppointments(req, res) {
    try {
        const doctorId = req.doctorId;
        const [appointments] = await db.query(
            `SELECT a.*, u.full_name as patient_name, u.phone as patient_phone
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             JOIN users u ON p.user_id = u.id
             WHERE a.doctor_id = ? AND a.appointment_date = CURDATE()
               AND a.status NOT IN ('cancelled', 'no_show')
             ORDER BY a.appointment_time`,
            [doctorId]
        );
        res.json({ success: true, appointments });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌های امروز' });
    }
}

// ============ تمام نوبت‌های پزشک ============
async function getMyAppointments(req, res) {
    try {
        const doctorId = req.doctorId;
        const { status, start_date, end_date, page = 1, limit = 20 } = req.query;
        let query = `
            SELECT a.*, u.full_name as patient_name, u.phone as patient_phone
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            WHERE a.doctor_id = ?
        `;
        const params = [doctorId];
        if (status && status !== 'all') {
            query += ' AND a.status = ?';
            params.push(status);
        }
        if (start_date) {
            query += ' AND a.appointment_date >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND a.appointment_date <= ?';
            params.push(end_date);
        }
        query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [appointments] = await db.query(query, params);
        const [totalResult] = await db.query(
            `SELECT COUNT(*) as total FROM appointments WHERE doctor_id = ?`,
            [doctorId]
        );
        res.json({
            success: true,
            appointments,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: totalResult[0]?.total || 0,
                total_pages: Math.ceil((totalResult[0]?.total || 0) / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌ها' });
    }
}

// ============ تغییر وضعیت نوبت ============
async function updateAppointmentStatus(req, res) {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const doctorId = req.doctorId;
        const [appointment] = await db.query(
            'SELECT * FROM appointments WHERE id = ? AND doctor_id = ?',
            [id, doctorId]
        );
        if (!appointment.length) {
            return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
        }
        await db.query('UPDATE appointments SET status = ?, notes = ? WHERE id = ?', [status, notes || null, id]);
        res.json({ success: true, message: 'وضعیت نوبت تغییر کرد' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت' });
    }
}

// ============ لیست بیماران پزشک ============
async function getMyPatients(req, res) {
    try {
        const doctorId = req.doctorId;
        const { search, page = 1, limit = 20 } = req.query;
        let query = `
            SELECT DISTINCT u.id, u.full_name, u.phone, u.email,
                   COUNT(a.id) as appointment_count, MAX(a.appointment_date) as last_visit
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            WHERE a.doctor_id = ?
            GROUP BY u.id
        `;
        const params = [doctorId];
        if (search) {
            query += ' HAVING u.full_name LIKE ? OR u.phone LIKE ?';
            params.push(`%${search}%`, `%${search}%`);
        }
        query += ' ORDER BY last_visit DESC';
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [patients] = await db.query(query, params);
        const [totalResult] = await db.query(
            `SELECT COUNT(DISTINCT p.id) as total
             FROM appointments a JOIN patients p ON a.patient_id = p.id
             WHERE a.doctor_id = ?`,
            [doctorId]
        );
        res.json({
            success: true,
            patients,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: totalResult[0]?.total || 0
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در دریافت بیماران' });
    }
}

// ============ پرونده پزشکی یک بیمار خاص ============
async function getPatientMedicalRecord(req, res) {
    try {
        const { patientId } = req.params;
        const doctorId = req.doctorId;
        const [patient] = await db.query(
            `SELECT u.id, u.full_name, u.phone, u.email, p.birth_date, p.gender, p.allergies, p.chronic_diseases
             FROM users u JOIN patients p ON u.id = p.user_id WHERE p.id = ?`,
            [patientId]
        );
        if (!patient.length) return res.status(404).json({ success: false, message: 'بیمار یافت نشد' });

        const [records] = await db.query(
            `SELECT mr.*, u.full_name as doctor_name, DATE_FORMAT(mr.record_date, '%Y-%m-%d') as record_date
             FROM medical_records mr
             JOIN doctors d ON mr.doctor_id = d.id
             JOIN users u ON d.user_id = u.id
             WHERE mr.patient_id = ?
             ORDER BY mr.record_date DESC`,
            [patientId]
        );
        res.json({ success: true, patient: patient[0], medical_records: records });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در دریافت پرونده پزشکی' });
    }
}

// ============ افزودن پرونده پزشکی ============
async function addMedicalRecord(req, res) {
    try {
        const { patient_id, appointment_id, diagnosis, symptoms, prescription, notes } = req.body;
        const doctorId = req.doctorId;
        if (!patient_id || !diagnosis) {
            return res.status(400).json({ success: false, message: 'بیمار و تشخیص الزامی است' });
        }
        await db.query(
            `INSERT INTO medical_records (patient_id, doctor_id, appointment_id, record_date,
             diagnosis, symptoms, prescription, notes)
             VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?)`,
            [patient_id, doctorId, appointment_id || null, diagnosis, symptoms || '', prescription || '', notes || '']
        );
        if (appointment_id) {
            await db.query('UPDATE appointments SET status = "completed" WHERE id = ?', [appointment_id]);
        }
        res.json({ success: true, message: 'پرونده پزشکی با موفقیت ثبت شد' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در ثبت پرونده' });
    }
}

// ============ لیست پرونده‌های پزشکی پزشک ============
async function getMedicalRecords(req, res) {
    try {
        const doctorId = req.doctorId;
        const { patient_id, page = 1, limit = 20 } = req.query;
        let query = `
            SELECT mr.*, u.full_name as patient_name,
                   DATE_FORMAT(mr.record_date, '%Y-%m-%d') as record_date
            FROM medical_records mr
            JOIN patients p ON mr.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            WHERE mr.doctor_id = ?
        `;
        const params = [doctorId];
        if (patient_id) {
            query += ' AND mr.patient_id = ?';
            params.push(patient_id);
        }
        query += ' ORDER BY mr.record_date DESC';
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [records] = await db.query(query, params);
        const [totalResult] = await db.query(
            `SELECT COUNT(*) as total FROM medical_records WHERE doctor_id = ?`,
            [doctorId]
        );
        res.json({
            success: true,
            records,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: totalResult[0]?.total || 0
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در دریافت پرونده‌ها' });
    }
}

// ============ ثبت نسخه جدید ============
async function addPrescription(req, res) {
    try {
        const { patient_id, appointment_id, diagnosis, medicines, instructions, valid_until } = req.body;
        const doctorId = req.doctorId;
        if (!patient_id || !medicines) {
            return res.status(400).json({ success: false, message: 'بیمار و لیست داروها الزامی است' });
        }
        await db.query(
            `INSERT INTO prescriptions (patient_id, doctor_id, appointment_id, diagnosis,
             medicines, instructions, valid_until)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [patient_id, doctorId, appointment_id || null, diagnosis || '', medicines, instructions || '', valid_until || null]
        );
        res.json({ success: true, message: 'نسخه با موفقیت ثبت شد' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در ثبت نسخه' });
    }
}

// ============ لیست نسخه‌های پزشک ============
async function getMyPrescriptions(req, res) {
    try {
        const doctorId = req.doctorId;
        const { patient_id, page = 1, limit = 20 } = req.query;
        let query = `
            SELECT p.*, u.full_name as patient_name,
                   DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i') as created_at
            FROM prescriptions p
            JOIN patients pt ON p.patient_id = pt.id
            JOIN users u ON pt.user_id = u.id
            WHERE p.doctor_id = ?
        `;
        const params = [doctorId];
        if (patient_id) {
            query += ' AND p.patient_id = ?';
            params.push(patient_id);
        }
        query += ' ORDER BY p.created_at DESC';
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [prescriptions] = await db.query(query, params);
        const [totalResult] = await db.query(
            `SELECT COUNT(*) as total FROM prescriptions WHERE doctor_id = ?`,
            [doctorId]
        );
        res.json({
            success: true,
            prescriptions,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: totalResult[0]?.total || 0
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در دریافت نسخه‌ها' });
    }
}

// ============ دریافت زمان‌بندی پزشک ============
async function getSchedule(req, res) {
    try {
        const doctorId = req.doctorId;
        const [schedules] = await db.query(
            `SELECT * FROM schedules WHERE doctor_id = ? ORDER BY day_of_week`,
            [doctorId]
        );
        res.json({ success: true, schedules });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در دریافت زمان‌بندی' });
    }
}

// ============ به‌روزرسانی زمان‌بندی پزشک ============
async function updateSchedule(req, res) {
    try {
        const doctorId = req.doctorId;
        const { schedules } = req.body;
        if (!schedules || !Array.isArray(schedules)) {
            return res.status(400).json({ success: false, message: 'اطلاعات زمان‌بندی نامعتبر است' });
        }
        await db.query('DELETE FROM schedules WHERE doctor_id = ?', [doctorId]);
        for (const s of schedules) {
            await db.query(
                `INSERT INTO schedules (doctor_id, day_of_week, start_time, end_time, is_working)
                 VALUES (?, ?, ?, ?, ?)`,
                [doctorId, s.day_of_week, s.start_time, s.end_time, s.is_working !== false]
            );
        }
        res.json({ success: true, message: 'زمان‌بندی با موفقیت ذخیره شد' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در ذخیره زمان‌بندی' });
    }
}

// ============ پروفایل پزشک ============
async function getProfile(req, res) {
    try {
        const userId = req.user.id;
        const [doctor] = await db.query(
            `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.is_active,
                    d.id as doctor_id, d.specialty, d.license_number, d.experience_years,
                    d.bio, d.consultation_fee, d.is_available
             FROM users u
             JOIN doctors d ON u.id = d.user_id
             WHERE u.id = ?`,
            [userId]
        );
        if (!doctor.length) return res.status(404).json({ success: false, message: 'پزشک یافت نشد' });
        res.json({ success: true, doctor: doctor[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در دریافت پروفایل' });
    }
}

async function updateProfile(req, res) {
    try {
        const userId = req.user.id;
        const { full_name, email, phone, specialty, license_number, experience_years, bio, consultation_fee } = req.body;
        await db.query('UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?', [full_name, email, phone, userId]);
        await db.query(
            `UPDATE doctors SET specialty = ?, license_number = ?, experience_years = ?,
             bio = ?, consultation_fee = ? WHERE user_id = ?`,
            [specialty, license_number, experience_years, bio, consultation_fee, userId]
        );
        res.json({ success: true, message: 'پروفایل به‌روزرسانی شد' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی پروفایل' });
    }
}

module.exports = {
    getDashboardStats,
    getTodayAppointments,
    getMyAppointments,
    updateAppointmentStatus,
    getMyPatients,
    getPatientMedicalRecord,
    addMedicalRecord,
    getMedicalRecords,
    addPrescription,
    getMyPrescriptions,
    getSchedule,
    updateSchedule,
    getProfile,
    updateProfile
};