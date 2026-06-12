// src/controllers/patientController.js
const db = require('../config/db');

// آمار داشبورد
async function getDashboardStats(req, res) {
    try {
        const patientId = req.patientId;
        const [totalApps] = await db.query('SELECT COUNT(*) as count FROM appointments WHERE patient_id = ?', [patientId]);
        const [completedApps] = await db.query('SELECT COUNT(*) as count FROM appointments WHERE patient_id = ? AND status = "completed"', [patientId]);
        const [upcomingApps] = await db.query(`SELECT COUNT(*) as count FROM appointments WHERE patient_id = ? AND appointment_date >= CURDATE() AND status NOT IN ('cancelled','completed')`, [patientId]);
        const [records] = await db.query('SELECT COUNT(*) as count FROM medical_records WHERE patient_id = ?', [patientId]);
        res.json({ success: true, stats: { total_appointments: totalApps[0]?.count || 0, completed_appointments: completedApps[0]?.count || 0, upcoming_appointments: upcomingApps[0]?.count || 0, medical_records: records[0]?.count || 0 } });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در دریافت آمار' }); }
}

// نوبت‌های بیمار
async function getMyAppointments(req, res) {
    try {
        const patientId = req.patientId;
        const { status, page = 1, limit = 20 } = req.query;
        let query = `SELECT a.*, u.full_name as doctor_name, d.specialty FROM appointments a JOIN doctors d ON a.doctor_id = d.id JOIN users u ON d.user_id = u.id WHERE a.patient_id = ?`;
        const params = [patientId];
        if (status && status !== 'all') { query += ' AND a.status = ?'; params.push(status); }
        query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?'; params.push(parseInt(limit), offset);
        const [appointments] = await db.query(query, params);
        const [totalResult] = await db.query('SELECT COUNT(*) as total FROM appointments WHERE patient_id = ?', [patientId]);
        res.json({ success: true, appointments, pagination: { current_page: parseInt(page), per_page: parseInt(limit), total: totalResult[0]?.total || 0 } });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌ها' }); }
}

// دریافت لیست پزشکان موجود
async function getAvailableDoctors(req, res) {
    try {
        const [doctors] = await db.query(`SELECT d.id, u.full_name, d.specialty, d.experience_years, d.consultation_fee FROM doctors d JOIN users u ON d.user_id = u.id WHERE d.is_available = 1 AND u.is_active = 1 ORDER BY u.full_name`);
        res.json({ success: true, doctors });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در دریافت پزشکان' }); }
}

// ساعت کاری پزشک
async function getDoctorSchedule(req, res) {
    try {
        const { doctorId } = req.params;
        const [schedules] = await db.query(`SELECT * FROM schedules WHERE doctor_id = ? AND is_working = 1 ORDER BY day_of_week`, [doctorId]);
        res.json({ success: true, schedules });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در دریافت ساعت کاری' }); }
}

// ساعات خالی
async function getAvailableTimeSlots(req, res) {
    try {
        const { doctor_id, date } = req.query;
        if (!doctor_id || !date) return res.status(400).json({ success: false, message: 'پزشک و تاریخ الزامی است' });
        const dayOfWeek = new Date(date).getDay();
        const adjustedDay = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
        const [schedule] = await db.query(`SELECT start_time, end_time, slot_duration, break_between FROM schedules WHERE doctor_id = ? AND day_of_week = ? AND is_working = 1`, [doctor_id, adjustedDay]);
        if (!schedule.length) return res.json({ success: true, available_slots: [] });
        const start = schedule[0].start_time, end = schedule[0].end_time, slotDur = schedule[0].slot_duration || 30, breakBet = schedule[0].break_between || 5;
        const [booked] = await db.query(`SELECT appointment_time FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status NOT IN ('cancelled','no_show')`, [doctor_id, date]);
        const bookedTimes = new Set(booked.map(b => b.appointment_time.slice(0,5)));
        const slots = [];
        let current = timeToMinutes(start);
        const endMin = timeToMinutes(end);
        while (current + slotDur <= endMin) {
            const slotStart = minutesToTime(current);
            if (!bookedTimes.has(slotStart)) slots.push(slotStart);
            current += slotDur + breakBet;
        }
        res.json({ success: true, available_slots: slots });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در دریافت ساعات خالی' }); }
}

function timeToMinutes(t) { const p = t.split(':'); return parseInt(p[0])*60 + parseInt(p[1]); }
function minutesToTime(m) { return `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`; }

// رزرو نوبت جدید
async function bookAppointment(req, res) {
    try {
        const patientId = req.patientId;
        const { doctor_id, appointment_date, appointment_time, type, reason } = req.body;
        if (!doctor_id || !appointment_date || !appointment_time) return res.status(400).json({ success: false, message: 'اطلاعات نوبت کامل نیست' });
        const [existing] = await db.query(`SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status NOT IN ('cancelled','no_show')`, [doctor_id, appointment_date, appointment_time]);
        if (existing.length) return res.status(409).json({ success: false, message: 'این زمان قبلاً رزرو شده است' });
        const [doctor] = await db.query('SELECT consultation_fee FROM doctors WHERE id = ?', [doctor_id]);
        const amount = doctor[0]?.consultation_fee || 250000;
        const [result] = await db.query(`INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, type, reason, amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`, [patientId, doctor_id, appointment_date, appointment_time, type || 'regular', reason || '', amount]);
        res.json({ success: true, message: 'نوبت با موفقیت رزرو شد', appointment_id: result.insertId });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در رزرو نوبت' }); }
}

// لغو نوبت
async function cancelAppointment(req, res) {
    try {
        const { id } = req.params;
        const patientId = req.patientId;
        const [app] = await db.query('SELECT * FROM appointments WHERE id = ? AND patient_id = ?', [id, patientId]);
        if (!app.length) return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
        const hoursDiff = (new Date(`${app[0].appointment_date}T${app[0].appointment_time}`) - new Date()) / (1000*60*60);
        if (hoursDiff < 24) return res.status(400).json({ success: false, message: 'امکان لغو نوبت با کمتر از 24 ساعت مانده وجود ندارد' });
        await db.query('UPDATE appointments SET status = "cancelled" WHERE id = ?', [id]);
        res.json({ success: true, message: 'نوبت لغو شد' });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در لغو نوبت' }); }
}

// پرونده پزشکی بیمار
async function getMyMedicalRecords(req, res) {
    try {
        const patientId = req.patientId;
        const [records] = await db.query(`SELECT mr.*, u.full_name as doctor_name, DATE_FORMAT(mr.record_date, '%Y-%m-%d') as record_date FROM medical_records mr JOIN doctors d ON mr.doctor_id = d.id JOIN users u ON d.user_id = u.id WHERE mr.patient_id = ? ORDER BY mr.record_date DESC`, [patientId]);
        res.json({ success: true, records });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در دریافت پرونده پزشکی' }); }
}

// نسخه‌های بیمار
async function getMyPrescriptions(req, res) {
    try {
        const patientId = req.patientId;
        const [prescriptions] = await db.query(`SELECT p.*, u.full_name as doctor_name, DATE_FORMAT(p.created_at, '%Y-%m-%d') as created_at FROM prescriptions p JOIN doctors d ON p.doctor_id = d.id JOIN users u ON d.user_id = u.id WHERE p.patient_id = ? ORDER BY p.created_at DESC`, [patientId]);
        res.json({ success: true, prescriptions });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در دریافت نسخه‌ها' }); }
}

// پروفایل بیمار
async function getProfile(req, res) {
    try {
        const userId = req.user.id;
        const [patient] = await db.query(`SELECT u.id, u.full_name, u.email, u.phone, p.birth_date, p.gender, p.allergies, p.chronic_diseases, p.address FROM users u JOIN patients p ON u.id = p.user_id WHERE u.id = ?`, [userId]);
        if (!patient.length) return res.status(404).json({ success: false, message: 'بیمار یافت نشد' });
        res.json({ success: true, patient: patient[0] });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در دریافت پروفایل' }); }
}

async function updateProfile(req, res) {
    try {
        const userId = req.user.id;
        const { full_name, email, phone, birth_date, gender, allergies, chronic_diseases, address } = req.body;
        await db.query('UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?', [full_name, email, phone, userId]);
        await db.query(`UPDATE patients SET birth_date = ?, gender = ?, allergies = ?, chronic_diseases = ?, address = ? WHERE user_id = ?`, [birth_date || null, gender || null, allergies || null, chronic_diseases || null, address || null, userId]);
        res.json({ success: true, message: 'پروفایل به‌روزرسانی شد' });
    } catch (error) { res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی' }); }
}

module.exports = { getDashboardStats, getMyAppointments, getAvailableDoctors, getDoctorSchedule, getAvailableTimeSlots, bookAppointment, cancelAppointment, getMyMedicalRecords, getMyPrescriptions, getProfile, updateProfile };