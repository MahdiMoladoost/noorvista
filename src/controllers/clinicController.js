// src/controllers/clinicController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const moment = require('moment-jalaali');

class ClinicController {
    // ============ آمار داشبورد ============
    async getDashboardStats(req, res) {
        try {
            const [todayApps] = await db.query(`
                SELECT COUNT(*) as count FROM appointments 
                WHERE appointment_date = CURDATE() AND status NOT IN ('cancelled', 'no_show')
            `);
            
            const [totalPatients] = await db.query(`
                SELECT COUNT(*) as count FROM users WHERE role = 'patient'
            `);
            
            const [activeDoctors] = await db.query(`
                SELECT COUNT(*) as count FROM users WHERE role = 'doctor' AND is_active = 1
            `);
            
            const [monthlyRevenue] = await db.query(`
                SELECT COALESCE(SUM(p.amount), 0) as total 
                FROM payments p
                WHERE p.status = 'completed' 
                AND MONTH(p.payment_date) = MONTH(CURDATE())
            `);
            
            res.json({
                success: true,
                today_appointments: todayApps[0]?.count || 0,
                total_patients: totalPatients[0]?.count || 0,
                total_doctors: activeDoctors[0]?.count || 0,
                monthly_revenue: monthlyRevenue[0]?.total || 0
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت آمار' });
        }
    }

    // ============ نوبت‌های امروز ============
    async getTodayAppointments(req, res) {
        try {
            const [appointments] = await db.query(`
                SELECT a.*, 
                       d.full_name as doctor_name,
                       p.full_name as patient_name,
                       d.specialty as doctor_specialty
                FROM appointments a
                JOIN users d ON a.doctor_id = d.id
                JOIN users p ON a.patient_id = p.id
                WHERE a.appointment_date = CURDATE()
                ORDER BY a.appointment_time
            `);
            res.json({ success: true, appointments });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌ها' });
        }
    }

    // ============ نوبت‌های در انتظار تأیید ============
    async getPendingAppointments(req, res) {
        try {
            const [appointments] = await db.query(`
                SELECT a.*, 
                       d.full_name as doctor_name,
                       p.full_name as patient_name,
                       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date
                FROM appointments a
                JOIN users d ON a.doctor_id = d.id
                JOIN users p ON a.patient_id = p.id
                WHERE a.status = 'pending'
                ORDER BY a.appointment_date ASC, a.appointment_time ASC
                LIMIT 10
            `);
            res.json({ success: true, appointments });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌ها' });
        }
    }

    // ============ درآمد هفتگی ============
    async getWeeklyRevenue(req, res) {
        try {
            const [revenue] = await db.query(`
                SELECT DAYOFWEEK(p.payment_date) as day, 
                       COALESCE(SUM(p.amount), 0) as total
                FROM payments p
                WHERE p.status = 'completed' 
                AND p.payment_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                GROUP BY DAYOFWEEK(p.payment_date)
            `);
            
            const dayMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 };
            const labels = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
            const values = [0, 0, 0, 0, 0, 0, 0];
            
            revenue.forEach(r => {
                const idx = dayMap[r.day];
                if (idx !== undefined) values[idx] = r.total;
            });
            
            res.json({ success: true, labels, values });
        } catch (error) {
            console.error(error);
            res.json({ success: true, labels: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'], values: [0, 0, 0, 0, 0, 0, 0] });
        }
    }

    // ============ لیست کامل نوبت‌ها ============
    async getAllAppointments(req, res) {
        try {
            const [appointments] = await db.query(`
                SELECT a.*, 
                       d.full_name as doctor_name,
                       p.full_name as patient_name
                FROM appointments a
                JOIN users d ON a.doctor_id = d.id
                JOIN users p ON a.patient_id = p.id
                ORDER BY a.appointment_date DESC, a.appointment_time
            `);
            
            const total = appointments.length;
            const pending = appointments.filter(a => a.status === 'pending').length;
            const confirmed = appointments.filter(a => a.status === 'confirmed').length;
            const today = appointments.filter(a => a.appointment_date === new Date().toISOString().slice(0,10)).length;
            
            res.json({
                success: true,
                appointments,
                total,
                pending,
                confirmed,
                today
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌ها' });
        }
    }

    // ============ دریافت یک نوبت ============
    async getAppointmentById(req, res) {
        try {
            const [appointments] = await db.query(`
                SELECT a.*, d.full_name as doctor_name, p.full_name as patient_name
                FROM appointments a
                JOIN users d ON a.doctor_id = d.id
                JOIN users p ON a.patient_id = p.id
                WHERE a.id = ?
            `, [req.params.id]);
            
            if (appointments.length === 0) {
                return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
            }
            
            res.json({ success: true, appointment: appointments[0] });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت جزئیات نوبت' });
        }
    }

    // ============ ثبت نوبت جدید ============
    async createAppointment(req, res) {
        try {
            const { patient_id, doctor_id, appointment_date, appointment_time, type, reason } = req.body;
            const [result] = await db.query(
                `INSERT INTO appointments (doctor_id, patient_id, appointment_date, appointment_time, type, reason, status) 
                 VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
                [doctor_id, patient_id, appointment_date, appointment_time, type || 'regular', reason || '']
            );
            res.json({ success: true, message: 'نوبت با موفقیت ثبت شد', appointment_id: result.insertId });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در ثبت نوبت' });
        }
    }

    // ============ ویرایش نوبت ============
    async updateAppointment(req, res) {
        try {
            const { status, type, reason } = req.body;
            await db.query(`UPDATE appointments SET status = ?, type = ?, reason = ? WHERE id = ?`, [status, type, reason, req.params.id]);
            res.json({ success: true, message: 'نوبت با موفقیت به‌روزرسانی شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی نوبت' });
        }
    }

    // ============ تغییر وضعیت نوبت ============
    async updateAppointmentStatus(req, res) {
        try {
            const { status } = req.body;
            await db.query(`UPDATE appointments SET status = ? WHERE id = ?`, [status, req.params.id]);
            res.json({ success: true, message: 'وضعیت نوبت تغییر کرد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت' });
        }
    }

    // ============ تأیید نوبت ============
    async confirmAppointment(req, res) {
        try {
            await db.query(`UPDATE appointments SET status = 'confirmed' WHERE id = ?`, [req.params.id]);
            res.json({ success: true, message: 'نوبت با موفقیت تأیید شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در تأیید نوبت' });
        }
    }

    // ============ لغو نوبت ============
    async cancelAppointment(req, res) {
        try {
            await db.query(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [req.params.id]);
            res.json({ success: true, message: 'نوبت با موفقیت لغو شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در لغو نوبت' });
        }
    }

    // ============ حذف نوبت ============
    async deleteAppointment(req, res) {
        try {
            await db.query(`DELETE FROM appointments WHERE id = ?`, [req.params.id]);
            res.json({ success: true, message: 'نوبت با موفقیت حذف شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در حذف نوبت' });
        }
    }

    // ============ لیست پزشکان ============
    async getAllDoctors(req, res) {
        try {
            const [doctors] = await db.query(`
                SELECT u.id, u.full_name, u.email, u.phone, u.is_active,
                       d.specialty, d.license_number, d.experience_years, d.consultation_fee, d.bio, d.is_available
                FROM users u
                JOIN doctors d ON u.id = d.user_id
                WHERE u.role = 'doctor'
                ORDER BY u.full_name
            `);
            
            const total = doctors.length;
            const active = doctors.filter(d => d.is_active === 1).length;
            const avgExp = total > 0 ? Math.round(doctors.reduce((sum, d) => sum + (d.experience_years || 0), 0) / total) : 0;
            const specialties = [...new Set(doctors.map(d => d.specialty).filter(s => s))];
            
            res.json({
                success: true,
                doctors,
                total,
                active,
                avg_experience: avgExp,
                total_specialties: specialties.length
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت لیست پزشکان' });
        }
    }

    // ============ دریافت یک پزشک ============
    async getDoctorById(req, res) {
        try {
            const [doctors] = await db.query(`
                SELECT u.id, u.full_name, u.email, u.phone, u.is_active,
                       d.specialty, d.license_number, d.experience_years, d.consultation_fee, d.bio, d.is_available
                FROM users u
                JOIN doctors d ON u.id = d.user_id
                WHERE u.id = ?
            `, [req.params.id]);
            
            if (doctors.length === 0) {
                return res.status(404).json({ success: false, message: 'پزشک یافت نشد' });
            }
            
            res.json({ success: true, doctor: doctors[0] });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات پزشک' });
        }
    }

    // ============ ایجاد پزشک جدید ============
    async createDoctor(req, res) {
        try {
            const { full_name, username, phone, email, password, specialty, license_number, experience_years, consultation_fee, bio } = req.body;
            
            const hashedPassword = await bcrypt.hash(password, 10);
            
            const [result] = await db.query(
                `INSERT INTO users (full_name, username, phone, email, role, password, is_active) 
                 VALUES (?, ?, ?, ?, 'doctor', ?, 1)`,
                [full_name, username, phone, email, hashedPassword]
            );
            
            await db.query(
                `INSERT INTO doctors (user_id, specialty, license_number, experience_years, consultation_fee, bio) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [result.insertId, specialty || 'عمومی', license_number || '', experience_years || 0, consultation_fee || 250000, bio || '']
            );
            
            res.json({ success: true, message: 'پزشک با موفقیت افزوده شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در افزودن پزشک' });
        }
    }

    // ============ به‌روزرسانی پزشک ============
    async updateDoctor(req, res) {
        try {
            const { full_name, phone, email, specialty, license_number, experience_years, consultation_fee, bio, is_available } = req.body;
            
            await db.query(
                'UPDATE users SET full_name = ?, phone = ?, email = ? WHERE id = ?',
                [full_name, phone, email, req.params.id]
            );
            
            await db.query(
                `UPDATE doctors SET specialty = ?, license_number = ?, experience_years = ?, 
                 consultation_fee = ?, bio = ?, is_available = ? WHERE user_id = ?`,
                [specialty, license_number, experience_years, consultation_fee, bio, is_available || 1, req.params.id]
            );
            
            res.json({ success: true, message: 'اطلاعات پزشک به‌روزرسانی شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی پزشک' });
        }
    }

    // ============ تغییر وضعیت پزشک ============
    async toggleDoctorStatus(req, res) {
        try {
            const { is_available } = req.body;
            await db.query('UPDATE doctors SET is_available = ? WHERE user_id = ?', [is_available, req.params.id]);
            await db.query('UPDATE users SET is_active = ? WHERE id = ?', [is_available, req.params.id]);
            res.json({ success: true, message: 'وضعیت پزشک تغییر کرد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت' });
        }
    }

    // ============ حذف پزشک ============
    async deleteDoctor(req, res) {
        try {
            await db.query('UPDATE users SET is_active = 0, role = "inactive" WHERE id = ?', [req.params.id]);
            res.json({ success: true, message: 'پزشک با موفقیت حذف شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در حذف پزشک' });
        }
    }

    // ============ لیست بیماران ============
    async getAllPatients(req, res) {
        try {
            const [patients] = await db.query(`
                SELECT u.id, u.full_name, u.email, u.phone, u.created_at,
                       (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) as appointment_count
                FROM users u
                JOIN patients p ON u.id = p.user_id
                WHERE u.role = 'patient'
                ORDER BY u.created_at DESC
            `);
            res.json({ success: true, patients });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت لیست بیماران' });
        }
    }

    // ============ دریافت یک بیمار ============
    async getPatientById(req, res) {
        try {
            const [patients] = await db.query(`
                SELECT u.id, u.full_name, u.email, u.phone, u.created_at,
                       p.national_code, p.birth_date, p.gender, p.address,
                       (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) as appointment_count
                FROM users u
                JOIN patients p ON u.id = p.user_id
                WHERE u.id = ?
            `, [req.params.id]);
            
            if (patients.length === 0) {
                return res.status(404).json({ success: false, message: 'بیمار یافت نشد' });
            }
            
            res.json({ success: true, patient: patients[0] });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات بیمار' });
        }
    }

    // ============ ثبت بیمار جدید ============
    async createPatient(req, res) {
        try {
            const { full_name, username, phone, email, password } = req.body;
            const hashedPassword = await bcrypt.hash(password, 10);
            
            const [result] = await db.query(
                `INSERT INTO users (username, password, full_name, email, phone, role, is_active) 
                 VALUES (?, ?, ?, ?, ?, 'patient', 1)`,
                [username, hashedPassword, full_name, email, phone]
            );
            
            await db.query(
                `INSERT INTO patients (user_id) VALUES (?)`,
                [result.insertId]
            );
            
            res.json({ success: true, message: 'بیمار با موفقیت ثبت شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در ثبت بیمار' });
        }
    }

    // ============ حذف بیمار ============
    async deletePatient(req, res) {
        try {
            await db.query(`UPDATE users SET is_active = 0, role = "inactive" WHERE id = ?`, [req.params.id]);
            res.json({ success: true, message: 'بیمار با موفقیت حذف شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در حذف بیمار' });
        }
    }

    // ============ لیست پرسنل ============
    async getAllStaff(req, res) {
        try {
            const [staff] = await db.query(`
                SELECT id, full_name, email, phone, role, is_active, created_at as hire_date
                FROM users
                WHERE role IN ('receptionist', 'clinic_admin')
                ORDER BY created_at DESC
            `);
            res.json({ success: true, staff });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت لیست پرسنل' });
        }
    }

    // ============ ثبت پرسنل جدید ============
    async createStaff(req, res) {
        try {
            const { full_name, role, phone, email, password } = req.body;
            const hashedPassword = await bcrypt.hash(password, 10);
            
            await db.query(
                `INSERT INTO users (username, password, full_name, email, phone, role, is_active) 
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [phone, hashedPassword, full_name, email, phone, role]
            );
            
            res.json({ success: true, message: 'پرسنل با موفقیت افزوده شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در افزودن پرسنل' });
        }
    }

    // ============ تغییر وضعیت پرسنل ============
    async toggleStaffStatus(req, res) {
        try {
            const { is_active } = req.body;
            await db.query(`UPDATE users SET is_active = ? WHERE id = ?`, [is_active, req.params.id]);
            res.json({ success: true, message: 'وضعیت پرسنل تغییر کرد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت' });
        }
    }

    // ============ حذف پرسنل ============
    async deleteStaff(req, res) {
        try {
            await db.query(`UPDATE users SET is_active = 0, role = "inactive" WHERE id = ?`, [req.params.id]);
            res.json({ success: true, message: 'پرسنل با موفقیت حذف شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در حذف پرسنل' });
        }
    }

    // ============ لیست پرداخت‌ها ============
    async getAllPayments(req, res) {
        try {
            const [payments] = await db.query(`
                SELECT p.*, u.full_name as patient_name
                FROM payments p
                JOIN appointments a ON p.appointment_id = a.id
                JOIN patients pat ON a.patient_id = pat.id
                JOIN users u ON pat.user_id = u.id
                ORDER BY p.payment_date DESC
            `);
            
            const [totalIncome] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'`);
            const [pendingTotal] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'pending'`);
            
            res.json({
                success: true,
                payments,
                total_income: totalIncome[0]?.total || 0,
                pending_total: pendingTotal[0]?.total || 0,
                paid_total: totalIncome[0]?.total || 0
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت پرداخت‌ها' });
        }
    }

    // ============ ثبت پرداخت جدید ============
    async createPayment(req, res) {
        try {
            const { appointment_id, amount, payment_method, description } = req.body;
            
            const [result] = await db.query(
                `INSERT INTO payments (appointment_id, amount, payment_method, status, receipt_number, description, created_by)
                 VALUES (?, ?, ?, 'completed', CONCAT('INV-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', LPAD(?, 4, '0')), ?, ?)`,
                [appointment_id, amount, payment_method, result?.insertId || 1, description || '', req.user.id]
            );
            
            await db.query('UPDATE appointments SET payment_status = "paid" WHERE id = ?', [appointment_id]);
            
            res.json({ success: true, message: 'پرداخت با موفقیت ثبت شد', payment_id: result.insertId });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در ثبت پرداخت' });
        }
    }

    // ============ گزارشات ============
    async getReports(req, res) {
        try {
            const { start, end, type } = req.query;
            
            if (type === 'financial') {
                const [dailyData] = await db.query(`
                    SELECT appointment_date as date, COUNT(*) as count, COALESCE(SUM(amount), 0) as revenue
                    FROM appointments
                    WHERE appointment_date BETWEEN ? AND ? AND status = 'confirmed'
                    GROUP BY appointment_date ORDER BY appointment_date
                `, [start, end]);
                
                const [totalStats] = await db.query(`
                    SELECT COUNT(*) as total_appointments, COALESCE(SUM(amount), 0) as total_revenue,
                           COALESCE(AVG(amount), 0) as average_payment
                    FROM appointments WHERE appointment_date BETWEEN ? AND ? AND status = 'confirmed'
                `, [start, end]);
                
                res.json({
                    success: true,
                    daily_data: dailyData,
                    total_appointments: totalStats[0]?.total_appointments || 0,
                    total_revenue: totalStats[0]?.total_revenue || 0,
                    average_payment: totalStats[0]?.average_payment || 0
                });
            } else {
                res.json({ success: true, data: [] });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت گزارش' });
        }
    }
}

module.exports = new ClinicController();