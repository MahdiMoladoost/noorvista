// src/controllers/doctorController.js
const db = require('../config/db');
const crypto = require('crypto');
const appointmentStatusService = require('../services/appointmentStatusService');
const clinicalAccessService = require('../services/clinicalAccessService');

const APPOINTMENT_STATUSES = new Set(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']);


function toEnglishDigits(value) {
    return String(value ?? '')
        .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function cleanPhone(value) {
    return toEnglishDigits(value).replace(/[^0-9+]/g, '').replace(/^\+98/, '0').replace(/^0098/, '0');
}

function cleanMoney(value) {
    const number = Number(toEnglishDigits(value).replace(/\D/g, '') || 0);
    return Number.isFinite(number) ? number : 0;
}

function normalizeBoolean(value) {
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    if (typeof value === 'string') return ['true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return Boolean(value);
}

function normalizeTime(value, fallback) {
    const text = toEnglishDigits(value || '').trim();
    const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return fallback;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeToMinutes(value) {
    const [hour, minute] = String(value || '00:00').split(':').map(Number);
    return hour * 60 + minute;
}

function isValidEmail(value) {
    const text = String(value || '').trim();
    return !text || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

async function assertClinicalRelationship(doctorId, patientId, appointmentId = null, scope = 'read') {
    const pool = await db.getPool();
    return clinicalAccessService.resolveDoctorPatientAccess(pool, { doctorId, patientId, appointmentId, scope });
}

async function auditBreakGlassIfUsed(req, access, patientId, recordId = null, executor = null) {
    if (access?.source !== 'break_glass' || !access.grant?.id) return;
    const target = executor || await db.getPool();
    await clinicalAccessService.recordBreakGlassUse(target, access.grant.id);
    await auditMedicalAccess(req, {
        patientId: Number(patientId), recordId, action: 'break_glass',
        reason: `grant:${access.grant.id};scope:${access.grant.access_scope}`
    }, target);
}

async function auditMedicalAccess(req, { patientId, recordId = null, action, reason = null }, executor = db) {
    await executor.query(
        `INSERT INTO medical_access_audit
         (actor_user_id, patient_id, medical_record_id, action, reason, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, patientId, recordId, action, reason, req.ip || null, String(req.get?.('user-agent') || '').slice(0, 500) || null]
    );
}

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
            `SELECT COUNT(DISTINCT patient_id) as count FROM (
                SELECT patient_id FROM appointments WHERE doctor_id = ?
                UNION
                SELECT patient_id FROM medical_records WHERE doctor_id = ?
                UNION
                SELECT patient_id FROM prescriptions WHERE doctor_id = ?
             ) doctor_patients`,
            [doctorId, doctorId, doctorId]
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
            `SELECT a.*,
                    COALESCE(NULLIF(u.full_name, ''), NULLIF(p.full_name, ''), CONCAT('بیمار #', p.id), 'بیمار') AS patient_name,
                    COALESCE(NULLIF(u.phone, ''), NULLIF(p.phone, ''), NULLIF(p.mobile, ''), '-') AS patient_phone
             FROM appointments a
             LEFT JOIN patients p ON a.patient_id = p.id
             LEFT JOIN users u ON p.user_id = u.id
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
        const doctorId = Number(req.doctorId || req.user?.doctor_id || 0);
        if (!doctorId) return res.status(404).json({ success: false, message: 'اطلاعات پزشک یافت نشد' });

        const { status, start_date, end_date, page = 1, limit = 20 } = req.query;
        const pageNumber = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
        const where = ['a.doctor_id = ?'];
        const params = [doctorId];

        if (status && status !== 'all') {
            where.push('a.status = ?');
            params.push(status);
        }
        if (start_date) {
            where.push('a.appointment_date >= ?');
            params.push(start_date);
        }
        if (end_date) {
            where.push('a.appointment_date <= ?');
            params.push(end_date);
        }

        const baseQuery = `
            FROM appointments a
            LEFT JOIN patients p ON a.patient_id = p.id
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN services s ON a.service_id = s.id
            LEFT JOIN medical_centers mc ON a.medical_center_id = mc.id
            WHERE ${where.join(' AND ')}
        `;
        const offset = (pageNumber - 1) * pageSize;

        const [appointments] = await db.query(
            `SELECT a.*,
                    COALESCE(NULLIF(u.full_name, ''), NULLIF(p.full_name, ''), CONCAT('بیمار #', p.id), 'بیمار') AS patient_name,
                    COALESCE(NULLIF(u.phone, ''), NULLIF(p.phone, ''), NULLIF(p.mobile, ''), '-') AS patient_phone,
                    COALESCE(NULLIF(s.name, ''), NULLIF(a.type, ''), NULLIF(a.reason, ''), 'ویزیت') AS service_name,
                    COALESCE(NULLIF(mc.name, ''), '-') AS medical_center_name
             ${baseQuery}
             ORDER BY a.appointment_date DESC, a.appointment_time DESC
             LIMIT ? OFFSET ?`,
            [...params, pageSize, offset]
        );
        const [totalResult] = await db.query(`SELECT COUNT(*) as total ${baseQuery}`, params);
        const total = Number(totalResult[0]?.total || 0);

        res.json({
            success: true,
            appointments,
            pagination: {
                current_page: pageNumber,
                per_page: pageSize,
                total,
                total_pages: Math.ceil(total / pageSize)
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
        const pool = await db.getPool();
        await appointmentStatusService.transition(pool, {
            appointmentId: id,
            targetStatus: status,
            notes,
            expectedDoctorId: req.doctorId,
            actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
        });
        return res.json({ success: true, message: 'وضعیت نوبت تغییر کرد' });
    } catch (error) {
        console.error(error.message);
        return appointmentStatusService.sendTransitionError(res, error);
    }
}

// ============ لیست بیماران پزشک ============

async function createPatient(req, res) {
    try {
        const clinicController = require('./clinicController');
        return clinicController.createPatient(req, res);
    } catch (error) {
        console.error('Doctor create patient error:', error);
        return res.status(500).json({ success: false, message: 'خطا در ثبت بیمار' });
    }
}

async function getMyPatients(req, res) {
    try {
        const doctorId = Number(req.doctorId || req.user?.doctor_id || 0);
        if (!doctorId) return res.status(404).json({ success: false, message: 'اطلاعات پزشک یافت نشد' });

        const { search, page = 1, limit = 20 } = req.query;
        const pageNumber = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
        const relationParams = [doctorId, doctorId, doctorId];
        const relationSql = `
            SELECT p.id AS patient_id, u.id AS user_id,
                   COALESCE(NULLIF(u.full_name, ''), NULLIF(p.full_name, ''), NULLIF(p.username, ''), CONCAT('بیمار #', p.id)) AS full_name,
                   COALESCE(NULLIF(u.phone, ''), NULLIF(p.phone, ''), NULLIF(p.mobile, ''), '-') AS phone,
                   COALESCE(NULLIF(u.email, ''), NULLIF(p.email, ''), '') AS email,
                   COUNT(DISTINCT a.id) AS appointment_count,
                   MAX(a.appointment_date) AS last_visit
            FROM patients p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN appointments a ON a.patient_id = p.id AND a.doctor_id = ?
            LEFT JOIN medical_records mr ON mr.patient_id = p.id AND mr.doctor_id = ?
            LEFT JOIN prescriptions pr ON pr.patient_id = p.id AND pr.doctor_id = ?
            WHERE a.id IS NOT NULL OR mr.id IS NOT NULL OR pr.id IS NOT NULL
            GROUP BY p.id, u.id, u.full_name, u.phone, u.email, p.full_name, p.username, p.phone, p.mobile, p.email
        `;
        let listSql = `SELECT * FROM (${relationSql}) doctor_patients`;
        let countSql = `SELECT COUNT(*) AS total FROM (${relationSql}) doctor_patients`;
        const listParams = [...relationParams];
        const countParams = [...relationParams];

        if (search) {
            const term = `%${search}%`;
            const searchSql = ' WHERE full_name LIKE ? OR phone LIKE ? OR email LIKE ?';
            listSql += searchSql;
            countSql += searchSql;
            listParams.push(term, term, term);
            countParams.push(term, term, term);
        }

        listSql += ' ORDER BY last_visit IS NULL, last_visit DESC, full_name ASC LIMIT ? OFFSET ?';
        listParams.push(pageSize, (pageNumber - 1) * pageSize);

        const [patients] = await db.query(listSql, listParams);
        const [totalResult] = await db.query(countSql, countParams);
        res.json({
            success: true,
            patients,
            pagination: {
                current_page: pageNumber,
                per_page: pageSize,
                total: Number(totalResult[0]?.total || 0)
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
        const relationship = await assertClinicalRelationship(doctorId, patientId, null, 'read');
        if (!relationship.allowed) return res.status(403).json({ success: false, message: 'رابطه درمانی معتبر با این بیمار یافت نشد' });
        const [patient] = await db.query(
            `SELECT p.id AS patient_id, u.id AS user_id,
                    COALESCE(NULLIF(u.full_name, ''), NULLIF(p.full_name, ''), NULLIF(p.username, ''), CONCAT('بیمار #', p.id)) AS full_name,
                    COALESCE(NULLIF(u.phone, ''), NULLIF(p.phone, ''), NULLIF(p.mobile, ''), '-') AS phone,
                    COALESCE(NULLIF(u.email, ''), NULLIF(p.email, ''), '') AS email,
                    p.birth_date, p.gender, p.allergies, p.medications, p.chronic_diseases, p.medical_history, p.notes
             FROM patients p
             LEFT JOIN users u ON p.user_id = u.id
             WHERE p.id = ?`,
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
        await auditMedicalAccess(req, { patientId: Number(patientId), action: 'read' });
        await auditBreakGlassIfUsed(req, relationship, patientId);
        res.json({ success: true, patient: patient[0], medical_records: records });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در دریافت پرونده پزشکی' });
    }
}

// ============ افزودن پرونده پزشکی ============
async function addMedicalRecord(req, res) {
    let connection;
    try {
        const {
            patient_id, appointment_id, diagnosis, symptoms, notes, findings, treatment_plan,
            visual_acuity_od, visual_acuity_os, refraction_od_sph, refraction_od_cyl,
            refraction_od_axis, refraction_os_sph, refraction_os_cyl, refraction_os_axis,
            add_power, iop_od, iop_os, iop_method, iop_measured_at, follow_up_at
        } = req.body;
        const doctorId = req.doctorId;
        const patientId = Number(patient_id);
        const appointmentId = appointment_id ? Number(appointment_id) : null;
        if (!patientId || !String(diagnosis || '').trim()) {
            return res.status(400).json({ success: false, message: 'بیمار و تشخیص الزامی است' });
        }

        const relationship = await assertClinicalRelationship(doctorId, patientId, appointmentId, 'write');
        if (!relationship.allowed) return res.status(403).json({ success: false, message: 'بیمار یا نوبت متعلق به این پزشک نیست' });

        const pool = await db.getPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.query(
            `INSERT INTO medical_records (
                patient_id, doctor_id, appointment_id, record_date, diagnosis, symptoms, notes,
                findings, treatment_plan, visual_acuity_od, visual_acuity_os,
                refraction_od_sph, refraction_od_cyl, refraction_od_axis,
                refraction_os_sph, refraction_os_cyl, refraction_os_axis, add_power,
                iop_od, iop_os, iop_method, iop_measured_at, follow_up_at,
                record_status, signed_at, signed_by
             ) VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'signed', NOW(), ?)`,
            [patientId, doctorId, appointmentId, String(diagnosis).trim(), symptoms || '', notes || '',
             findings || '', treatment_plan || '', visual_acuity_od || null, visual_acuity_os || null,
             refraction_od_sph || null, refraction_od_cyl || null, refraction_od_axis || null,
             refraction_os_sph || null, refraction_os_cyl || null, refraction_os_axis || null, add_power || null,
             iop_od || null, iop_os || null, iop_method || null, iop_measured_at || null, follow_up_at || null,
             req.user.id]
        );
        if (appointmentId) {
            await appointmentStatusService.transitionWithConnection(connection, {
                appointmentId,
                targetStatus: 'completed',
                expectedDoctorId: doctorId,
                expectedPatientId: patientId,
                reason: 'امضای پرونده پزشکی و تکمیل ویزیت',
                actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
            });
        }
        await auditMedicalAccess(req, { patientId, recordId: result.insertId, action: 'sign' }, connection);
        await auditBreakGlassIfUsed(req, relationship, patientId, result.insertId, connection);
        await connection.commit();
        res.status(201).json({ success: true, message: 'پرونده پزشکی امضا و ثبت شد', record_id: result.insertId });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, code: error.code, message: status < 500 ? error.message : 'خطا در ثبت پرونده؛ migration بالینی را بررسی کنید' });
    } finally {
        if (connection) connection.release();
    }
}


async function amendMedicalRecord(req, res) {
    let connection;
    try {
        const recordId = Number(req.params.id);
        const reason = String(req.body.reason || '').trim();
        const patch = req.body.patch;
        if (!recordId || !reason || !patch || typeof patch !== 'object' || Array.isArray(patch)) {
            return res.status(400).json({ success: false, message: 'شناسه، دلیل و اصلاحات ساختاریافته الزامی است' });
        }
        const allowed = new Set([
            'diagnosis','symptoms','notes','findings','treatment_plan','follow_up_at',
            'visual_acuity_od','visual_acuity_os','refraction_od_sph','refraction_od_cyl','refraction_od_axis',
            'refraction_os_sph','refraction_os_cyl','refraction_os_axis','add_power',
            'iop_od','iop_os','iop_method','iop_measured_at'
        ]);
        const sanitized = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.has(key)));
        if (!Object.keys(sanitized).length) return res.status(400).json({ success: false, message: 'فیلد قابل اصلاحی ارسال نشده است' });

        const pool = await db.getPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query(
            `SELECT * FROM medical_records WHERE id = ? AND doctor_id = ? LIMIT 1 FOR UPDATE`,
            [recordId, req.doctorId]
        );
        const record = rows[0];
        if (!record) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'پرونده یافت نشد یا متعلق به این پزشک نیست' });
        }
        if (!['signed','amended','locked'].includes(String(record.record_status || ''))) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'فقط پرونده امضاشده قابل اصلاح نسخه‌دار است' });
        }

        const previousHash = crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
        const [result] = await connection.query(
            `INSERT INTO medical_record_amendments
             (medical_record_id, author_user_id, reason, patch_json, previous_hash)
             VALUES (?, ?, ?, ?, ?)`,
            [recordId, req.user.id, reason.slice(0, 500), JSON.stringify(sanitized), previousHash]
        );
        await connection.query("UPDATE medical_records SET record_status = 'amended' WHERE id = ?", [recordId]);
        await connection.commit();
        connection.release();
        connection = null;
        await auditMedicalAccess(req, { patientId: record.patient_id, recordId, action: 'amend', reason });
        return res.status(201).json({ success: true, message: 'اصلاحیه نسخه‌دار ثبت شد', amendment_id: result.insertId });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (connection) connection.release();
        console.error(error);
        return res.status(500).json({ success: false, message: 'خطا در ثبت اصلاحیه' });
    }
}

// ============ لیست پرونده‌های پزشکی پزشک ============
async function getMedicalRecords(req, res) {
    try {
        const doctorId = req.doctorId;
        const { patient_id, page = 1, limit = 20 } = req.query;
        let query = `
            SELECT mr.*,
                   COALESCE(NULLIF(u.full_name, ''), NULLIF(p.full_name, ''), NULLIF(p.username, ''), CONCAT('بیمار #', p.id)) AS patient_name,
                   DATE_FORMAT(mr.record_date, '%Y-%m-%d') as record_date
            FROM medical_records mr
            LEFT JOIN patients p ON mr.patient_id = p.id
            LEFT JOIN users u ON p.user_id = u.id
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
    let connection;
    try {
        const { patient_id, appointment_id, diagnosis, items, instructions, valid_until, allergy_review_acknowledged } = req.body;
        const doctorId = req.doctorId;
        const patientId = Number(patient_id);
        const appointmentId = appointment_id ? Number(appointment_id) : null;
        if (!patientId || !Array.isArray(items) || !items.length) {
            return res.status(400).json({ success: false, message: 'بیمار و اقلام ساختاریافته نسخه الزامی است' });
        }
        if (allergy_review_acknowledged !== true) {
            return res.status(400).json({ success: false, message: 'مشاهده حساسیت‌ها و داروهای جاری باید تأیید شود' });
        }
        const relationship = await assertClinicalRelationship(doctorId, patientId, appointmentId, 'write');
        if (!relationship.allowed) return res.status(403).json({ success: false, message: 'بیمار یا نوبت متعلق به این پزشک نیست' });

        for (const item of items) {
            if (!String(item.drug_name || '').trim() || !String(item.dose || '').trim() || !String(item.frequency || '').trim()) {
                return res.status(400).json({ success: false, message: 'نام دارو، مقدار و دفعات مصرف برای همه اقلام الزامی است' });
            }
        }

        connection = await db.beginTransaction();
        const [result] = await connection.query(
            `INSERT INTO prescriptions (patient_id, doctor_id, appointment_id, diagnosis, medicines, instructions, valid_until)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [patientId, doctorId, appointmentId, diagnosis || '', JSON.stringify(items), instructions || '', valid_until || null]
        );
        for (const item of items) {
            await connection.query(
                `INSERT INTO prescription_items
                 (prescription_id, drug_name, dosage_form, dose, route, frequency, duration, quantity, instructions)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [result.insertId, String(item.drug_name).trim(), item.dosage_form || null, String(item.dose).trim(),
                 item.route || null, String(item.frequency).trim(), item.duration || null, item.quantity || null, item.instructions || null]
            );
        }
        await connection.commit();
        connection.release();
        connection = null;
        await auditMedicalAccess(req, { patientId, action: 'create', reason: 'prescription' });
        await auditBreakGlassIfUsed(req, relationship, patientId);
        res.status(201).json({ success: true, message: 'نسخه ساختاریافته ثبت شد', prescription_id: result.insertId });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (connection) connection.release();
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
            SELECT p.*,
                   COALESCE(NULLIF(u.full_name, ''), NULLIF(pt.full_name, ''), NULLIF(pt.username, ''), CONCAT('بیمار #', pt.id)) AS patient_name,
                   DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i') as created_at
            FROM prescriptions p
            LEFT JOIN patients pt ON p.patient_id = pt.id
            LEFT JOIN users u ON pt.user_id = u.id
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
        const doctorId = Number(req.doctorId || req.user?.doctor_id || 0);
        if (!doctorId) return res.status(404).json({ success: false, message: 'اطلاعات پزشک یافت نشد' });
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
    let connection;
    try {
        const doctorId = Number(req.doctorId || req.user?.doctor_id || 0);
        if (!doctorId) return res.status(404).json({ success: false, message: 'اطلاعات پزشک یافت نشد' });
        const { schedules } = req.body;
        if (!Array.isArray(schedules)) {
            return res.status(400).json({ success: false, message: 'اطلاعات برنامه کاری نامعتبر است' });
        }

        const seenDays = new Set();
        const normalized = [];
        for (const row of schedules) {
            const day = Number.parseInt(toEnglishDigits(row?.day_of_week), 10);
            if (!Number.isInteger(day) || day < 0 || day > 6) {
                return res.status(400).json({ success: false, message: 'روز انتخاب‌شده در برنامه کاری معتبر نیست' });
            }
            if (seenDays.has(day)) continue;
            seenDays.add(day);
            const isWorking = normalizeBoolean(row?.is_working);
            const startTime = normalizeTime(row?.start_time, '08:00');
            const endTime = normalizeTime(row?.end_time, '14:00');
            if (isWorking && timeToMinutes(startTime) >= timeToMinutes(endTime)) {
                return res.status(400).json({ success: false, message: 'ساعت پایان باید بعد از ساعت شروع باشد' });
            }
            normalized.push({ day_of_week: day, start_time: startTime, end_time: endTime, is_working: isWorking ? 1 : 0 });
        }

        connection = await db.beginTransaction();
        await connection.query('DELETE FROM schedules WHERE doctor_id = ?', [doctorId]);
        for (const s of normalized) {
            await connection.query(
                `INSERT INTO schedules (doctor_id, day_of_week, start_time, end_time, is_working)
                 VALUES (?, ?, ?, ?, ?)`,
                [doctorId, s.day_of_week, s.start_time, s.end_time, s.is_working]
            );
        }
        await connection.commit();
        connection.release();
        connection = null;
        res.json({ success: true, message: 'برنامه کاری با موفقیت ذخیره شد', schedules: normalized });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (connection) connection.release();
        console.error(error);
        res.status(500).json({ success: false, message: 'خطا در ذخیره برنامه کاری' });
    }
}

// ============ پروفایل پزشک ============
async function getProfile(req, res) {
    try {
        const userId = req.user.id;
        const [doctor] = await db.query(
            `SELECT u.id, u.username,
                    COALESCE(NULLIF(d.full_name, ''), NULLIF(u.full_name, ''), u.username) AS full_name,
                    COALESCE(NULLIF(d.email, ''), NULLIF(u.email, '')) AS email,
                    COALESCE(NULLIF(d.phone, ''), NULLIF(d.mobile, ''), NULLIF(u.phone, '')) AS phone,
                    u.is_active,
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
    let connection;
    try {
        const userId = req.user.id;
        const doctorId = Number(req.doctorId || req.user?.doctor_id || 0);
        if (!doctorId) return res.status(404).json({ success: false, message: 'اطلاعات پزشک یافت نشد' });

        const fullName = String(req.body.full_name || '').trim();
        const phone = cleanPhone(req.body.phone || '');
        const email = String(req.body.email || '').trim();
        const specialty = String(req.body.specialty || '').trim() || 'چشم‌پزشکی';
        const licenseNumber = String(req.body.license_number || '').trim();
        const experienceYears = Math.max(0, Math.min(80, Number.parseInt(toEnglishDigits(req.body.experience_years || 0), 10) || 0));
        const bio = String(req.body.bio || '').trim();
        const consultationFee = cleanMoney(req.body.consultation_fee);

        if (!fullName) return res.status(400).json({ success: false, message: 'نام و نام خانوادگی پزشک الزامی است' });
        if (!phone) return res.status(400).json({ success: false, message: 'شماره تماس پزشک الزامی است' });
        if (!/^(?:0?9\d{9}|0\d{2,3}\d{7,8})$/.test(phone)) {
            return res.status(400).json({ success: false, message: 'شماره تماس پزشک معتبر نیست' });
        }
        if (!isValidEmail(email)) return res.status(400).json({ success: false, message: 'رایانامه پزشک معتبر نیست' });
        if (consultationFee < 0) return res.status(400).json({ success: false, message: 'هزینه ویزیت نمی‌تواند منفی باشد' });

        connection = await db.beginTransaction();
        await connection.query(
            'UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?',
            [fullName, email || null, phone, userId]
        );
        const [result] = await connection.query(
            `UPDATE doctors SET full_name = ?, phone = ?, mobile = ?, email = ?, specialty = ?, license_number = ?,
                    experience_years = ?, bio = ?, consultation_fee = ?
             WHERE id = ? AND user_id = ?`,
            [fullName, phone, phone, email || null, specialty, licenseNumber || '', experienceYears, bio || null, consultationFee, doctorId, userId]
        );
        if (!result.affectedRows) {
            const error = new Error('اطلاعات پزشک یافت نشد');
            error.statusCode = 404;
            throw error;
        }
        await connection.commit();
        connection.release();
        connection = null;
        res.json({
            success: true,
            message: 'اطلاعات پروفایل با موفقیت ذخیره شد',
            doctor: { full_name: fullName, phone, email, specialty, license_number: licenseNumber, experience_years: experienceYears, bio, consultation_fee: consultationFee }
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (connection) connection.release();
        console.error(error);
        res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'خطا در ذخیره اطلاعات پروفایل' });
    }
}

module.exports = {
    getDashboardStats,
    getTodayAppointments,
    getMyAppointments,
    updateAppointmentStatus,
    getMyPatients,
    createPatient,
    getPatientMedicalRecord,
    addMedicalRecord,
    amendMedicalRecord,
    getMedicalRecords,
    addPrescription,
    getMyPrescriptions,
    getSchedule,
    updateSchedule,
    getProfile,
    updateProfile
};