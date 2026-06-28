const moment = require('moment-jalaali');
const appointmentStatusService = require('../services/appointmentStatusService');
const clinicTime = require('../utils/clinicTime');

// ایمپورت دیتابیس با بررسی
let db;
try {
    db = require('../config/db');
} catch (error) {
    console.warn('Database config not found, using mock db');
    db = {
        query: async (sql, params) => {
            console.log('Mock DB Query:', sql, params);
            return [[], []];
        }
    };
}

class ScheduleController {
    // دریافت زمان‌بندی هفتگی یک پزشک
    async getDoctorSchedule(req, res) {
        try {
            const { doctorId } = req.params;
            
            const [schedules] = await db.query(
                `SELECT * FROM doctor_schedules 
                 WHERE doctor_id = ? AND is_active = true 
                 ORDER BY day_of_week, start_time`,
                [doctorId]
            );
            
            res.json({ success: true, schedules });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت زمان‌بندی' });
        }
    }

    // ذخیره زمان‌بندی پزشک
    async saveDoctorSchedule(req, res) {
        try {
            const { doctorId, schedules } = req.body;
            
            if (!doctorId || !schedules) {
                return res.status(400).json({ success: false, message: 'اطلاعات ناقص است' });
            }
            
            // حذف زمان‌بندی‌های قبلی
            await db.query('DELETE FROM doctor_schedules WHERE doctor_id = ?', [doctorId]);
            
            // ذخیره زمان‌بندی‌های جدید
            for (const schedule of schedules) {
                await db.query(
                    `INSERT INTO doctor_schedules 
                     (doctor_id, day_of_week, start_time, end_time, slot_duration, break_between) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [doctorId, schedule.day_of_week, schedule.start_time, 
                     schedule.end_time, schedule.slot_duration || 30, schedule.break_between || 5]
                );
            }
            
            res.json({ success: true, message: 'زمان‌بندی با موفقیت ذخیره شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در ذخیره زمان‌بندی' });
        }
    }

    // دریافت نوبت‌های قابل رزرو برای یک روز مشخص
    async getAvailableSlots(req, res) {
        try {
            const { doctorId } = req.params;
            const { date } = req.query;
            
            if (!date) {
                return res.status(400).json({ success: false, message: 'تاریخ الزامی است' });
            }
            
            // دریافت روز هفته (0=شنبه تا 6=جمعه)
            const dayOfWeek = clinicTime.saturdayBasedWeekday(date);
            
            // دریافت زمان‌بندی پزشک برای این روز
            const [schedules] = await db.query(
                `SELECT * FROM doctor_schedules 
                 WHERE doctor_id = ? AND day_of_week = ? AND is_active = true`,
                [doctorId, dayOfWeek]
            );
            
            if (schedules.length === 0) {
                return res.json({ success: true, available_slots: [] });
            }
            
            // دریافت نوبت‌های رزرو شده در این روز
            const [bookedSlots] = await db.query(
                `SELECT start_time FROM appointments 
                 WHERE doctor_id = ? AND appointment_date = ? 
                 AND status NOT IN ('cancelled', 'no_show')`,
                [doctorId, date]
            );
            
            const bookedTimes = new Set(bookedSlots.map(s => s.start_time));
            
            // تولید نوبت‌های قابل رزرو
            const availableSlots = [];
            
            for (const schedule of schedules) {
                const slotDuration = schedule.slot_duration || 30;
                const breakBetween = schedule.break_between || 5;
                
                let current = this.timeToMinutes(schedule.start_time);
                const end = this.timeToMinutes(schedule.end_time);
                
                while (current + slotDuration <= end) {
                    const startTime = this.minutesToTime(current);
                    
                    if (!bookedTimes.has(startTime)) {
                        availableSlots.push({
                            start: startTime,
                            end: this.minutesToTime(current + slotDuration),
                            duration: slotDuration
                        });
                    }
                    
                    current += slotDuration + breakBetween;
                }
            }
            
            res.json({ success: true, available_slots: availableSlots });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌ها' });
        }
    }

    // رزرو نوبت جدید
    async bookAppointment(req, res) {
        try {
            const { doctorId, patientId, appointmentDate, startTime, endTime, type, reason } = req.body;
            const userId = req.user?.id || 1;
            
            // اعتبارسنجی
            if (!doctorId || !patientId || !appointmentDate || !startTime || !endTime) {
                return res.status(400).json({ success: false, message: 'اطلاعات ناقص است' });
            }
            
            // بررسی تداخل نوبت
            const [conflicts] = await db.query(
                `SELECT id FROM appointments 
                 WHERE doctor_id = ? AND appointment_date = ? AND start_time = ? 
                 AND status NOT IN ('cancelled', 'no_show')`,
                [doctorId, appointmentDate, startTime]
            );
            
            if (conflicts.length > 0) {
                return res.status(409).json({ success: false, message: 'این نوبت قبلاً رزرو شده است' });
            }
            
            // دریافت مبلغ ویزیت پزشک
            const [doctors] = await db.query(
                `SELECT consultation_fee FROM doctors WHERE user_id = ?`,
                [doctorId]
            );
            
            const amount = doctors[0]?.consultation_fee || 0;
            
            // ثبت نوبت
            const [result] = await db.query(
                `INSERT INTO appointments 
                 (doctor_id, patient_id, appointment_date, start_time, end_time, type, reason, amount, created_by, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [doctorId, patientId, appointmentDate, startTime, endTime, type || 'regular', reason, amount, userId]
            );
            
            res.json({ 
                success: true, 
                message: 'نوبت با موفقیت رزرو شد',
                appointment_id: result.insertId 
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در رزرو نوبت' });
        }
    }

    // دریافت نوبت‌های یک پزشک
    async getDoctorAppointments(req, res) {
        try {
            const { doctorId } = req.params;
            const { date, status } = req.query;
            
            let query = `
                SELECT a.*, 
                       p.full_name as patient_name, p.phone as patient_phone,
                       d.full_name as doctor_name
                FROM appointments a
                JOIN users p ON a.patient_id = p.id
                JOIN users d ON a.doctor_id = d.id
                WHERE a.doctor_id = ?
            `;
            const params = [doctorId];
            
            if (date) {
                query += ` AND a.appointment_date = ?`;
                params.push(date);
            }
            
            if (status && status !== 'all') {
                query += ` AND a.status = ?`;
                params.push(status);
            }
            
            query += ` ORDER BY a.appointment_date DESC, a.start_time`;
            
            const [appointments] = await db.query(query, params);
            
            res.json({ success: true, appointments });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌ها' });
        }
    }

    // تغییر وضعیت نوبت با state machine و ثبت تاریخچه
    async updateAppointmentStatus(req, res) {
        try {
            const pool = await db.getPool();
            await appointmentStatusService.transition(pool, {
                appointmentId: req.params.id,
                targetStatus: req.body.status,
                notes: req.body.notes,
                actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
            });
            return res.json({ success: true, message: 'وضعیت نوبت با موفقیت تغییر کرد' });
        } catch (error) {
            console.error(error.message);
            return appointmentStatusService.sendTransitionError(res, error);
        }
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
        } catch (error) {
            return appointmentStatusService.sendTransitionError(res, error, 'خطا در لغو نوبت');
        }
    }

    // دریافت مرخصی‌های پزشک
    async getDoctorLeaves(req, res) {
        try {
            const { doctorId } = req.params;
            
            const [leaves] = await db.query(
                `SELECT * FROM doctor_leaves WHERE doctor_id = ? AND status = 'approved'`,
                [doctorId]
            );
            
            res.json({ success: true, leaves });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت مرخصی‌ها' });
        }
    }

    // ثبت مرخصی جدید
    async addDoctorLeave(req, res) {
        try {
            const { doctorId, startDate, endDate, leaveType, reason } = req.body;
            
            if (!doctorId || !startDate || !endDate) {
                return res.status(400).json({ success: false, message: 'اطلاعات ناقص است' });
            }
            
            await db.query(
                `INSERT INTO doctor_leaves (doctor_id, start_date, end_date, leave_type, reason) 
                 VALUES (?, ?, ?, ?, ?)`,
                [doctorId, startDate, endDate, leaveType || 'leave', reason]
            );
            
            res.json({ success: true, message: 'مرخصی با موفقیت ثبت شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در ثبت مرخصی' });
        }
    }

    // حذف مرخصی
    async deleteDoctorLeave(req, res) {
        try {
            const { id } = req.params;
            
            await db.query(`DELETE FROM doctor_leaves WHERE id = ?`, [id]);
            
            res.json({ success: true, message: 'مرخصی با موفقیت حذف شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در حذف مرخصی' });
        }
    }

    // توابع کمکی
    timeToMinutes(time) {
        if (!time) return 0;
        const parts = time.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }
}

module.exports = new ScheduleController();