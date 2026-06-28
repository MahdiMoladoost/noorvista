// src/controllers/patientController.js
// Patient-scoped APIs. Every query is constrained to req.patientId / req.user.id.
const db = require('../config/db');
const clinicTime = require('../utils/clinicTime');
const appointmentStatusService = require('../services/appointmentStatusService');
const crypto = require('crypto');
const secureCheckout = require('../services/secureAppointmentCheckout');

const APPOINTMENT_STATUSES = new Set(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']);
const APPOINTMENT_TYPES = new Set(['regular', 'follow_up', 'followup', 'consultation']);
function isTestPaymentEnabled() {
    return process.env.TEST_PAYMENT_ENABLED === 'true' || process.env.NODE_ENV !== 'production';
}

const PROFILE_FIELDS = [
    'national_code', 'birth_date', 'gender', 'address',
    'emergency_contact_name', 'emergency_contact_phone',
    'insurance_provider', 'insurance_number', 'allergies',
    'medications', 'chronic_diseases', 'medical_history'
];

function positiveInt(value, fallback, max = 100) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, max);
}

function cleanText(value, maxLength = 1000) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized ? normalized.slice(0, maxLength) : null;
}

function isIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function todayIso() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

async function tableColumns(tableName) {
    const allowed = new Set(['patients', 'payments', 'medical_records']);
    if (!allowed.has(tableName)) throw new Error('Invalid table name');
    const [rows] = await db.query(`SHOW COLUMNS FROM \`${tableName}\``);
    return new Set(rows.map(row => row.Field));
}

async function tableExists(tableName) {
    const [rows] = await db.query('SHOW TABLES LIKE ?', [tableName]);
    return rows.length > 0;
}

// آمار داشبورد
async function getDashboardStats(req, res) {
    try {
        const patientId = req.patientId;
        const [totalApps] = await db.query('SELECT COUNT(*) as count FROM appointments WHERE patient_id = ?', [patientId]);
        const [completedApps] = await db.query('SELECT COUNT(*) as count FROM appointments WHERE patient_id = ? AND status = "completed"', [patientId]);
        const [upcomingApps] = await db.query(`SELECT COUNT(*) as count FROM appointments WHERE patient_id = ? AND appointment_date >= CURDATE() AND status IN ('pending','confirmed')`, [patientId]);
        const [records] = await db.query('SELECT COUNT(*) as count FROM medical_records WHERE patient_id = ?', [patientId]);
        res.json({
            success: true,
            stats: {
                total_appointments: totalApps[0]?.count || 0,
                completed_appointments: completedApps[0]?.count || 0,
                upcoming_appointments: upcomingApps[0]?.count || 0,
                medical_records: records[0]?.count || 0
            }
        });
    } catch (error) {
        console.error('Patient dashboard stats error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت آمار' });
    }
}

// نوبت‌های بیمار
async function getMyAppointments(req, res) {
    try {
        const patientId = req.patientId;
        const page = positiveInt(req.query.page, 1, 100000);
        const limit = positiveInt(req.query.limit, 20, 100);
        const status = String(req.query.status || 'all').toLowerCase();
        const params = [patientId];
        let where = 'a.patient_id = ?';

        if (status !== 'all') {
            if (!APPOINTMENT_STATUSES.has(status)) {
                return res.status(400).json({ success: false, message: 'وضعیت نوبت معتبر نیست' });
            }
            where += ' AND a.status = ?';
            params.push(status);
        }

        const offset = (page - 1) * limit;
        const [appointments] = await db.query(
            `SELECT a.*, u.full_name as doctor_name, d.specialty,
                    mc.name AS medical_center_name,
                    s.name AS service_name,
                    pay.id AS payment_id,
                    pay.status AS payment_record_status,
                    pay.payment_method,
                    pay.receipt_number AS payment_receipt_number,
                    pay.payment_date,
                    pay.provider AS payment_provider,
                    pay.provider_reference AS payment_reference,
                    CASE
                      WHEN a.payment_status = 'free' THEN 'free'
                      WHEN pay.status = 'completed' OR a.payment_status = 'paid' THEN 'paid'
                      WHEN pay.status = 'pending' OR a.payment_status = 'pending' THEN 'pending'
                      WHEN pay.status IN ('cancelled','failed') THEN pay.status
                      ELSE COALESCE(a.payment_status, 'unpaid')
                    END AS resolved_payment_status
             FROM appointments a
             JOIN doctors d ON a.doctor_id = d.id
             JOIN users u ON d.user_id = u.id
             LEFT JOIN medical_centers mc ON mc.id = a.medical_center_id
             LEFT JOIN services s ON s.id = a.service_id
             LEFT JOIN payments pay ON pay.id = (
               SELECT p2.id FROM payments p2
               WHERE p2.appointment_id = a.id
               ORDER BY p2.id DESC LIMIT 1
             )
             WHERE ${where}
             ORDER BY a.appointment_date DESC, a.appointment_time DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const [totalResult] = await db.query(
            `SELECT COUNT(*) as total FROM appointments a WHERE ${where}`,
            params
        );
        const total = Number(totalResult[0]?.total || 0);
        res.json({
            success: true,
            appointments,
            pagination: {
                current_page: page,
                per_page: limit,
                total,
                total_pages: Math.max(1, Math.ceil(total / limit))
            }
        });
    } catch (error) {
        console.error('Patient appointments error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌ها' });
    }
}

// دریافت لیست پزشکان موجود
async function getAvailableDoctors(req, res) {
    try {
        const [doctors] = await db.query(
            `SELECT d.id, u.full_name, d.specialty, d.experience_years, d.consultation_fee
             FROM doctors d
             JOIN users u ON d.user_id = u.id
             WHERE d.is_available = 1 AND u.is_active = 1
             ORDER BY u.full_name`
        );
        res.json({ success: true, doctors });
    } catch (error) {
        console.error('Patient doctors error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت پزشکان' });
    }
}

// خدمات فعال هر پزشک؛ منبع این فهرست همان برنامه‌ها و خدمات تعریف‌شده در پنل مدیر است.
async function getDoctorServices(req, res) {
    try {
        const doctorId = positiveInt(req.params.doctorId, 0, Number.MAX_SAFE_INTEGER);
        if (!doctorId) return res.status(400).json({ success: false, message: 'شناسه پزشک معتبر نیست' });

        const [services] = await db.query(
            `SELECT DISTINCT s.id, s.name, s.slug, s.category, s.description,
                    s.default_duration_minutes, s.default_capacity, COALESCE(s.is_free, 0) AS is_free,
                    s.supplementary_insurance_enabled, s.supplementary_insurance_payment_mode,
                    s.supplementary_insurance_amount, s.supplementary_insurance_percent,
                    s.supplementary_insurance_requires_review, s.supplementary_insurance_attachment_required,
                    s.supplementary_insurance_notice,
                    MIN(CASE
                      WHEN COALESCE(s.is_free,0)=1 THEN 0
                      ELSE COALESCE(NULLIF(ds.custom_fee,0), NULLIF(s.default_fee,0), NULLIF(d.consultation_fee,0), 0)
                    END) AS minimum_fee
             FROM doctor_schedules ds
             JOIN doctors d ON d.id = ds.doctor_id AND d.is_available = 1
             JOIN users du ON du.id = d.user_id AND du.is_active = 1
             JOIN services s ON s.id = ds.service_id AND s.is_active = 1
             WHERE ds.doctor_id = ? AND COALESCE(ds.is_active, 1) = 1
               AND (ds.end_date IS NULL OR ds.end_date >= CURDATE())
             GROUP BY s.id, s.name, s.slug, s.category, s.description,
                      s.default_duration_minutes, s.default_capacity, s.is_free,
                      s.supplementary_insurance_enabled, s.supplementary_insurance_payment_mode,
                      s.supplementary_insurance_amount, s.supplementary_insurance_percent,
                      s.supplementary_insurance_requires_review, s.supplementary_insurance_attachment_required,
                      s.supplementary_insurance_notice
             ORDER BY s.category, s.name`,
            [doctorId]
        );

        res.json({
            success: true,
            services: services.map(service => ({
                ...service,
                id: Number(service.id),
                default_duration_minutes: Number(service.default_duration_minutes || 0),
                default_capacity: Number(service.default_capacity || 1),
                is_free: Number(service.is_free || 0),
                minimum_fee: Number(service.minimum_fee || 0),
                supplementary_insurance_enabled: Number(service.supplementary_insurance_enabled || 0),
                supplementary_insurance_payment_mode: service.supplementary_insurance_payment_mode || 'none',
                supplementary_insurance_amount: Number(service.supplementary_insurance_amount || 0),
                supplementary_insurance_percent: Number(service.supplementary_insurance_percent || 0),
                supplementary_insurance_requires_review: Number(service.supplementary_insurance_requires_review ?? 1),
                supplementary_insurance_attachment_required: Number(service.supplementary_insurance_attachment_required || 0),
                supplementary_insurance_notice: service.supplementary_insurance_notice || null
            }))
        });
    } catch (error) {
        console.error('Patient doctor services error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت خدمات پزشک' });
    }
}

// روزهای دارای ظرفیت واقعی برای یک پزشک و خدمت؛ برای رنگی‌کردن تقویم بیمار استفاده می‌شود.
async function getAvailableDates(req, res) {
    try {
        const doctorId = positiveInt(req.query.doctor_id, 0, Number.MAX_SAFE_INTEGER);
        const serviceId = positiveInt(req.query.service_id, 0, Number.MAX_SAFE_INTEGER);
        const from = isIsoDate(req.query.from) ? String(req.query.from) : todayIso();
        const defaultTo = new Date(`${from}T12:00:00`);
        defaultTo.setDate(defaultTo.getDate() + 120);
        const to = isIsoDate(req.query.to) ? String(req.query.to) : defaultTo.toISOString().slice(0, 10);

        if (!doctorId || !serviceId) {
            return res.status(400).json({ success: false, message: 'پزشک و نوع مراجعه الزامی است' });
        }
        if (to < from) return res.status(400).json({ success: false, message: 'بازه تاریخ معتبر نیست' });
        const fromDate = new Date(`${from}T12:00:00`);
        const toDate = new Date(`${to}T12:00:00`);
        if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime()) || (toDate - fromDate) > 370 * 86400000) {
            return res.status(400).json({ success: false, message: 'حداکثر بازه قابل بررسی ۳۷۰ روز است' });
        }

        const [rows] = await db.query(
            `SELECT aps.id, DATE_FORMAT(aps.slot_date, '%Y-%m-%d') AS slot_date,
                    aps.start_time, aps.end_time, aps.capacity,
                    s.id AS service_id, s.name AS service_name,
                    GREATEST(0,
                      aps.capacity
                      - (SELECT COUNT(*) FROM appointments a
                         WHERE a.appointment_slot_id = aps.id AND a.status NOT IN ('cancelled','no_show'))
                      - (SELECT COUNT(*) FROM appointment_payment_reservations r
                         WHERE r.appointment_slot_id = aps.id AND r.status = 'pending' AND r.expires_at > UTC_TIMESTAMP())
                    ) AS remaining_capacity
             FROM appointment_slots aps
             JOIN doctors d ON d.id = aps.doctor_id AND d.is_available = 1
             JOIN users du ON du.id = d.user_id AND du.is_active = 1
             JOIN medical_centers mc ON mc.id = aps.medical_center_id AND mc.is_active = 1
             JOIN services s ON s.id = aps.service_id AND s.is_active = 1
             LEFT JOIN doctor_schedules ds ON ds.id = aps.doctor_schedule_id
             WHERE aps.doctor_id = ? AND aps.service_id = ?
               AND aps.slot_date BETWEEN ? AND ?
               AND aps.status = 'available' AND COALESCE(ds.is_active, 1) = 1
               AND (aps.slot_date > CURDATE() OR aps.start_time > CURTIME())
             HAVING remaining_capacity > 0
             ORDER BY aps.slot_date, aps.start_time
             LIMIT 5000`,
            [doctorId, serviceId, from, to]
        );

        const byDate = new Map();
        for (const row of rows) {
            const date = String(row.slot_date).slice(0, 10);
            if (!byDate.has(date)) {
                byDate.set(date, {
                    date,
                    slots_count: 0,
                    remaining_capacity: 0,
                    first_time: String(row.start_time || '').slice(0, 5),
                    last_time: String(row.end_time || '').slice(0, 5),
                    service_id: Number(row.service_id),
                    service_name: row.service_name
                });
            }
            const item = byDate.get(date);
            item.slots_count += 1;
            item.remaining_capacity += Number(row.remaining_capacity || 0);
            item.last_time = String(row.end_time || '').slice(0, 5);
        }

        res.json({
            success: true,
            from,
            to,
            available_dates: Array.from(byDate.values())
        });
    } catch (error) {
        console.error('Patient available dates error:', error);
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(503).json({ success: false, message: 'ساختار نوبت‌دهی کامل نیست؛ ابتدا مهاجرت‌های پایگاه داده را اجرا کنید' });
        }
        res.status(500).json({ success: false, message: 'خطا در دریافت روزهای دارای نوبت' });
    }
}

// ساعت کاری پزشک
async function getDoctorSchedule(req, res) {
    try {
        const doctorId = positiveInt(req.params.doctorId, 0, Number.MAX_SAFE_INTEGER);
        if (!doctorId) return res.status(400).json({ success: false, message: 'شناسه پزشک معتبر نیست' });
        const [schedules] = await db.query(
            'SELECT * FROM schedules WHERE doctor_id = ? AND is_working = 1 ORDER BY day_of_week',
            [doctorId]
        );
        res.json({ success: true, schedules });
    } catch (error) {
        console.error('Patient doctor schedule error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت ساعت کاری' });
    }
}

// ساعات خالی
async function getAvailableTimeSlots(req, res) {
    try {
        const doctorId = positiveInt(req.query.doctor_id, 0, Number.MAX_SAFE_INTEGER);
        const serviceId = positiveInt(req.query.service_id, 0, Number.MAX_SAFE_INTEGER);
        const date = String(req.query.date || '');
        if (!doctorId || !serviceId || !isIsoDate(date)) {
            return res.status(400).json({ success: false, message: 'پزشک، نوع مراجعه و تاریخ معتبر الزامی است' });
        }
        if (date < todayIso()) {
            return res.status(400).json({ success: false, message: 'امکان رزرو برای تاریخ گذشته وجود ندارد' });
        }

        const [slots] = await db.query(
            `SELECT aps.id, aps.slot_date, aps.start_time, aps.end_time, aps.capacity,
                    aps.doctor_id, aps.medical_center_id, aps.service_id,
                    mc.name AS medical_center_name, s.name AS service_name,
                    s.supplementary_insurance_enabled, s.supplementary_insurance_payment_mode,
                    s.supplementary_insurance_amount, s.supplementary_insurance_percent,
                    s.supplementary_insurance_requires_review, s.supplementary_insurance_attachment_required,
                    s.supplementary_insurance_notice,
                    CASE WHEN COALESCE(s.is_free,0)=1 THEN 0 ELSE COALESCE(NULLIF(ds.custom_fee,0), NULLIF(s.default_fee,0), NULLIF(d.consultation_fee,0), 0) END AS appointment_fee,
                    CASE
                      WHEN COALESCE(s.is_free,0)=1 THEN 'free'
                      WHEN COALESCE(ds.custom_fee,0) > 0 THEN 'schedule'
                      WHEN COALESCE(s.default_fee,0) > 0 THEN 'service'
                      WHEN COALESCE(d.consultation_fee,0) > 0 THEN 'doctor'
                      ELSE 'free'
                    END AS fee_source,
                    GREATEST(0,
                      aps.capacity
                      - (SELECT COUNT(*) FROM appointments a
                         WHERE a.appointment_slot_id=aps.id AND a.status NOT IN ('cancelled','no_show'))
                      - (SELECT COUNT(*) FROM appointment_payment_reservations r
                         WHERE r.appointment_slot_id=aps.id AND r.status='pending' AND r.expires_at>UTC_TIMESTAMP())
                    ) AS remaining_capacity
             FROM appointment_slots aps
             JOIN doctors d ON d.id=aps.doctor_id AND d.is_available=1
             JOIN users du ON du.id=d.user_id AND du.is_active=1
             JOIN medical_centers mc ON mc.id=aps.medical_center_id AND mc.is_active=1
             JOIN services s ON s.id=aps.service_id AND s.is_active=1
             LEFT JOIN doctor_schedules ds ON ds.id=aps.doctor_schedule_id
             WHERE aps.doctor_id=? AND aps.service_id=? AND aps.slot_date=? AND aps.status='available'
               AND COALESCE(ds.is_active,1)=1
               AND (aps.slot_date > CURDATE() OR aps.start_time > CURTIME())
               AND (COALESCE(s.is_free,0)=1 OR COALESCE(ds.custom_fee,0)>0 OR COALESCE(s.default_fee,0)>0 OR COALESCE(d.consultation_fee,0)>0)
             HAVING remaining_capacity>0
             ORDER BY aps.start_time, s.name, mc.name`,
            [doctorId, serviceId, date]
        );

        return res.json({
            success: true,
            available_slots: slots.map(slot => ({
                id: Number(slot.id),
                slot_date: String(slot.slot_date).slice(0, 10),
                start_time: String(slot.start_time).slice(0, 5),
                end_time: String(slot.end_time).slice(0, 5),
                service_id: Number(slot.service_id),
                service_name: slot.service_name,
                medical_center_id: Number(slot.medical_center_id),
                medical_center_name: slot.medical_center_name,
                amount: Number(slot.appointment_fee || 0),
                fee_source: slot.fee_source,
                remaining_capacity: Number(slot.remaining_capacity || 0),
                supplementary_insurance_enabled: Number(slot.supplementary_insurance_enabled || 0),
                supplementary_insurance_payment_mode: slot.supplementary_insurance_payment_mode || 'none',
                supplementary_insurance_amount: Number(slot.supplementary_insurance_amount || 0),
                supplementary_insurance_percent: Number(slot.supplementary_insurance_percent || 0),
                supplementary_insurance_requires_review: Number(slot.supplementary_insurance_requires_review ?? 1),
                supplementary_insurance_attachment_required: Number(slot.supplementary_insurance_attachment_required || 0),
                supplementary_insurance_notice: slot.supplementary_insurance_notice || null
            }))
        });
    } catch (error) {
        console.error('Patient available slots error:', error);
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(503).json({ success: false, message: 'ساختار نوبت‌دهی کامل نیست؛ ابتدا مهاجرت‌های پایگاه داده را اجرا کنید' });
        }
        return res.status(500).json({ success: false, message: 'خطا در دریافت نوبت‌های خالی' });
    }
}

function timeToMinutes(value) {
    const parts = String(value || '00:00').split(':');
    return (Number.parseInt(parts[0], 10) || 0) * 60 + (Number.parseInt(parts[1], 10) || 0);
}

function minutesToTime(minutes) {
    return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}

// رزرو نوبت جدید
async function bookAppointment(req, res) {
    try {
        const result = await secureCheckout.createCheckout({
            patientId: req.patientId,
            actorUserId: req.user.id,
            appointmentSlotId: req.body.appointment_slot_id,
            type: req.body.type,
            reason: req.body.reason,
            insurance: req.body,
            expectedAmount: req.body.expected_amount,
            req
        });
        return res.status(201).json({ success: true, ...result });
    } catch (error) {
        console.error('Patient secure checkout error:', error);
        const status = Number(error.status || 500);
        const message = error.expose ? error.message : 'خطا در شروع فرایند نوبت و پرداخت';
        return res.status(status).json({ success: false, code: error.code || 'CHECKOUT_ERROR', message });
    }
}

// اطلاعات پرداخت آزمایشی یک نوبت// پرداخت امن مبتنی بر رزرو موقت؛ برای خدمات پولی تا پیش از تأیید پرداخت هیچ نوبتی ایجاد نمی‌شود.
async function getCheckoutPreview(req, res) {
    try {
        const checkout = await secureCheckout.getCheckoutPreview({
            rawToken: req.params.token,
            patientId: req.patientId,
            req
        });
        return res.json({
            success: true,
            test_mode: String(checkout.provider) === 'sandbox',
            checkout,
            expires_at: checkout.expires_at,
            already_paid: checkout.status === 'paid'
        });
    } catch (error) {
        console.error('Patient checkout preview error:', error);
        return res.status(Number(error.status || 500)).json({
            success: false,
            code: error.code || 'CHECKOUT_PREVIEW_ERROR',
            message: error.expose ? error.message : 'خطا در دریافت اطلاعات پرداخت'
        });
    }
}

async function completeCheckoutTestPayment(req, res) {
    try {
        const result = await secureCheckout.completeSandboxCheckout({
            rawToken: req.params.token,
            patientId: req.patientId,
            actorUserId: req.user.id,
            req
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        console.error('Patient secure test payment error:', error);
        return res.status(Number(error.status || 500)).json({
            success: false,
            code: error.code || 'PAYMENT_ERROR',
            message: error.expose ? error.message : 'خطا در تأیید پرداخت'
        });
    }
}

async function cancelCheckoutPayment(req, res) {
    try {
        const result = await secureCheckout.cancelCheckout({
            rawToken: req.params.token,
            patientId: req.patientId,
            actorUserId: req.user.id,
            req
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        console.error('Patient secure checkout cancel error:', error);
        return res.status(Number(error.status || 500)).json({
            success: false,
            code: error.code || 'CHECKOUT_CANCEL_ERROR',
            message: error.expose ? error.message : 'خطا در انصراف از پرداخت'
        });
    }
}

// اطلاعات پرداخت آزمایشی یک نوبت؛ فقط برای سازگاری با نوبت‌های قدیمی پرداخت‌نشده.
async function getTestPaymentPreview(req, res) {
    try {
        if (!isTestPaymentEnabled()) {
            return res.status(403).json({ success: false, message: 'پرداخت آزمایشی در این محیط فعال نیست' });
        }
        const appointmentId = positiveInt(req.params.appointmentId, 0, Number.MAX_SAFE_INTEGER);
        if (!appointmentId) return res.status(400).json({ success: false, message: 'شناسه نوبت معتبر نیست' });

        const [rows] = await db.query(
            `SELECT a.id, a.patient_id, a.doctor_id, a.medical_center_id, a.service_id,
                    a.appointment_date, a.appointment_time, a.status, a.payment_status,
                    a.amount, a.tracking_code, a.type, a.reason,
                    du.full_name AS doctor_name, d.specialty,
                    pu.full_name AS patient_name, pu.phone AS patient_phone,
                    mc.name AS medical_center_name, s.name AS service_name,
                    pay.id AS payment_id, pay.status AS payment_record_status,
                    pay.payment_method, pay.receipt_number, pay.payment_date,
                    pay.provider, pay.provider_reference
             FROM appointments a
             JOIN doctors d ON d.id = a.doctor_id
             JOIN users du ON du.id = d.user_id
             JOIN patients pat ON pat.id = a.patient_id
             JOIN users pu ON pu.id = pat.user_id
             LEFT JOIN medical_centers mc ON mc.id = a.medical_center_id
             LEFT JOIN services s ON s.id = a.service_id
             LEFT JOIN payments pay ON pay.id = (
               SELECT p2.id FROM payments p2
               WHERE p2.appointment_id = a.id
               ORDER BY p2.id DESC LIMIT 1
             )
             WHERE a.id = ? AND a.patient_id = ?
             LIMIT 1`,
            [appointmentId, req.patientId]
        );
        const appointment = rows[0];
        if (!appointment) return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
        if (['cancelled', 'no_show'].includes(String(appointment.status || '').toLowerCase())) {
            return res.status(409).json({ success: false, message: 'برای نوبت لغوشده امکان پرداخت وجود ندارد' });
        }
        if (Number(appointment.amount || 0) <= 0) {
            return res.status(409).json({ success: false, message: 'تعرفه معتبر برای این نوبت ثبت نشده است' });
        }
        return res.json({
            success: true,
            test_mode: true,
            appointment,
            already_paid: appointment.payment_record_status === 'completed' || appointment.payment_status === 'paid'
        });
    } catch (error) {
        console.error('Patient test payment preview error:', error);
        return res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات پرداخت آزمایشی' });
    }
}

// تکمیل پرداخت آزمایشی. این مسیر هیچ اطلاعات کارت بانکی دریافت یا ذخیره نمی‌کند.
async function completeTestPayment(req, res) {
    let connection;
    try {
        if (!isTestPaymentEnabled()) {
            return res.status(403).json({ success: false, message: 'پرداخت آزمایشی در این محیط فعال نیست' });
        }
        const appointmentId = positiveInt(req.params.appointmentId, 0, Number.MAX_SAFE_INTEGER);
        if (!appointmentId) return res.status(400).json({ success: false, message: 'شناسه نوبت معتبر نیست' });

        connection = await db.beginTransaction();
        const [rows] = await connection.query(
            `SELECT a.id, a.patient_id, a.amount, a.status, a.payment_status
             FROM appointments a
             WHERE a.id = ? AND a.patient_id = ?
             LIMIT 1 FOR UPDATE`,
            [appointmentId, req.patientId]
        );
        const appointment = rows[0];
        if (!appointment) {
            await db.rollback(connection); connection = null;
            return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
        }
        if (['cancelled', 'no_show'].includes(String(appointment.status || '').toLowerCase())) {
            await db.rollback(connection); connection = null;
            return res.status(409).json({ success: false, message: 'برای نوبت لغوشده امکان پرداخت وجود ندارد' });
        }
        const amount = Number(appointment.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
            await db.rollback(connection); connection = null;
            return res.status(409).json({ success: false, message: 'تعرفه معتبر برای این نوبت ثبت نشده است' });
        }

        const [existing] = await connection.query(
            `SELECT id, status, receipt_number, provider_reference
             FROM payments
             WHERE appointment_id = ? AND status = 'completed'
             ORDER BY id DESC LIMIT 1 FOR UPDATE`,
            [appointmentId]
        );
        if (existing.length) {
            await connection.query(
                `UPDATE appointments
                 SET payment_status = 'paid',
                     status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END
                 WHERE id = ?`,
                [appointmentId]
            );
            await db.commit(connection); connection = null;
            return res.json({
                success: true,
                message: 'این نوبت قبلاً پرداخت و تأیید شده است',
                idempotent: true,
                payment_id: existing[0].id,
                receipt_number: existing[0].receipt_number,
                reference_number: existing[0].provider_reference
            });
        }

        const token = crypto.randomBytes(6).toString('hex').toUpperCase();
        const receiptNumber = `TEST-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${token}`;
        const authority = `SANDBOX-${appointmentId}-${Date.now()}`;
        const reference = `NVTEST-${token}`;
        const idempotencyKey = `test-payment-${appointmentId}`;
        const [paymentResult] = await connection.query(
            `INSERT INTO payments
               (appointment_id, amount, payment_method, status, receipt_number, description,
                created_by, provider, provider_authority, provider_reference, idempotency_key,
                verified_at)
             VALUES (?, ?, 'online', 'completed', ?, ?, ?, 'sandbox', ?, ?, ?, NOW())`,
            [
                appointmentId,
                amount,
                receiptNumber,
                'پرداخت آزمایشی سامانه تا زمان اتصال درگاه واقعی',
                req.user.id,
                authority,
                reference,
                idempotencyKey
            ]
        );
        await connection.query(
            `UPDATE appointments
             SET payment_status = 'paid',
                 status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END
             WHERE id = ?`,
            [appointmentId]
        );
        await db.commit(connection); connection = null;
        return res.json({
            success: true,
            message: 'پرداخت آزمایشی با موفقیت ثبت شد و نوبت تأیید شد',
            payment_id: paymentResult.insertId,
            receipt_number: receiptNumber,
            reference_number: reference,
            amount
        });
    } catch (error) {
        if (connection) await db.rollback(connection).catch(() => {});
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'پرداخت این نوبت قبلاً ثبت شده است؛ صفحه را تازه‌سازی کنید' });
        }
        console.error('Patient complete test payment error:', error);
        return res.status(500).json({ success: false, message: 'خطا در ثبت پرداخت آزمایشی' });
    }
}

async function cancelTestPayment(req, res) {
    try {
        if (!isTestPaymentEnabled()) {
            return res.status(403).json({ success: false, message: 'پرداخت آزمایشی در این محیط فعال نیست' });
        }
        const appointmentId = positiveInt(req.params.appointmentId, 0, Number.MAX_SAFE_INTEGER);
        if (!appointmentId) return res.status(400).json({ success: false, message: 'شناسه نوبت معتبر نیست' });
        const [rows] = await db.query(
            `SELECT id, status, payment_status FROM appointments
             WHERE id = ? AND patient_id = ? LIMIT 1`,
            [appointmentId, req.patientId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
        if (rows[0].payment_status === 'paid') {
            return res.status(409).json({ success: false, message: 'پرداخت این نوبت قبلاً تکمیل شده و قابل انصراف نیست' });
        }
        await db.query(
            `UPDATE appointments SET payment_status = 'unpaid'
             WHERE id = ? AND patient_id = ? AND payment_status <> 'paid'`,
            [appointmentId, req.patientId]
        );
        return res.json({
            success: true,
            message: 'از پرداخت منصرف شدید؛ نوبت حذف نشده و همچنان در انتظار پرداخت است',
            appointment_id: appointmentId
        });
    } catch (error) {
        console.error('Patient cancel test payment error:', error);
        return res.status(500).json({ success: false, message: 'خطا در انصراف از پرداخت آزمایشی' });
    }
}

// لغو نوبت
async function cancelAppointment(req, res) {
    try {
        const appointmentId = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
        const patientId = req.patientId;
        if (!appointmentId) return res.status(400).json({ success: false, message: 'شناسه نوبت معتبر نیست' });

        const [appointments] = await db.query(
            'SELECT id, appointment_date, appointment_time, status FROM appointments WHERE id = ? AND patient_id = ? LIMIT 1',
            [appointmentId, patientId]
        );
        if (!appointments.length) return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
        const appointment = appointments[0];
        if (!['pending', 'confirmed'].includes(appointment.status)) {
            return res.status(400).json({ success: false, message: 'این نوبت در وضعیت فعلی قابل لغو نیست' });
        }

        const appointmentDateTime = clinicTime.zonedDateTimeToUtc(String(appointment.appointment_date).slice(0, 10), String(appointment.appointment_time).slice(0, 8));
        const hoursDifference = (appointmentDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
        if (!Number.isFinite(hoursDifference) || hoursDifference < 24) {
            return res.status(400).json({ success: false, message: 'لغو آنلاین فقط تا ۲۴ ساعت قبل از مراجعه امکان‌پذیر است' });
        }

        const pool = await db.getPool();
        await appointmentStatusService.transition(pool, {
            appointmentId,
            targetStatus: 'cancelled',
            expectedPatientId: patientId,
            reason: req.body?.reason || 'لغو توسط بیمار',
            actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
        });
        res.json({ success: true, message: 'نوبت لغو شد' });
    } catch (error) {
        console.error('Patient cancel appointment error:', error);
        return appointmentStatusService.sendTransitionError(res, error, 'خطا در لغو نوبت');
    }
}

// پرونده پزشکی بیمار
async function getMyMedicalRecords(req, res) {
    try {
        const patientId = req.patientId;
        if (!(await tableExists('medical_records'))) {
            return res.json({ success: true, records: [] });
        }

        const columns = await tableColumns('medical_records');
        if (!columns.has('patient_id')) {
            return res.json({ success: true, records: [] });
        }

        const select = ['mr.id'];
        const safeColumn = (name, alias = name) => {
            if (columns.has(name)) select.push(`mr.\`${name}\` AS \`${alias}\``);
            else select.push(`NULL AS \`${alias}\``);
        };

        safeColumn('doctor_id');
        safeColumn('diagnosis');
        safeColumn('symptoms');
        safeColumn('prescription');
        safeColumn('notes');

        if (columns.has('record_date') && columns.has('created_at')) {
            select.push("DATE_FORMAT(COALESCE(mr.record_date, mr.created_at), '%Y-%m-%d') AS record_date");
        } else if (columns.has('record_date')) {
            select.push("DATE_FORMAT(mr.record_date, '%Y-%m-%d') AS record_date");
        } else if (columns.has('created_at')) {
            select.push("DATE_FORMAT(mr.created_at, '%Y-%m-%d') AS record_date");
        } else {
            select.push("NULL AS record_date");
        }

        if (columns.has('created_at')) select.push("mr.created_at");
        else select.push("NULL AS created_at");

        const doctorJoin = columns.has('doctor_id')
            ? "LEFT JOIN doctors d ON mr.doctor_id = d.id LEFT JOIN users u ON d.user_id = u.id"
            : "LEFT JOIN doctors d ON 1=0 LEFT JOIN users u ON 1=0";
        select.push("COALESCE(u.full_name, d.full_name, 'پزشک ثبت نشده') AS doctor_name");

        const orderBy = columns.has('record_date')
            ? "ORDER BY mr.record_date DESC, mr.id DESC"
            : (columns.has('created_at') ? "ORDER BY mr.created_at DESC, mr.id DESC" : "ORDER BY mr.id DESC");

        const [records] = await db.query(
            `SELECT ${select.join(', ')}
             FROM medical_records mr
             ${doctorJoin}
             WHERE mr.patient_id = ?
             ${orderBy}`,
            [patientId]
        );
        return res.json({ success: true, records });
    } catch (error) {
        console.error('Patient medical records error:', error);
        return res.status(500).json({ success: false, message: 'خطا در دریافت پرونده پزشکی' });
    }
}

// نسخه‌های بیمار
async function getMyPrescriptions(req, res) {
    try {
        const patientId = req.patientId;
        const [prescriptions] = await db.query(
            `SELECT p.*, u.full_name as doctor_name,
                    DATE_FORMAT(p.created_at, '%Y-%m-%d') as created_at
             FROM prescriptions p
             JOIN doctors d ON p.doctor_id = d.id
             JOIN users u ON d.user_id = u.id
             WHERE p.patient_id = ?
             ORDER BY p.created_at DESC, p.id DESC`,
            [patientId]
        );
        res.json({ success: true, prescriptions });
    } catch (error) {
        console.error('Patient prescriptions error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت نسخه‌ها' });
    }
}

// سوابق مالی بیمار؛ فقط پرداخت‌های متصل به نوبت‌های خود بیمار برگردانده می‌شوند.
async function getMyPayments(req, res) {
    try {
        const patientId = req.patientId;
        const paymentsAvailable = await tableExists('payments');
        let payments = [];
        let paymentColumns = new Set();

        if (paymentsAvailable) {
            paymentColumns = await tableColumns('payments');
            const field = (name, fallback = 'NULL') => paymentColumns.has(name) ? `pay.\`${name}\`` : fallback;
            const dateExpression = paymentColumns.has('payment_date')
                ? 'pay.payment_date'
                : paymentColumns.has('created_at') ? 'pay.created_at' : 'NULL';
            const [rows] = await db.query(
                `SELECT ${field('id', '0')} AS id,
                        ${field('appointment_id', 'a.id')} AS appointment_id,
                        ${field('amount', 'a.amount')} AS amount,
                        ${field('payment_method', 'NULL')} AS payment_method,
                        ${field('status', "'completed'")} AS status,
                        ${field('receipt_number', 'NULL')} AS receipt_number,
                        ${field('description', 'NULL')} AS description,
                        ${dateExpression} AS payment_date,
                        a.appointment_date, a.appointment_time,
                        u.full_name AS doctor_name
                 FROM payments pay
                 JOIN appointments a ON pay.appointment_id = a.id
                 JOIN doctors d ON a.doctor_id = d.id
                 JOIN users u ON d.user_id = u.id
                 WHERE a.patient_id = ?
                 ORDER BY ${dateExpression === 'NULL' ? 'pay.id' : dateExpression} DESC`,
                [patientId]
            );
            payments = rows;
        }

        let unpaidSql = `SELECT a.id, a.appointment_date, a.appointment_time, a.amount, a.status,
                                u.full_name AS doctor_name, d.specialty
                         FROM appointments a
                         JOIN doctors d ON a.doctor_id = d.id
                         JOIN users u ON d.user_id = u.id`;
        const unpaidParams = [patientId];
        if (paymentsAvailable && paymentColumns.has('appointment_id')) {
            const completedCondition = paymentColumns.has('status') ? " AND pay.status = 'completed'" : '';
            const paidMarker = paymentColumns.has('id') ? 'pay.id' : 'pay.appointment_id';
            unpaidSql += ` LEFT JOIN payments pay ON pay.appointment_id = a.id${completedCondition}`;
            unpaidSql += ` WHERE a.patient_id = ? AND COALESCE(a.amount, 0) > 0
                           AND a.status NOT IN ('cancelled','no_show') AND ${paidMarker} IS NULL`;
        } else {
            unpaidSql += ` WHERE a.patient_id = ? AND COALESCE(a.amount, 0) > 0
                           AND a.status NOT IN ('cancelled','no_show')`;
        }
        unpaidSql += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 100';
        const [unpaidAppointments] = await db.query(unpaidSql, unpaidParams);

        const totalPaid = payments
            .filter(item => ['completed', 'paid', 'success'].includes(String(item.status || '').toLowerCase()))
            .reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const pendingAmount = unpaidAppointments.reduce((sum, item) => sum + Number(item.amount || 0), 0);

        res.json({
            success: true,
            feature_available: paymentsAvailable,
            payments,
            unpaid_appointments: unpaidAppointments,
            total_paid: totalPaid,
            pending_amount: pendingAmount
        });
    } catch (error) {
        console.error('Patient payments error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات پرداخت' });
    }
}

// پروفایل بیمار
async function getProfile(req, res) {
    try {
        const userId = req.user.id;
        const columns = await tableColumns('patients');
        const optionalFields = PROFILE_FIELDS.map(field => columns.has(field) ? `p.\`${field}\`` : `NULL AS \`${field}\``).join(', ');
        const [patients] = await db.query(
            `SELECT u.id, u.full_name, u.email, u.phone, ${optionalFields}
             FROM users u
             JOIN patients p ON u.id = p.user_id
             WHERE u.id = ?
             LIMIT 1`,
            [userId]
        );
        if (!patients.length) return res.status(404).json({ success: false, message: 'بیمار یافت نشد' });
        res.json({ success: true, patient: patients[0] });
    } catch (error) {
        console.error('Patient profile error:', error);
        res.status(500).json({ success: false, message: 'خطا در دریافت پروفایل' });
    }
}

async function updateProfile(req, res) {
    let connection;
    try {
        const userId = req.user.id;
        const fullName = cleanText(req.body.full_name, 200);
        const phone = cleanText(req.body.phone, 20);
        const email = cleanText(req.body.email, 200);
        if (!fullName || !phone) {
            return res.status(400).json({ success: false, message: 'نام کامل و شماره تلفن الزامی است' });
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'نشانی ایمیل معتبر نیست' });
        }
        if (req.body.birth_date && (!isIsoDate(req.body.birth_date) || req.body.birth_date > todayIso())) {
            return res.status(400).json({ success: false, message: 'تاریخ تولد معتبر نیست' });
        }
        const gender = cleanText(req.body.gender, 20);
        if (gender && !['male', 'female', 'other'].includes(gender)) {
            return res.status(400).json({ success: false, message: 'مقدار جنسیت معتبر نیست' });
        }

        const columns = await tableColumns('patients');
        const fieldLimits = {
            national_code: 20,
            birth_date: 10,
            gender: 20,
            address: 1000,
            emergency_contact_name: 150,
            emergency_contact_phone: 30,
            insurance_provider: 120,
            insurance_number: 80,
            allergies: 2000,
            medications: 2000,
            chronic_diseases: 2000,
            medical_history: 3000
        };
        const updates = [];
        const values = [];
        for (const field of PROFILE_FIELDS) {
            if (!columns.has(field)) continue;
            updates.push(`\`${field}\` = ?`);
            values.push(cleanText(req.body[field], fieldLimits[field] || 1000));
        }

        connection = await db.beginTransaction();
        await connection.query(
            'UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?',
            [fullName, email, phone, userId]
        );
        if (updates.length) {
            await connection.query(
                `UPDATE patients SET ${updates.join(', ')} WHERE user_id = ?`,
                [...values, userId]
            );
        }
        await db.commit(connection);
        connection = null;
        res.json({ success: true, message: 'پروفایل به‌روزرسانی شد' });
    } catch (error) {
        if (connection) await db.rollback(connection).catch(() => {});
        console.error('Patient profile update error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'شماره تلفن یا ایمیل واردشده قبلاً ثبت شده است' });
        }
        res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی پروفایل' });
    }
}

module.exports = {
    getDashboardStats,
    getMyAppointments,
    getAvailableDoctors,
    getDoctorServices,
    getAvailableDates,
    getDoctorSchedule,
    getAvailableTimeSlots,
    bookAppointment,
    cancelAppointment,
    getMyMedicalRecords,
    getMyPrescriptions,
    getMyPayments,
    getCheckoutPreview,
    completeCheckoutTestPayment,
    cancelCheckoutPayment,
    getTestPaymentPreview,
    completeTestPayment,
    cancelTestPayment,
    getProfile,
    updateProfile
};
