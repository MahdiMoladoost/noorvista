// src/controllers/clinicController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const moment = require('moment-jalaali');
const appointmentStatusService = require('../services/appointmentStatusService');

const { normalizePatientPayload, patientValidationError } = require('../utils/patientProfile');


async function tableColumns(tableName) {
    const [rows] = await db.query(`SHOW COLUMNS FROM \`${tableName}\``);
    return new Set((rows || []).map(row => row.Field));
}

function normalizeOptionalString(value, max = 255) {
    const text = String(value ?? '').trim();
    return text ? text.slice(0, max) : null;
}

function normalizeBooleanFlag(value) {
    if (value === true || value === 1 || value === '1' || value === 'true' || value === 'active') return 1;
    if (value === false || value === 0 || value === '0' || value === 'false' || value === 'inactive') return 0;
    return null;
}

class ClinicController {
    // ============ آمار داشبورد ============
    async getDashboardStats(req, res) {
        try {
            const [todayApps] = await db.query(`
                SELECT COUNT(*) as count FROM appointments 
                WHERE appointment_date = CURDATE() AND status NOT IN ('cancelled', 'no_show')
            `);
            
            const [totalPatients] = await db.query(`
                SELECT COUNT(*) as count FROM patients WHERE COALESCE(is_active, 1) = 1
            `);
            
            const [activeDoctors] = await db.query(`
                SELECT COUNT(*) as count FROM doctors d LEFT JOIN users u ON u.id = d.user_id WHERE COALESCE(d.is_available, d.is_active, u.is_active, 1) = 1
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
                       COALESCE(d.full_name, du.full_name) AS doctor_name,
                       COALESCE(p.full_name, pu.full_name) AS patient_name,
                       d.specialty AS doctor_specialty
                FROM appointments a
                LEFT JOIN doctors d ON a.doctor_id = d.id
                LEFT JOIN users du ON d.user_id = du.id
                LEFT JOIN patients p ON a.patient_id = p.id
                LEFT JOIN users pu ON p.user_id = pu.id
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
                       COALESCE(d.full_name, du.full_name) AS doctor_name,
                       COALESCE(p.full_name, pu.full_name) AS patient_name,
                       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date
                FROM appointments a
                LEFT JOIN doctors d ON a.doctor_id = d.id
                LEFT JOIN users du ON d.user_id = du.id
                LEFT JOIN patients p ON a.patient_id = p.id
                LEFT JOIN users pu ON p.user_id = pu.id
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
                       COALESCE(d.full_name, du.full_name) AS doctor_name,
                       d.specialty AS doctor_specialty,
                       COALESCE(p.full_name, pu.full_name) AS patient_name,
                       COALESCE(p.phone, pu.phone) AS patient_phone,
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
                LEFT JOIN doctors d ON a.doctor_id = d.id
                LEFT JOIN users du ON d.user_id = du.id
                LEFT JOIN patients p ON a.patient_id = p.id
                LEFT JOIN users pu ON p.user_id = pu.id
                LEFT JOIN medical_centers mc ON mc.id = a.medical_center_id
                LEFT JOIN services s ON s.id = a.service_id
                LEFT JOIN payments pay ON pay.id = (
                  SELECT p2.id FROM payments p2 WHERE p2.appointment_id = a.id ORDER BY p2.id DESC LIMIT 1
                )
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
                SELECT a.*,
                       COALESCE(d.full_name, du.full_name) AS doctor_name,
                       d.specialty AS doctor_specialty,
                       COALESCE(p.full_name, pu.full_name) AS patient_name,
                       COALESCE(p.phone, pu.phone) AS patient_phone,
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
                LEFT JOIN doctors d ON a.doctor_id = d.id
                LEFT JOIN users du ON d.user_id = du.id
                LEFT JOIN patients p ON a.patient_id = p.id
                LEFT JOIN users pu ON p.user_id = pu.id
                LEFT JOIN medical_centers mc ON mc.id = a.medical_center_id
                LEFT JOIN services s ON s.id = a.service_id
                LEFT JOIN payments pay ON pay.id = (
                  SELECT p2.id FROM payments p2 WHERE p2.appointment_id = a.id ORDER BY p2.id DESC LIMIT 1
                )
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
            const pool = await db.getPool();
            const { status, type, reason, notes } = req.body;
            if (status) {
                await appointmentStatusService.transition(pool, {
                    appointmentId: req.params.id, targetStatus: status, reason, notes,
                    actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
                });
            }
            await pool.query('UPDATE appointments SET type = COALESCE(?, type), reason = COALESCE(?, reason) WHERE id = ?',
                [type || null, reason || null, req.params.id]);
            return res.json({ success: true, message: 'نوبت با موفقیت به‌روزرسانی شد' });
        } catch (error) {
            console.error(error.message);
            return appointmentStatusService.sendTransitionError(res, error, 'خطا در به‌روزرسانی نوبت');
        }
    }

    async updateAppointmentStatus(req, res) {
        try {
            const pool = await db.getPool();
            await appointmentStatusService.transition(pool, {
                appointmentId: req.params.id, targetStatus: req.body.status, reason: req.body.reason, notes: req.body.notes,
                actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
            });
            return res.json({ success: true, message: 'وضعیت نوبت تغییر کرد' });
        } catch (error) {
            return appointmentStatusService.sendTransitionError(res, error);
        }
    }

    // مسیر تأیید Canonical در appointmentQueueSms قرار دارد؛ این Handler نیز state machine را رعایت می‌کند.
    async confirmAppointment(req, res) {
        try {
            const pool = await db.getPool();
            await appointmentStatusService.transition(pool, {
                appointmentId: req.params.id, targetStatus: 'confirmed',
                actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
            });
            return res.json({ success: true, message: 'نوبت با موفقیت تأیید شد' });
        } catch (error) { return appointmentStatusService.sendTransitionError(res, error, 'خطا در تأیید نوبت'); }
    }

    async cancelAppointment(req, res) {
        try {
            const pool = await db.getPool();
            const transitionResult = await appointmentStatusService.transition(pool, {
                appointmentId: req.params.id, targetStatus: 'cancelled', reason: req.body?.reason,
                actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
            });
            return res.json({
                success: true,
                sms: transitionResult.cancellation_sms || null,
                message: appointmentStatusService.withCancellationSmsMessage('نوبت با موفقیت لغو شد', transitionResult.cancellation_sms)
            });
        } catch (error) { return appointmentStatusService.sendTransitionError(res, error, 'خطا در لغو نوبت'); }
    }

    // Hard-delete ممنوع است؛ برای حفظ تاریخچه، حذف به لغو تبدیل می‌شود.
    async deleteAppointment(req, res) {
        try {
            const pool = await db.getPool();
            const transitionResult = await appointmentStatusService.transition(pool, {
                appointmentId: req.params.id, targetStatus: 'cancelled', reason: 'درخواست حذف مدیریتی',
                actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
            });
            return res.json({
                success: true,
                sms: transitionResult.cancellation_sms || null,
                message: appointmentStatusService.withCancellationSmsMessage('نوبت لغو شد و تاریخچه آن حفظ شد', transitionResult.cancellation_sms)
            });
        } catch (error) { return appointmentStatusService.sendTransitionError(res, error, 'خطا در لغو نوبت'); }
    }

    // ============ لیست پزشکان ============
    async getAllDoctors(req, res) {
        try {
            const [doctors] = await db.query(`
                SELECT d.id, u.id AS user_id,
                       COALESCE(d.full_name, u.full_name) AS full_name,
                       COALESCE(d.email, u.email) AS email,
                       COALESCE(d.phone, u.phone) AS phone,
                       u.username,
                       u.is_active,
                       d.specialty, d.license_number, d.experience_years, d.consultation_fee, d.bio, d.is_available
                FROM doctors d
                LEFT JOIN users u ON u.id = d.user_id
                WHERE COALESCE(d.is_active, u.is_active, 1) = 1
                ORDER BY COALESCE(d.full_name, u.full_name)
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
                SELECT d.id, u.id AS user_id,
                       COALESCE(d.full_name, u.full_name) AS full_name,
                       COALESCE(d.email, u.email) AS email,
                       COALESCE(d.phone, u.phone) AS phone,
                       u.username,
                       u.is_active,
                       d.specialty, d.license_number, d.experience_years, d.consultation_fee, d.bio, d.is_available
                FROM doctors d
                LEFT JOIN users u ON u.id = d.user_id
                WHERE d.id = ?
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
            const body = req.body || {};
            const full_name = String(body.full_name || body.fullname || '').trim();
            const phone = String(body.phone || '').trim();
            const email = String(body.email || '').trim();
            const username = String(body.username || phone).trim();
            const password = String(body.password || phone).trim();
            const specialty = String(body.specialty || '').trim();
            const license_number = String(body.license_number || body.medical_license || '').trim();
            const experience_years = Number(body.experience_years || 0);
            const consultation_fee = Number(body.consultation_fee || 250000);
            const bio = String(body.bio || '').trim();

            if (!full_name || !phone || !specialty) {
                return res.status(400).json({ success: false, message: 'نام کامل، شماره تماس و تخصص پزشک الزامی است' });
            }
            if (!username || username.length < 3) {
                return res.status(400).json({ success: false, message: 'نام کاربری معتبر نیست' });
            }
            if (!password || password.length < 8) {
                return res.status(400).json({ success: false, message: 'رمز عبور اولیه باید حداقل ۸ نویسه باشد' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const [result] = await db.query(
                `INSERT INTO users (full_name, username, phone, email, role, password, is_active) 
                 VALUES (?, ?, ?, ?, 'doctor', ?, 1)`,
                [full_name, username, phone, email || null, hashedPassword]
            );

            await db.query(
                `INSERT INTO doctors
                    (user_id, full_name, phone, email, specialty, license_number, experience_years, consultation_fee, bio)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [result.insertId, full_name, phone || null, email || null, specialty || 'عمومی',
                 license_number || '', experience_years || 0, consultation_fee || 250000, bio || '']
            );

            return res.json({ success: true, message: 'پزشک با موفقیت افزوده شد', user_id: result.insertId, username });
        } catch (error) {
            if (error?.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ success: false, message: 'نام کاربری، موبایل یا ایمیل پزشک تکراری است' });
            }
            console.error(error);
            return res.status(500).json({ success: false, message: 'خطا در افزودن پزشک' });
        }
    }

    // ============ به‌روزرسانی پزشک ============
    async updateDoctor(req, res) {
        try {
            const { full_name, phone, email, specialty, license_number, experience_years, consultation_fee, bio, is_available } = req.body;
            const [rows] = await db.query('SELECT id, user_id FROM doctors WHERE id = ? LIMIT 1', [req.params.id]);
            if (!rows.length) return res.status(404).json({ success: false, message: 'پزشک یافت نشد' });
            const doctor = rows[0];

            await db.query(
                'UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), email = COALESCE(?, email) WHERE id = ?',
                [full_name || null, phone || null, email || null, doctor.user_id]
            );
            await db.query(
                `UPDATE doctors
                    SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), email = COALESCE(?, email),
                        specialty = COALESCE(?, specialty), license_number = COALESCE(?, license_number),
                        experience_years = COALESCE(?, experience_years), consultation_fee = COALESCE(?, consultation_fee),
                        bio = COALESCE(?, bio), is_available = COALESCE(?, is_available)
                  WHERE id = ?`,
                [full_name || null, phone || null, email || null, specialty || null, license_number || null,
                 experience_years ?? null, consultation_fee ?? null, bio || null,
                 is_available === undefined ? null : Number(Boolean(is_available)), doctor.id]
            );
            return res.json({ success: true, message: 'اطلاعات پزشک به‌روزرسانی شد' });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی پزشک' });
        }
    }

    // ============ تغییر وضعیت پزشک ============
    async toggleDoctorStatus(req, res) {
        try {
            const value = Number(Boolean(req.body.is_available ?? req.body.is_active));
            const [rows] = await db.query('SELECT id, user_id FROM doctors WHERE id = ? LIMIT 1', [req.params.id]);
            if (!rows.length) return res.status(404).json({ success: false, message: 'پزشک یافت نشد' });
            await db.query('UPDATE doctors SET is_available = ? WHERE id = ?', [value, rows[0].id]);
            await db.query('UPDATE users SET is_active = ? WHERE id = ?', [value, rows[0].user_id]);
            return res.json({ success: true, message: 'وضعیت پزشک تغییر کرد' });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت' });
        }
    }

    // ============ حذف پزشک ============
    async deleteDoctor(req, res) {
        try {
            const [rows] = await db.query('SELECT user_id FROM doctors WHERE id = ? LIMIT 1', [req.params.id]);
            if (!rows.length) return res.status(404).json({ success: false, message: 'پزشک یافت نشد' });
            await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [rows[0].user_id]);
            await db.query('UPDATE doctors SET is_available = 0 WHERE id = ?', [req.params.id]);
            return res.json({ success: true, message: 'پزشک غیرفعال شد' });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ success: false, message: 'خطا در حذف پزشک' });
        }
    }

    // ============ لیست بیماران ============
    async getAllPatients(req, res) {
        try {
            const [patients] = await db.query(`
                SELECT p.id, u.id AS user_id,
                       COALESCE(p.full_name, u.full_name) AS full_name,
                       COALESCE(p.email, u.email) AS email,
                       COALESCE(p.phone, u.phone) AS phone,
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
                ORDER BY COALESCE(p.created_at, u.created_at) DESC
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
                SELECT p.id, u.id AS user_id,
                       COALESCE(p.full_name, u.full_name) AS full_name,
                       COALESCE(p.email, u.email) AS email,
                       COALESCE(p.phone, u.phone) AS phone,
                       u.username, u.is_active,
                       COALESCE(p.created_at, u.created_at) AS created_at,
                       p.national_code, p.birth_date, p.gender, p.address,
                       p.emergency_contact_name, p.emergency_contact_phone,
                       p.insurance_provider, p.insurance_number,
                       p.allergies, p.medications, p.chronic_diseases,
                       p.medical_history, p.notes,
                       (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) AS appointment_count
                FROM patients p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE p.id = ?
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
        let connection;
        try {
            const body = req.body || {};
            const values = normalizePatientPayload(body);
            const { fullName, phone, email, nationalCode } = values;
            const username = String(body.username || phone).trim();
            const password = String(body.password || phone).trim();
            const validationError = patientValidationError(values);

            if (validationError) {
                return res.status(400).json({ success: false, message: validationError });
            }
            if (username.length < 3 || username.length > 100 || /[\s\u0000-\u001f]/.test(username)) {
                return res.status(400).json({ success: false, message: 'نام کاربری معتبر نیست' });
            }
            if (password.length < 8 || password.length > 128) {
                return res.status(400).json({ success: false, message: 'رمز موقت باید حداقل ۸ نویسه باشد' });
            }

            connection = await db.beginTransaction();
            const [duplicates] = await connection.query(
                `SELECT id FROM users WHERE username = ? OR phone = ? LIMIT 1 FOR UPDATE`,
                [username, phone]
            );
            if (duplicates.length) {
                await db.rollback(connection);
                connection = null;
                return res.status(409).json({ success: false, message: 'این شماره موبایل یا نام کاربری قبلاً ثبت شده است' });
            }
            if (nationalCode) {
                const [nationalCodeRows] = await connection.query(
                    'SELECT id FROM patients WHERE national_code = ? LIMIT 1 FOR UPDATE',
                    [nationalCode]
                );
                if (nationalCodeRows.length) {
                    await db.rollback(connection);
                    connection = null;
                    return res.status(409).json({ success: false, message: 'این کد ملی قبلاً ثبت شده است' });
                }
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            const [result] = await connection.query(
                `INSERT INTO users (username, password, full_name, email, phone, role, is_active)
                 VALUES (?, ?, ?, ?, ?, 'patient', 1)`,
                [username, hashedPassword, fullName, email || null, phone]
            );
            const [patientResult] = await connection.query(
                `INSERT INTO patients (
                    user_id, full_name, phone, email, national_code,
                    birth_date, gender, address,
                    emergency_contact_name, emergency_contact_phone,
                    insurance_provider, insurance_number,
                    allergies, medications, chronic_diseases, medical_history, notes
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    result.insertId,
                    fullName,
                    phone,
                    email || null,
                    nationalCode || null,
                    values.birthDate || null,
                    values.gender || null,
                    values.address || null,
                    values.emergencyContactName || null,
                    values.emergencyContactPhone || null,
                    values.insuranceProvider || null,
                    values.insuranceNumber || null,
                    values.allergies || null,
                    values.medications || null,
                    values.chronicDiseases || null,
                    values.medicalHistory || null,
                    values.notes || null
                ]
            );

            await db.commit(connection);
            connection = null;
            return res.status(201).json({
                success: true,
                message: 'بیمار با موفقیت ثبت شد',
                patient_id: patientResult.insertId,
                user_id: result.insertId,
                patient: {
                    id: patientResult.insertId,
                    user_id: result.insertId,
                    username,
                    full_name: fullName,
                    phone,
                    email,
                    national_code: nationalCode,
                    birth_date: values.birthDate,
                    gender: values.gender,
                    address: values.address,
                    emergency_contact_name: values.emergencyContactName,
                    emergency_contact_phone: values.emergencyContactPhone,
                    insurance_provider: values.insuranceProvider,
                    insurance_number: values.insuranceNumber,
                    allergies: values.allergies,
                    medications: values.medications,
                    chronic_diseases: values.chronicDiseases,
                    medical_history: values.medicalHistory,
                    notes: values.notes,
                    appointment_count: 0,
                    is_active: true,
                    created_at: new Date().toISOString()
                }
            });
        } catch (error) {
            if (connection) await db.rollback(connection).catch(() => {});
            if (error?.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ success: false, message: 'اطلاعات هویتی یا تماس بیمار تکراری است' });
            }
            console.error('Create clinic patient error:', error);
            return res.status(500).json({ success: false, message: 'خطا در ثبت بیمار' });
        }
    }


    // ============ ویرایش بیمار ============
    async updatePatient(req, res) {
        let connection;
        try {
            const patientId = Number(req.params.id);
            if (!Number.isInteger(patientId) || patientId <= 0) {
                return res.status(400).json({ success: false, message: 'شناسه بیمار معتبر نیست' });
            }
            const values = normalizePatientPayload(req.body || {});
            const validationError = patientValidationError(values);
            if (validationError) return res.status(400).json({ success: false, message: validationError });

            connection = await db.beginTransaction();
            const [rows] = await connection.query('SELECT id, user_id FROM patients WHERE id = ? LIMIT 1 FOR UPDATE', [patientId]);
            if (!rows.length) {
                await db.rollback(connection); connection = null;
                return res.status(404).json({ success: false, message: 'بیمار یافت نشد' });
            }
            const patient = rows[0];
            if (values.nationalCode) {
                const [dups] = await connection.query('SELECT id FROM patients WHERE national_code = ? AND id <> ? LIMIT 1', [values.nationalCode, patientId]);
                if (dups.length) {
                    await db.rollback(connection); connection = null;
                    return res.status(409).json({ success: false, message: 'این کد ملی قبلاً ثبت شده است' });
                }
            }
            await connection.query(
                `UPDATE users
                    SET full_name = ?, phone = ?, email = ?
                  WHERE id = ?`,
                [values.fullName, values.phone, values.email || null, patient.user_id]
            );
            await connection.query(
                `UPDATE patients SET
                    full_name = ?, phone = ?, email = ?, national_code = ?, birth_date = ?, gender = ?, address = ?,
                    emergency_contact_name = ?, emergency_contact_phone = ?, insurance_provider = ?, insurance_number = ?,
                    allergies = ?, medications = ?, chronic_diseases = ?, medical_history = ?, notes = ?
                  WHERE id = ?`,
                [values.fullName, values.phone, values.email || null, values.nationalCode || null,
                 values.birthDate || null, values.gender || null, values.address || null,
                 values.emergencyContactName || null, values.emergencyContactPhone || null,
                 values.insuranceProvider || null, values.insuranceNumber || null,
                 values.allergies || null, values.medications || null, values.chronicDiseases || null,
                 values.medicalHistory || null, values.notes || null, patientId]
            );
            await db.commit(connection); connection = null;
            return res.json({ success: true, message: 'اطلاعات بیمار به‌روزرسانی شد' });
        } catch (error) {
            if (connection) await db.rollback(connection).catch(() => {});
            if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'اطلاعات هویتی یا تماس بیمار تکراری است' });
            console.error('Update clinic patient error:', error);
            return res.status(500).json({ success: false, message: 'خطا در ویرایش بیمار' });
        }
    }

    // ============ حذف بیمار ============
    async deletePatient(req, res) {
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
            console.error('Delete clinic patient error:', error);
            return res.status(500).json({ success: false, message: 'خطا در حذف کامل بیمار' });
        }
    }

    // ============ لیست پرسنل ============
    async getAllStaff(req, res) {
        try {
            const [staff] = await db.query(`
                SELECT id, full_name, email, phone, role, is_active, created_at as hire_date
                FROM users
                WHERE role IN ('receptionist', 'clinic_admin', 'clinic_manager')
                ORDER BY created_at DESC
            `);
            res.json({ success: true, staff });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت لیست پرسنل' });
        }
    }


    // ============ دریافت یک پرسنل ============
    async getStaffById(req, res) {
        try {
            const [staff] = await db.query(
                `SELECT id, username, full_name, email, phone, role, is_active, created_at AS hire_date
                   FROM users
                  WHERE id = ? AND role IN ('receptionist', 'reception', 'secretary', 'staff', 'clinic_admin', 'clinic_manager', 'manager')
                  LIMIT 1`,
                [req.params.id]
            );
            if (!staff.length) return res.status(404).json({ success: false, message: 'کارمند یافت نشد' });
            return res.json({ success: true, staff: staff[0] });
        } catch (error) {
            console.error('Get clinic staff by id error:', error);
            return res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات کارمند' });
        }
    }

    // ============ ثبت پرسنل جدید ============
    async createStaff(req, res) {
        try {
            const fullName = normalizeOptionalString(req.body.full_name || req.body.fullname, 150);
            const username = normalizeOptionalString(req.body.username || req.body.phone, 100);
            const phone = normalizeOptionalString(req.body.phone, 30);
            const email = normalizeOptionalString(req.body.email, 150);
            const role = String(req.body.role || 'receptionist').trim();
            const password = String(req.body.password || '');
            const allowedRoles = new Set(['receptionist', 'reception', 'secretary', 'staff', 'clinic_admin', 'clinic_manager']);

            if (!fullName) return res.status(400).json({ success: false, message: 'نام کامل الزامی است' });
            if (!username || !phone) return res.status(400).json({ success: false, message: 'نام کاربری و شماره تماس الزامی است' });
            if (!allowedRoles.has(role)) return res.status(400).json({ success: false, message: 'نقش انتخاب‌شده معتبر نیست' });
            if (password.length < 8 || password.length > 128) return res.status(400).json({ success: false, message: 'رمز عبور باید حداقل ۸ نویسه باشد' });
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'ایمیل واردشده معتبر نیست' });

            const hashedPassword = await bcrypt.hash(password, 12);
            const [result] = await db.query(
                `INSERT INTO users (username, password, full_name, email, phone, role, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [username, hashedPassword, fullName, email, phone, role]
            );

            res.status(201).json({ success: true, message: 'پرسنل با موفقیت افزوده شد', id: result.insertId });
        } catch (error) {
            if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'نام کاربری، ایمیل یا شماره تماس قبلاً ثبت شده است' });
            console.error('Create clinic staff error:', error);
            res.status(500).json({ success: false, message: 'خطا در افزودن پرسنل' });
        }
    }

    // ============ ویرایش پرسنل ============
    async updateStaff(req, res) {
        try {
            const staffId = Number(req.params.id);
            if (!Number.isInteger(staffId) || staffId <= 0) return res.status(400).json({ success: false, message: 'شناسه کارمند معتبر نیست' });
            const fullName = normalizeOptionalString(req.body.full_name || req.body.fullname, 150);
            const username = normalizeOptionalString(req.body.username, 100);
            const phone = normalizeOptionalString(req.body.phone, 30);
            const email = normalizeOptionalString(req.body.email, 150);
            const role = String(req.body.role || '').trim();
            const allowedRoles = new Set(['receptionist', 'reception', 'secretary', 'staff', 'clinic_admin', 'clinic_manager']);

            if (!fullName) return res.status(400).json({ success: false, message: 'نام کامل الزامی است' });
            if (!username || !phone) return res.status(400).json({ success: false, message: 'نام کاربری و شماره تماس الزامی است' });
            if (role && !allowedRoles.has(role)) return res.status(400).json({ success: false, message: 'نقش انتخاب‌شده معتبر نیست' });
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'ایمیل واردشده معتبر نیست' });

            const [rows] = await db.query(
                `SELECT id FROM users
                  WHERE id = ? AND role IN ('receptionist','reception','secretary','staff','clinic_admin','clinic_manager','manager')
                  LIMIT 1`, [staffId]
            );
            if (!rows.length) return res.status(404).json({ success: false, message: 'کارمند یافت نشد' });

            await db.query(
                `UPDATE users SET username = ?, full_name = ?, email = ?, phone = ?, role = COALESCE(?, role) WHERE id = ?`,
                [username, fullName, email, phone, role || null, staffId]
            );
            return res.json({ success: true, message: 'اطلاعات کارمند به‌روزرسانی شد' });
        } catch (error) {
            if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'نام کاربری، ایمیل یا شماره تماس قبلاً ثبت شده است' });
            console.error('Update clinic staff error:', error);
            return res.status(500).json({ success: false, message: 'خطا در ویرایش پرسنل' });
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
            await db.query(`UPDATE users SET is_active = 0 WHERE id = ?`, [req.params.id]);
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
                SELECT p.*, u.full_name AS patient_name, u.phone AS patient_phone,
                       a.status AS appointment_status, a.payment_status AS appointment_payment_status,
                       a.appointment_date, a.appointment_time, a.tracking_code,
                       du.full_name AS doctor_name, d.specialty AS doctor_specialty,
                       mc.name AS medical_center_name, s.name AS service_name
                FROM payments p
                JOIN appointments a ON p.appointment_id = a.id
                LEFT JOIN patients pat ON a.patient_id = pat.id
                LEFT JOIN users u ON pat.user_id = u.id
                LEFT JOIN doctors d ON a.doctor_id = d.id
                LEFT JOIN users du ON d.user_id = du.id
                LEFT JOIN medical_centers mc ON mc.id = a.medical_center_id
                LEFT JOIN services s ON s.id = a.service_id
                ORDER BY p.payment_date DESC, p.id DESC
            `);
            
            const [totalIncome] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'`);
            const [pendingTotal] = await db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'pending'`);
            const [todayIncome] = await db.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'completed' AND DATE(payment_date) = CURDATE()`);
            const [paymentCounts] = await db.query(`SELECT
                SUM(status = 'completed') AS completed_count,
                SUM(status = 'pending') AS pending_count,
                SUM(status IN ('cancelled','failed')) AS unsuccessful_count
                FROM payments`);

            const [checkoutSessions] = await db.query(`
                SELECT r.id, r.patient_id, r.doctor_id, r.appointment_slot_id,
                       r.medical_center_id, r.service_id, r.appointment_date,
                       r.appointment_time, r.amount, r.currency, r.status,
                       r.provider, r.provider_authority, r.provider_reference,
                       r.payment_id, r.appointment_id, r.expires_at, r.paid_at,
                       r.cancelled_at, r.failed_at, r.last_error_code,
                       r.last_error_message, r.created_at, r.updated_at,
                       pu.full_name AS patient_name, pu.phone AS patient_phone,
                       du.full_name AS doctor_name, d.specialty AS doctor_specialty,
                       mc.name AS medical_center_name, s.name AS service_name,
                       (SELECT COUNT(*) FROM appointment_payment_events e WHERE e.reservation_id=r.id) AS event_count,
                       (SELECT e2.event_type FROM appointment_payment_events e2 WHERE e2.reservation_id=r.id ORDER BY e2.id DESC LIMIT 1) AS latest_event_type,
                       (SELECT e3.created_at FROM appointment_payment_events e3 WHERE e3.reservation_id=r.id ORDER BY e3.id DESC LIMIT 1) AS latest_event_at
                FROM appointment_payment_reservations r
                LEFT JOIN patients pat ON pat.id=r.patient_id
                LEFT JOIN users pu ON pu.id=pat.user_id
                LEFT JOIN doctors d ON d.id=r.doctor_id
                LEFT JOIN users du ON du.id=d.user_id
                LEFT JOIN medical_centers mc ON mc.id=r.medical_center_id
                LEFT JOIN services s ON s.id=r.service_id
                ORDER BY r.created_at DESC
                LIMIT 500`);

            if (checkoutSessions.length) {
                const ids = checkoutSessions.map(item => Number(item.id));
                const placeholders = ids.map(() => '?').join(',');
                const [events] = await db.query(
                    `SELECT id, reservation_id, payment_id, appointment_id, event_type,
                            actor_type, actor_user_id, provider, provider_authority,
                            provider_reference, request_id, payload, created_at
                     FROM appointment_payment_events
                     WHERE reservation_id IN (${placeholders})
                     ORDER BY id ASC`, ids
                );
                const grouped = new Map();
                events.forEach(event => {
                    const key = Number(event.reservation_id);
                    if (!grouped.has(key)) grouped.set(key, []);
                    grouped.get(key).push(event);
                });
                checkoutSessions.forEach(session => { session.events = grouped.get(Number(session.id)) || []; });
            }
            
            res.json({
                success: true,
                payments,
                total_income: totalIncome[0]?.total || 0,
                today_income: todayIncome[0]?.total || 0,
                pending_total: pendingTotal[0]?.total || 0,
                paid_total: totalIncome[0]?.total || 0,
                completed_count: Number(paymentCounts[0]?.completed_count || 0),
                pending_count: Number(paymentCounts[0]?.pending_count || 0),
                unsuccessful_count: Number(paymentCounts[0]?.unsuccessful_count || 0),
                checkout_sessions: checkoutSessions
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت پرداخت‌ها' });
        }
    }


    // ============ ویرایش پرداخت ============
    async updatePayment(req, res) {
        let connection;
        try {
            const paymentId = Number(req.params.id);
            if (!Number.isInteger(paymentId) || paymentId <= 0) return res.status(400).json({ success: false, message: 'شناسه پرداخت معتبر نیست' });
            const amount = Number(req.body.amount);
            const paymentMethod = normalizeOptionalString(req.body.payment_method, 40);
            const status = normalizeOptionalString(req.body.status, 40) || 'pending';
            const receiptNumber = normalizeOptionalString(req.body.receipt_number, 120);
            const description = normalizeOptionalString(req.body.description, 1000);
            const allowedStatuses = new Set(['pending', 'completed', 'cancelled', 'failed']);
            const allowedMethods = new Set(['cash', 'card', 'online', 'pos', 'bank_transfer', 'card_to_card']);

            if (!allowedStatuses.has(status)) return res.status(400).json({ success: false, message: 'وضعیت پرداخت معتبر نیست' });
            if (paymentMethod && !allowedMethods.has(paymentMethod)) return res.status(400).json({ success: false, message: 'روش پرداخت معتبر نیست' });
            if (req.body.amount !== undefined && (!Number.isFinite(amount) || amount < 0)) return res.status(400).json({ success: false, message: 'مبلغ پرداخت معتبر نیست' });

            connection = await db.beginTransaction();
            const [rows] = await connection.query('SELECT id, appointment_id, status FROM payments WHERE id = ? LIMIT 1 FOR UPDATE', [paymentId]);
            if (!rows.length) {
                await db.rollback(connection); connection = null;
                return res.status(404).json({ success: false, message: 'پرداخت یافت نشد' });
            }
            const columns = await tableColumns('payments');
            const sets = [];
            const params = [];
            const add = (column, value) => { if (columns.has(column)) { sets.push(`${column} = ?`); params.push(value); } };
            if (req.body.amount !== undefined) add('amount', amount);
            if (paymentMethod) add('payment_method', paymentMethod);
            add('status', status);
            add('receipt_number', receiptNumber);
            add('description', description);
            if (status === 'completed') {
                if (columns.has('verified_at')) sets.push('verified_at = COALESCE(verified_at, NOW())');
                if (columns.has('approved_at')) sets.push('approved_at = COALESCE(approved_at, NOW())');
                if (columns.has('approved_by')) { sets.push('approved_by = COALESCE(approved_by, ?)'); params.push(req.user.id); }
            }
            if (!sets.length) {
                await db.rollback(connection); connection = null;
                return res.status(409).json({ success: false, message: 'ستون قابل ویرایش برای پرداخت در دیتابیس یافت نشد' });
            }
            params.push(paymentId);
            await connection.query(`UPDATE payments SET ${sets.join(', ')} WHERE id = ?`, params);

            const appointmentStatus = status === 'completed' ? 'paid' : (status === 'pending' ? 'pending' : 'unpaid');
            await connection.query('UPDATE appointments SET payment_status = ? WHERE id = ?', [appointmentStatus, rows[0].appointment_id]);
            await db.commit(connection); connection = null;
            return res.json({ success: true, message: 'پرداخت به‌روزرسانی شد' });
        } catch (error) {
            if (connection) await db.rollback(connection).catch(() => {});
            console.error('Update clinic payment error:', error);
            return res.status(500).json({ success: false, message: 'خطا در ویرایش پرداخت' });
        }
    }

    // ============ ابطال پرداخت ============
    async cancelPayment(req, res) {
        let connection;
        try {
            const paymentId = Number(req.params.id);
            if (!Number.isInteger(paymentId) || paymentId <= 0) return res.status(400).json({ success: false, message: 'شناسه پرداخت معتبر نیست' });
            connection = await db.beginTransaction();
            const [rows] = await connection.query('SELECT id, appointment_id, status FROM payments WHERE id = ? LIMIT 1 FOR UPDATE', [paymentId]);
            if (!rows.length) {
                await db.rollback(connection); connection = null;
                return res.status(404).json({ success: false, message: 'پرداخت یافت نشد' });
            }
            if (rows[0].status === 'completed') {
                await db.rollback(connection); connection = null;
                return res.status(409).json({ success: false, message: 'پرداخت قطعی‌شده را فقط از مسیر بازپرداخت می‌توان رسیدگی کرد' });
            }
            await connection.query(`UPDATE payments SET status = 'cancelled' WHERE id = ?`, [paymentId]);
            await connection.query(`UPDATE appointments SET payment_status = 'unpaid' WHERE id = ? AND payment_status <> 'paid'`, [rows[0].appointment_id]);
            await db.commit(connection); connection = null;
            return res.json({ success: true, message: 'پرداخت ابطال شد' });
        } catch (error) {
            if (connection) await db.rollback(connection).catch(() => {});
            console.error('Cancel clinic payment error:', error);
            return res.status(500).json({ success: false, message: 'خطا در ابطال پرداخت' });
        }
    }

    // ============ ثبت درخواست پرداخت دستی ============
    // مبلغ فقط از نوبت خوانده می‌شود و ثبت اولیه هرگز به معنی تسویه قطعی نیست.
    async createPayment(req, res) {
        let connection;
        try {
            const appointmentId = Number(req.body.appointment_id);
            const paymentMethod = String(req.body.payment_method || '').trim().toLowerCase();
            const description = String(req.body.description || '').trim().slice(0, 1000);
            const allowedMethods = new Set(['cash', 'pos', 'bank_transfer', 'card_to_card']);

            if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
                return res.status(400).json({ success: false, message: 'شناسه نوبت معتبر نیست' });
            }
            if (!allowedMethods.has(paymentMethod)) {
                return res.status(400).json({ success: false, message: 'روش پرداخت معتبر نیست' });
            }

            connection = await db.beginTransaction();
            const [appointments] = await connection.query(
                `SELECT id, amount, status, payment_status
                   FROM appointments
                  WHERE id = ?
                  FOR UPDATE`,
                [appointmentId]
            );
            const appointment = appointments[0];
            if (!appointment) {
                await db.rollback(connection);
                connection = null;
                return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
            }
            if (['cancelled', 'no_show'].includes(String(appointment.status || '').toLowerCase())) {
                await db.rollback(connection);
                connection = null;
                return res.status(409).json({ success: false, message: 'برای نوبت لغوشده امکان ثبت پرداخت وجود ندارد' });
            }

            const amount = Number(appointment.amount || 0);
            if (!Number.isFinite(amount) || amount <= 0) {
                await db.rollback(connection);
                connection = null;
                return res.status(409).json({ success: false, message: 'تعرفه معتبر برای این نوبت ثبت نشده است' });
            }

            const [existing] = await connection.query(
                `SELECT id, status FROM payments
                  WHERE appointment_id = ?
                    AND status IN ('pending', 'completed')
                  ORDER BY id DESC LIMIT 1
                  FOR UPDATE`,
                [appointmentId]
            );
            if (existing.length) {
                await db.rollback(connection);
                connection = null;
                return res.status(409).json({
                    success: false,
                    message: existing[0].status === 'completed' ? 'این نوبت قبلاً تسویه شده است' : 'یک درخواست پرداخت در انتظار بررسی وجود دارد',
                    payment_id: existing[0].id
                });
            }

            const receiptNumber = `MR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${require('crypto').randomBytes(6).toString('hex').toUpperCase()}`;
            const [result] = await connection.query(
                `INSERT INTO payments
                    (appointment_id, amount, payment_method, status, receipt_number, description, created_by)
                 VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
                [appointmentId, amount, paymentMethod, receiptNumber, description, req.user.id]
            );
            await connection.query(
                `UPDATE appointments SET payment_status = 'pending'
                 WHERE id = ? AND payment_status <> 'paid'`,
                [appointmentId]
            );

            await db.commit(connection);
            connection = null;
            return res.status(201).json({
                success: true,
                message: 'درخواست پرداخت برای بررسی ثبت شد و هنوز تسویه‌شده محسوب نمی‌شود',
                payment_id: result.insertId,
                status: 'pending',
                amount,
                receipt_number: receiptNumber
            });
        } catch (error) {
            if (connection) await db.rollback(connection).catch(() => {});
            console.error('Create payment review request error:', error);
            return res.status(500).json({ success: false, message: 'خطا در ثبت درخواست پرداخت' });
        }
    }

    // ============ تأیید پرداخت دستی ============
    async approvePayment(req, res) {
        let connection;
        try {
            const paymentId = Number(req.params.id);
            if (!Number.isInteger(paymentId) || paymentId <= 0) {
                return res.status(400).json({ success: false, message: 'شناسه پرداخت معتبر نیست' });
            }

            connection = await db.beginTransaction();
            const [rows] = await connection.query(
                `SELECT id, appointment_id, amount, status
                   FROM payments
                  WHERE id = ?
                  FOR UPDATE`,
                [paymentId]
            );
            const payment = rows[0];
            if (!payment) {
                await db.rollback(connection);
                connection = null;
                return res.status(404).json({ success: false, message: 'پرداخت یافت نشد' });
            }
            if (payment.status === 'completed') {
                await db.rollback(connection);
                connection = null;
                return res.json({ success: true, message: 'پرداخت قبلاً تأیید شده است', idempotent: true });
            }
            if (payment.status !== 'pending') {
                await db.rollback(connection);
                connection = null;
                return res.status(409).json({ success: false, message: 'این پرداخت در وضعیت قابل تأیید نیست' });
            }

            await connection.query(
                `UPDATE payments
                    SET status = 'completed', approved_by = ?, approved_at = NOW()
                  WHERE id = ? AND status = 'pending'`,
                [req.user.id, paymentId]
            );
            await connection.query(
                `UPDATE appointments
                 SET payment_status = 'paid',
                     status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END
                 WHERE id = ?`,
                [payment.appointment_id]
            );
            await db.commit(connection);
            connection = null;
            return res.json({ success: true, message: 'پرداخت با تأیید مدیر قطعی شد' });
        } catch (error) {
            if (connection) await db.rollback(connection).catch(() => {});
            console.error('Approve payment error:', error);
            return res.status(500).json({ success: false, message: 'خطا در تأیید پرداخت' });
        }
    }

    // ============ رد پرداخت دستی ============
    async rejectPayment(req, res) {
        let connection;
        try {
            const paymentId = Number(req.params.id);
            const reason = String(req.body.reason || '').trim().slice(0, 1000);
            if (!reason) return res.status(400).json({ success: false, message: 'دلیل رد پرداخت الزامی است' });

            connection = await db.beginTransaction();
            const [rows] = await connection.query(
                'SELECT id, appointment_id, status FROM payments WHERE id = ? FOR UPDATE',
                [paymentId]
            );
            const payment = rows[0];
            if (!payment) {
                await db.rollback(connection);
                connection = null;
                return res.status(404).json({ success: false, message: 'پرداخت یافت نشد' });
            }
            if (payment.status !== 'pending') {
                await db.rollback(connection);
                connection = null;
                return res.status(409).json({ success: false, message: 'فقط پرداخت در انتظار بررسی قابل رد است' });
            }
            await connection.query(
                `UPDATE payments
                    SET status = 'failed', rejection_reason = ?, approved_by = ?, approved_at = NOW()
                  WHERE id = ? AND status = 'pending'`,
                [reason, req.user.id, paymentId]
            );
            await connection.query(
                `UPDATE appointments SET payment_status = 'unpaid'
                  WHERE id = ? AND payment_status <> 'paid'`,
                [payment.appointment_id]
            );
            await db.commit(connection);
            connection = null;
            return res.json({ success: true, message: 'درخواست پرداخت رد شد' });
        } catch (error) {
            if (connection) await db.rollback(connection).catch(() => {});
            console.error('Reject payment error:', error);
            return res.status(500).json({ success: false, message: 'خطا در رد پرداخت' });
        }
    }

    // ============ درخواست بازپرداخت کامل یا جزئی ============
    async requestRefund(req, res) {
        let connection;
        try {
            const paymentId = Number(req.params.id);
            const amount = Number(req.body.amount);
            const reason = String(req.body.reason || '').trim().slice(0, 1000);
            const idempotencyKey = String(req.get('Idempotency-Key') || req.body.idempotency_key || '').trim().slice(0, 191);
            if (!Number.isInteger(paymentId) || paymentId <= 0 || !Number.isFinite(amount) || amount <= 0 || reason.length < 3) {
                return res.status(400).json({ success: false, message: 'شناسه پرداخت، مبلغ مثبت و دلیل بازپرداخت الزامی است' });
            }
            if (!idempotencyKey) return res.status(400).json({ success: false, message: 'Idempotency-Key برای درخواست بازپرداخت الزامی است' });
            connection = await db.beginTransaction();
            const [payments] = await connection.query(
                `SELECT id, appointment_id, amount, status FROM payments WHERE id = ? FOR UPDATE`, [paymentId]
            );
            const payment = payments[0];
            if (!payment) { await db.rollback(connection); connection=null; return res.status(404).json({ success:false, message:'پرداخت یافت نشد' }); }
            if (payment.status !== 'completed') { await db.rollback(connection); connection=null; return res.status(409).json({ success:false, message:'فقط پرداخت قطعی قابل بازپرداخت است' }); }
            const [existingKey] = await connection.query('SELECT id, status FROM payment_refunds WHERE idempotency_key = ? LIMIT 1', [idempotencyKey]);
            if (existingKey.length) { await db.rollback(connection); connection=null; return res.json({ success:true, idempotent:true, refund_id:existingKey[0].id, status:existingKey[0].status }); }
            const [totals] = await connection.query(
                `SELECT COALESCE(SUM(amount),0) AS reserved FROM payment_refunds
                 WHERE payment_id = ? AND status IN ('requested','approved','processed') FOR UPDATE`, [paymentId]
            );
            const remaining = Number(payment.amount) - Number(totals[0]?.reserved || 0);
            if (amount > remaining) { await db.rollback(connection); connection=null; return res.status(409).json({ success:false, message:'مبلغ بازپرداخت از مانده قابل بازپرداخت بیشتر است', refundable_amount:remaining }); }
            const [result] = await connection.query(
                `INSERT INTO payment_refunds (payment_id, amount, reason, status, requested_by, idempotency_key)
                 VALUES (?, ?, ?, 'requested', ?, ?)`, [paymentId, amount, reason, req.user.id, idempotencyKey]
            );
            await db.commit(connection); connection=null;
            return res.status(201).json({ success:true, refund_id:result.insertId, status:'requested', refundable_amount:remaining-amount });
        } catch (error) {
            if (connection) await db.rollback(connection).catch(()=>{});
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success:false, message:'درخواست تکراری بازپرداخت' });
            console.error('Request refund error:', error.message);
            return res.status(500).json({ success:false, message:'خطا در ثبت درخواست بازپرداخت' });
        }
    }

    async approveRefund(req, res) {
        let connection;
        try {
            const refundId = Number(req.params.refundId);
            connection = await db.beginTransaction();
            const [rows] = await connection.query('SELECT id, status FROM payment_refunds WHERE id = ? FOR UPDATE', [refundId]);
            const refund = rows[0];
            if (!refund) { await db.rollback(connection); connection=null; return res.status(404).json({ success:false, message:'درخواست بازپرداخت یافت نشد' }); }
            if (refund.status === 'approved' || refund.status === 'processed') { await db.rollback(connection); connection=null; return res.json({ success:true, idempotent:true, status:refund.status }); }
            if (refund.status !== 'requested') { await db.rollback(connection); connection=null; return res.status(409).json({ success:false, message:'درخواست در وضعیت قابل تأیید نیست' }); }
            await connection.query("UPDATE payment_refunds SET status='approved', approved_by=?, updated_at=NOW() WHERE id=?", [req.user.id, refundId]);
            await db.commit(connection); connection=null;
            return res.json({ success:true, status:'approved', message:'بازپرداخت تأیید شد؛ اجرای مالی باید جداگانه ثبت شود' });
        } catch (error) { if(connection) await db.rollback(connection).catch(()=>{}); return res.status(500).json({success:false,message:'خطا در تأیید بازپرداخت'}); }
    }

    async rejectRefund(req, res) {
        const refundId = Number(req.params.refundId);
        const reason = String(req.body.reason || '').trim().slice(0,1000);
        if (!reason) return res.status(400).json({success:false,message:'دلیل رد الزامی است'});
        const [result] = await db.query(
            `UPDATE payment_refunds SET status='rejected', rejection_reason=?, approved_by=?, updated_at=NOW()
             WHERE id=? AND status='requested'`, [reason, req.user.id, refundId]
        );
        if (!result.affectedRows) return res.status(409).json({success:false,message:'درخواست قابل رد نیست'});
        return res.json({success:true,status:'rejected'});
    }

    async processRefund(req, res) {
        let connection;
        try {
            const refundId = Number(req.params.refundId);
            const providerReference = String(req.body.provider_reference || '').trim().slice(0,191);
            if (!providerReference) return res.status(400).json({success:false,message:'شماره پیگیری بازپرداخت الزامی است'});
            connection = await db.beginTransaction();
            const [rows] = await connection.query(
                `SELECT pr.id, pr.payment_id, pr.amount, pr.status, p.amount AS payment_amount, p.appointment_id
                 FROM payment_refunds pr JOIN payments p ON p.id=pr.payment_id WHERE pr.id=? FOR UPDATE`, [refundId]
            );
            const refund=rows[0];
            if(!refund){await db.rollback(connection);connection=null;return res.status(404).json({success:false,message:'بازپرداخت یافت نشد'});}
            if(refund.status==='processed'){await db.rollback(connection);connection=null;return res.json({success:true,idempotent:true,status:'processed'});}
            if(refund.status!=='approved'){await db.rollback(connection);connection=null;return res.status(409).json({success:false,message:'ابتدا بازپرداخت باید تأیید شود'});}
            await connection.query("UPDATE payment_refunds SET status='processed', provider_reference=?, processed_by=?, processed_at=NOW() WHERE id=?", [providerReference,req.user.id,refundId]);
            await connection.query("SELECT COALESCE(SUM(amount),0) AS total FROM payment_refunds WHERE payment_id=? AND status='processed'",[refund.payment_id]);
            await db.commit(connection);connection=null;
            return res.json({success:true,status:'processed',message:'اجرای بازپرداخت و شماره پیگیری ثبت شد'});
        }catch(error){if(connection)await db.rollback(connection).catch(()=>{});return res.status(500).json({success:false,message:'خطا در ثبت اجرای بازپرداخت'});}
    }

    async getRefunds(req,res){
        try{
            const paymentId=Number(req.params.id);
            const [rows]=await db.query(`SELECT id, amount, reason, status, rejection_reason, provider_reference,
              created_at, updated_at, processed_at FROM payment_refunds WHERE payment_id=? ORDER BY id DESC`,[paymentId]);
            return res.json({success:true,refunds:rows});
        }catch(error){return res.status(500).json({success:false,message:'خطا در دریافت بازپرداخت‌ها'});}
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