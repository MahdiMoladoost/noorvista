const db = require('../config/db');

class DashboardController {
    // آمار اصلی داشبورد
    async getStats(req, res) {
        try {
            // نوبت‌های امروز
            const [todayStats] = await db.query(`
                SELECT COUNT(*) as count 
                FROM appointments 
                WHERE appointment_date = CURDATE() 
                AND status NOT IN ('cancelled', 'no_show')
            `);
            
            // کل بیماران
            const [patientStats] = await db.query(`
                SELECT COUNT(*) as count FROM users WHERE role = 'patient'
            `);
            
            // پزشکان فعال
            const [doctorStats] = await db.query(`
                SELECT COUNT(*) as count FROM users WHERE role = 'doctor' AND is_active = 1
            `);
            
            // درآمد ماه جاری (فقط پرداخت‌های انجام شده)
            const [revenueStats] = await db.query(`
                SELECT COALESCE(SUM(p.amount), 0) as total 
                FROM payments p
                JOIN appointments a ON p.appointment_id = a.id
                WHERE p.status = 'paid' 
                AND MONTH(a.appointment_date) = MONTH(CURDATE())
                AND YEAR(a.appointment_date) = YEAR(CURDATE())
            `);
            
            res.json({
                success: true,
                today_appointments: todayStats[0]?.count || 0,
                total_patients: patientStats[0]?.count || 0,
                total_doctors: doctorStats[0]?.count || 0,
                monthly_revenue: revenueStats[0]?.total || 0
            });
        } catch (error) {
            console.error('Error in getStats:', error);
            res.status(500).json({ success: false, message: 'خطا در دریافت آمار' });
        }
    }

    // نوبت‌های امروز با جزئیات کامل
    async getTodayAppointments(req, res) {
        try {
            const [appointments] = await db.query(`
                SELECT a.*, 
                       p.full_name as patient_name,
                       d.full_name as doctor_name,
                       d.specialty as doctor_specialty
                FROM appointments a
                JOIN users p ON a.patient_id = p.id
                JOIN users d ON a.doctor_id = d.id
                WHERE a.appointment_date = CURDATE()
                ORDER BY a.start_time
            `);
            res.json({ success: true, appointments });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌ها' });
        }
    }

    // نوبت‌های در انتظار تأیید
    async getPendingAppointments(req, res) {
        try {
            const [appointments] = await db.query(`
                SELECT a.*, 
                       p.full_name as patient_name,
                       d.full_name as doctor_name,
                       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date
                FROM appointments a
                JOIN users p ON a.patient_id = p.id
                JOIN users d ON a.doctor_id = d.id
                WHERE a.status = 'pending'
                ORDER BY a.appointment_date ASC, a.start_time ASC
                LIMIT 10
            `);
            res.json({ success: true, appointments });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌ها' });
        }
    }

    // درآمد هفتگی
    async getWeeklyRevenue(req, res) {
        try {
            const [revenue] = await db.query(`
                SELECT DAYOFWEEK(a.appointment_date) as day, 
                       COALESCE(SUM(p.amount), 0) as total
                FROM appointments a
                LEFT JOIN payments p ON a.id = p.appointment_id AND p.status = 'paid'
                WHERE a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                AND a.status = 'confirmed'
                GROUP BY DAYOFWEEK(a.appointment_date)
            `);
            
            // تبدیل روزها (MySQL: 1=یکشنبه, 2=دوشنبه, ..., 7=شنبه)
            // به فرمت ما (0=شنبه, 1=یکشنبه, ..., 6=جمعه)
            const dayMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 };
            const labels = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
            const values = [0, 0, 0, 0, 0, 0, 0];
            
            revenue.forEach(r => {
                const idx = dayMap[r.day];
                if (idx !== undefined) values[idx] = r.total;
            });
            
            res.json({ success: true, labels, values });
        } catch (error) {
            console.error('Error in getWeeklyRevenue:', error);
            res.json({ success: true, labels: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'], values: [0, 0, 0, 0, 0, 0, 0] });
        }
    }

    // تأیید نوبت
    async confirmAppointment(req, res) {
        try {
            const { id } = req.params;
            await db.query(`UPDATE appointments SET status = 'confirmed' WHERE id = ?`, [id]);
            res.json({ success: true, message: 'نوبت با موفقیت تأیید شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در تأیید نوبت' });
        }
    }

    // لغو نوبت
    async cancelAppointment(req, res) {
        try {
            const { id } = req.params;
            await db.query(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [id]);
            res.json({ success: true, message: 'نوبت با موفقیت لغو شد' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'خطا در لغو نوبت' });
        }
    }
}

module.exports = new DashboardController();