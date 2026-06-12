// src/routes/appointmentArchitecture.js
// NOORVISTA - Appointment architecture v2
// پزشک + مرکز درمانی + خدمت + زمان + ظرفیت
const express = require('express');
const db = require('../config/db');
const { protect, restrictTo, optionalAuth } = require('../middleware/auth');
const appointmentConfirmationSms = require('../services/appointmentConfirmationSms');

const router = express.Router();

const managerOnly = [protect, restrictTo('system_admin', 'admin', 'clinic_admin', 'clinic_manager', 'manager')];

const DIGIT_MAP = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

function toEnglishDigits(value) {
    return String(value ?? '').replace(/[۰-۹٠-٩]/g, ch => DIGIT_MAP[ch] || ch);
}

function toPositiveInt(value, fallback = null) {
    const normalized = toEnglishDigits(value).replace(/[,\s]/g, '').trim();
    if (!normalized) return fallback;
    const number = Number(normalized);
    if (!Number.isFinite(number)) return fallback;
    return Math.floor(number);
}

function toBool(value, defaultValue = true) {
    if (value === undefined || value === null || value === '') return defaultValue ? 1 : 0;
    if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on' || value === 'yes') return 1;
    if (value === false || value === 0 || value === '0' || value === 'false' || value === 'off' || value === 'no') return 0;
    return value ? 1 : 0;
}

function cleanText(value, max = 500) {
    const text = String(value || '').trim();
    return text.length > max ? text.slice(0, max) : text;
}

function normalizeTime(value) {
    let raw = toEnglishDigits(value || '').trim();
    raw = raw.replace(/\s+/g, ' ').toUpperCase();

    const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (ampm) {
        let hour = Number(ampm[1]);
        const minute = Number(ampm[2]);
        if (hour < 1 || hour > 12 || minute > 59) return null;
        if (ampm[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    }

    const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}


function timeToMinutes(value) {
    const t = normalizeTime(value);
    if (!t) return NaN;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function normalizeDate(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function formatDate(date) {
    if (date instanceof Date) {
        return date.toISOString().slice(0, 10);
    }
    return String(date || '').slice(0, 10);
}

function addDays(dateString, days) {
    const d = new Date(`${dateString}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function weekdayFromDate(dateString) {
    // JS: Sun=0 ... Sat=6 ; project uses 0=Saturday, 1=Sunday, ...
    const d = new Date(`${dateString}T00:00:00Z`);
    return (d.getUTCDay() + 1) % 7;
}

function timePlusMinutes(time, minutes) {
    const total = timeToMinutes(time) + Number(minutes || 0);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function trimTime(value) {
    return String(value || '').slice(0, 5);
}

function makeSlug(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^\u0600-\u06FFa-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || `service-${Date.now()}`;
}

function trackingCode() {
    return 'NV-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);
}

async function columns(connection, tableName) {
    const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
    return new Set(rows.map(r => r.Field));
}

async function addColumnIfMissing(connection, tableName, columnName, definition) {
    const col = await columns(connection, tableName);
    if (!col.has(columnName)) {
        await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
    }
}

async function addIndexIfMissing(connection, tableName, indexName, definition) {
    const [rows] = await connection.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [tableName, indexName]
    );
    if (!rows.length) {
        await connection.query(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
    }
}

async function dropIndexIfExists(connection, tableName, indexName) {
    const [rows] = await connection.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [tableName, indexName]
    );
    if (rows.length) {
        await connection.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
    }
}

async function insertDynamic(connection, table, data) {
    const col = await columns(connection, table);
    const entries = Object.entries(data).filter(([key, value]) => col.has(key) && value !== undefined);
    if (!entries.length) throw new Error(`No insertable columns for ${table}`);
    const sql = `INSERT INTO \`${table}\` SET ` + entries.map(([key]) => `\`${key}\` = ?`).join(', ');
    const [result] = await connection.query(sql, entries.map(([, value]) => value));
    return result;
}

async function updateDynamic(connection, table, data, whereSql, whereParams) {
    const col = await columns(connection, table);
    const entries = Object.entries(data).filter(([key, value]) => col.has(key) && value !== undefined);
    if (!entries.length) return;
    const sql = `UPDATE \`${table}\` SET ` + entries.map(([key]) => `\`${key}\` = ?`).join(', ') + ` ${whereSql}`;
    await connection.query(sql, [...entries.map(([, value]) => value), ...whereParams]);
}

async function ensureAppointmentArchitecture(connection) {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS medical_centers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            type ENUM('clinic','hospital','treatment_center','surgery_center','other') NOT NULL DEFAULT 'clinic',
            province VARCHAR(100) NULL,
            city VARCHAR(100) NULL,
            address TEXT NULL,
            phone VARCHAR(50) NULL,
            latitude DECIMAL(10,7) NULL,
            longitude DECIMAL(10,7) NULL,
            description TEXT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_medical_centers_active (is_active),
            INDEX idx_medical_centers_city (city)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS services (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            slug VARCHAR(200) NOT NULL UNIQUE,
            category VARCHAR(100) NULL,
            description TEXT NULL,
            default_capacity INT NOT NULL DEFAULT 1,
            default_duration_minutes INT NOT NULL DEFAULT 30,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_services_active (is_active),
            INDEX idx_services_category (category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);


    // اگر جدول services قبلاً در پروژه وجود داشته باشد، CREATE TABLE ستون‌های جدید را اضافه نمی‌کند.
    // بنابراین ستون‌های معماری جدید را بدون حذف اطلاعات قبلی اضافه و مقداردهی می‌کنیم.
    await addColumnIfMissing(connection, 'services', 'slug', '`slug` VARCHAR(200) NULL AFTER `name`');
    await addColumnIfMissing(connection, 'services', 'category', '`category` VARCHAR(100) NULL AFTER `slug`');
    await addColumnIfMissing(connection, 'services', 'description', '`description` TEXT NULL AFTER `category`');
    await addColumnIfMissing(connection, 'services', 'default_capacity', '`default_capacity` INT NOT NULL DEFAULT 1 AFTER `description`');
    await addColumnIfMissing(connection, 'services', 'default_duration_minutes', '`default_duration_minutes` INT NOT NULL DEFAULT 30 AFTER `default_capacity`');
    await addColumnIfMissing(connection, 'services', 'is_active', '`is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `default_duration_minutes`');
    await addColumnIfMissing(connection, 'services', 'created_at', '`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await addColumnIfMissing(connection, 'services', 'updated_at', '`updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    // رفع مقدارهای خالی جدول قدیمی services قبل از seed و قبل از unique index
    await connection.query('UPDATE services SET default_capacity = 1 WHERE default_capacity IS NULL OR default_capacity < 1');
    await connection.query('UPDATE services SET default_duration_minutes = 30 WHERE default_duration_minutes IS NULL OR default_duration_minutes < 1');
    await connection.query('UPDATE services SET is_active = 1 WHERE is_active IS NULL');

    const [existingServicesForSlug] = await connection.query('SELECT id, name, slug FROM services ORDER BY id ASC');
    const usedServiceSlugs = new Set();
    for (const serviceRow of existingServicesForSlug) {
        let desiredSlug = cleanText(serviceRow.slug || '', 200) || `${makeSlug(serviceRow.name)}-${serviceRow.id}`;
        desiredSlug = makeSlug(desiredSlug);
        if (usedServiceSlugs.has(desiredSlug)) desiredSlug = `${desiredSlug}-${serviceRow.id}`;
        usedServiceSlugs.add(desiredSlug);
        if (serviceRow.slug !== desiredSlug) {
            await connection.query('UPDATE services SET slug = ? WHERE id = ?', [desiredSlug, serviceRow.id]);
        }
    }

    await addIndexIfMissing(connection, 'services', 'uk_services_slug', 'UNIQUE KEY `uk_services_slug` (`slug`)');
    await addIndexIfMissing(connection, 'services', 'idx_services_active', 'INDEX `idx_services_active` (`is_active`)');
    await addIndexIfMissing(connection, 'services', 'idx_services_category', 'INDEX `idx_services_category` (`category`)');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS doctor_medical_centers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            doctor_id INT NOT NULL,
            medical_center_id INT NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_doctor_center (doctor_id, medical_center_id),
            INDEX idx_dmc_doctor (doctor_id),
            INDEX idx_dmc_center (medical_center_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);

    // Existing project already has doctor_schedules. Extend it instead of replacing it.
    await connection.query(`
        CREATE TABLE IF NOT EXISTS doctor_schedules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            doctor_id INT NOT NULL,
            day_of_week TINYINT NOT NULL,
            start_time TIME NOT NULL DEFAULT '09:00:00',
            end_time TIME NOT NULL DEFAULT '17:00:00',
            slot_duration INT NOT NULL DEFAULT 30,
            break_between INT NOT NULL DEFAULT 5,
            booking_window_days INT NOT NULL DEFAULT 30,
            reminder_enabled TINYINT(1) NOT NULL DEFAULT 1,
            reminder_before_minutes INT NOT NULL DEFAULT 1440,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_doctor_day (doctor_id, day_of_week)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);

    await dropIndexIfExists(connection, 'doctor_schedules', 'uk_doctor_day');
    await addColumnIfMissing(connection, 'doctor_schedules', 'medical_center_id', '`medical_center_id` INT NULL AFTER `doctor_id`');
    await addColumnIfMissing(connection, 'doctor_schedules', 'service_id', '`service_id` INT NULL AFTER `medical_center_id`');
    await addColumnIfMissing(connection, 'doctor_schedules', 'slot_duration_minutes', '`slot_duration_minutes` INT NULL AFTER `end_time`');
    await addColumnIfMissing(connection, 'doctor_schedules', 'capacity_per_slot', '`capacity_per_slot` INT NOT NULL DEFAULT 1 AFTER `slot_duration_minutes`');
    await addColumnIfMissing(connection, 'doctor_schedules', 'start_date', '`start_date` DATE NULL AFTER `capacity_per_slot`');
    await addColumnIfMissing(connection, 'doctor_schedules', 'end_date', '`end_date` DATE NULL AFTER `start_date`');
    await addColumnIfMissing(connection, 'doctor_schedules', 'is_recurring', '`is_recurring` TINYINT(1) NOT NULL DEFAULT 1 AFTER `end_date`');
    await addIndexIfMissing(connection, 'doctor_schedules', 'idx_schedule_center_service', 'INDEX `idx_schedule_center_service` (`medical_center_id`, `service_id`)');
    await addIndexIfMissing(connection, 'doctor_schedules', 'idx_schedule_dates', 'INDEX `idx_schedule_dates` (`start_date`, `end_date`)');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS appointment_slots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            doctor_schedule_id INT NOT NULL,
            doctor_id INT NOT NULL,
            medical_center_id INT NOT NULL,
            service_id INT NOT NULL,
            slot_date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            capacity INT NOT NULL DEFAULT 1,
            booked_count INT NOT NULL DEFAULT 0,
            remaining_capacity INT NOT NULL DEFAULT 1,
            status ENUM('available','full','disabled','cancelled') NOT NULL DEFAULT 'available',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_slot_unique (doctor_schedule_id, slot_date, start_time),
            INDEX idx_slots_lookup (service_id, doctor_id, medical_center_id, slot_date),
            INDEX idx_slots_status (status, slot_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);


    // وضعیت هر جایگاه ظرفیت داخل یک ساعت. appointment_slots همچنان رکورد مادر ساعت است،
    // اما هر ردیف ظرفیت می‌تواند مستقل فعال/غیرفعال/حذف شود.
    await ensureSlotPositionStateTable(connection);

    // Existing appointment table must remain compatible.
    await addColumnIfMissing(connection, 'appointments', 'appointment_slot_id', '`appointment_slot_id` INT NULL AFTER `patient_id`');
    await addColumnIfMissing(connection, 'appointments', 'medical_center_id', '`medical_center_id` INT NULL AFTER `doctor_id`');
    await addColumnIfMissing(connection, 'appointments', 'service_id', '`service_id` INT NULL AFTER `medical_center_id`');
    await addColumnIfMissing(connection, 'appointments', 'tracking_code', '`tracking_code` VARCHAR(50) NULL AFTER `status`');

    // Queue/order number for every appointment slot.
    // شماره ترتیب روزانه است؛ ظرفیت اسلات‌های قبلی همان روز هم در ترتیب حساب می‌شوند.
    await addColumnIfMissing(connection, 'appointments', 'appointment_queue_number', '`appointment_queue_number` INT NULL AFTER `appointment_slot_id`');
    await addColumnIfMissing(connection, 'appointments', 'confirmed_at', '`confirmed_at` DATETIME NULL AFTER `tracking_code`');
    await addColumnIfMissing(connection, 'appointments', 'confirmation_sms_sent_at', '`confirmation_sms_sent_at` DATETIME NULL AFTER `confirmed_at`');
    await addColumnIfMissing(connection, 'appointments', 'confirmation_sms_status', '`confirmation_sms_status` VARCHAR(30) NULL AFTER `confirmation_sms_sent_at`');
    await addColumnIfMissing(connection, 'appointments', 'confirmation_sms_error', '`confirmation_sms_error` TEXT NULL AFTER `confirmation_sms_status`');

    await addIndexIfMissing(connection, 'appointments', 'idx_appointment_slot', 'INDEX `idx_appointment_slot` (`appointment_slot_id`)');
    await addIndexIfMissing(connection, 'appointments', 'idx_appointment_tracking', 'INDEX `idx_appointment_tracking` (`tracking_code`)');
    await addIndexIfMissing(connection, 'appointments', 'idx_appointment_queue_number', 'INDEX `idx_appointment_queue_number` (`appointment_slot_id`, `appointment_queue_number`)');

    // Seed defaults only if empty.
    const [[centerCount]] = await connection.query('SELECT COUNT(*) AS count FROM medical_centers');
    if (!centerCount.count) {
        await connection.query(
            `INSERT INTO medical_centers (name, type, province, city, address, phone, description, is_active)
             VALUES
             ('کلینیک شماره ۱', 'clinic', 'تهران', 'تهران', 'تهران، قیطریه', '09221971397', 'مرکز پیش‌فرض نوبت‌دهی کلینیک', 1),
             ('مرکز جراحی چشم', 'surgery_center', 'تهران', 'تهران', 'تهران', '09221971397', 'مرکز جراحی و خدمات تخصصی چشم', 1)`
        );
    }

    const [[serviceCount]] = await connection.query('SELECT COUNT(*) AS count FROM services');
    if (!serviceCount.count) {
        await connection.query(
            `INSERT INTO services (name, slug, category, description, default_capacity, default_duration_minutes, is_active)
             VALUES
             ('معاینه تخصصی چشم', 'eye-exam', 'diagnostic', 'معاینه تخصصی چشم و بررسی وضعیت بینایی', 20, 15, 1),
             ('لیزیک و اصلاح عیوب انکساری', 'laser-vision-correction', 'laser', 'بررسی و نوبت‌دهی خدمات لیزر چشم', 50, 10, 1),
             ('عمل آب مروارید', 'cataract-surgery', 'surgery', 'نوبت‌دهی جراحی آب مروارید', 1, 30, 1),
             ('تزریق داخل چشمی', 'intravitreal-injection', 'treatment', 'خدمات تزریق داخل چشمی', 10, 10, 1),
             ('مشاوره بعد از عمل', 'post-op-consultation', 'followup', 'پیگیری و مراقبت بعد از عمل', 15, 10, 1)`
        );
    }
}

async function ensureAndGetPool() {
    const pool = await db.getPool();
    await ensureAppointmentArchitecture(pool);
    return pool;
}

async function assertActiveDoctor(connection, doctorId) {
    const [rows] = await connection.query('SELECT id, COALESCE(is_active, 1) AS is_active FROM doctors WHERE id = ? LIMIT 1', [doctorId]);
    if (!rows.length || !Number(rows[0].is_active)) {
        const err = new Error('پزشک فعال یافت نشد');
        err.status = 400;
        throw err;
    }
}

async function assertActiveCenter(connection, centerId) {
    const [rows] = await connection.query('SELECT id, is_active FROM medical_centers WHERE id = ? LIMIT 1', [centerId]);
    if (!rows.length || !Number(rows[0].is_active)) {
        const err = new Error('مرکز درمانی فعال یافت نشد');
        err.status = 400;
        throw err;
    }
}

async function assertActiveService(connection, serviceId) {
    const [rows] = await connection.query('SELECT id, is_active, default_capacity, default_duration_minutes FROM services WHERE id = ? LIMIT 1', [serviceId]);
    if (!rows.length || !Number(rows[0].is_active)) {
        const err = new Error('خدمت فعال یافت نشد');
        err.status = 400;
        throw err;
    }
    return rows[0];
}

async function assertDoctorCenter(connection, doctorId, centerId) {
    const [rows] = await connection.query(
        'SELECT id FROM doctor_medical_centers WHERE doctor_id = ? AND medical_center_id = ? AND is_active = 1 LIMIT 1',
        [doctorId, centerId]
    );
    if (!rows.length) {
        const err = new Error('پزشک با مرکز درمانی انتخاب‌شده مرتبط نیست');
        err.status = 400;
        throw err;
    }
}

async function validateSchedulePayload(connection, body, currentId = null) {
    const doctorId = Number(body.doctor_id);
    const centerId = Number(body.medical_center_id);
    const serviceId = Number(body.service_id);
    const requestedDayOfWeek = Number(body.day_of_week);
    const startTime = normalizeTime(body.start_time);
    const endTime = normalizeTime(body.end_time);
    const slotDuration = toPositiveInt(body.slot_duration_minutes || body.slot_duration, 30);
    const capacity = toPositiveInt(body.capacity_per_slot || body.capacity, 1);
    const startDate = normalizeDate(body.start_date) || new Date().toISOString().slice(0, 10);
    const isRecurring = toBool(body.is_recurring, true);
    const rawEndDate = normalizeDate(body.end_date);
    const endDate = rawEndDate || (isRecurring ? null : startDate);
    const dayOfWeek = isRecurring ? requestedDayOfWeek : weekdayFromDate(startDate);
    const isActive = toBool(body.is_active, true);

    if (!doctorId || !centerId || !serviceId) {
        const err = new Error('انتخاب پزشک، مرکز درمانی و خدمت الزامی است');
        err.status = 400;
        throw err;
    }
    if (isRecurring && (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) {
        const err = new Error('روز هفته نامعتبر است');
        err.status = 400;
        throw err;
    }
    if (!startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        const err = new Error('ساعت پایان باید بعد از ساعت شروع باشد');
        err.status = 400;
        throw err;
    }
    if (!Number.isFinite(slotDuration) || slotDuration <= 0) {
        const err = new Error('مدت هر نوبت باید عدد مثبت باشد');
        err.status = 400;
        throw err;
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
        const err = new Error('ظرفیت هر نوبت باید عدد مثبت باشد');
        err.status = 400;
        throw err;
    }
    if (isRecurring && !rawEndDate) {
        const err = new Error('برای برنامه تکرارشونده، تاریخ پایان الزامی است');
        err.status = 400;
        throw err;
    }
    if (endDate && endDate < startDate) {
        const err = new Error('تاریخ پایان باید بعد از تاریخ شروع باشد');
        err.status = 400;
        throw err;
    }

    await assertActiveDoctor(connection, doctorId);
    await assertActiveCenter(connection, centerId);
    await assertActiveService(connection, serviceId);
    await assertDoctorCenter(connection, doctorId, centerId);

    const params = [doctorId, centerId, serviceId, dayOfWeek, endDate, startDate, startTime, endTime];
    let idSql = '';
    if (currentId) {
        idSql = ' AND id <> ?';
        params.push(currentId);
    }
    const [overlap] = await connection.query(
        `SELECT id FROM doctor_schedules
         WHERE doctor_id = ?
           AND medical_center_id = ?
           AND service_id = ?
           AND day_of_week = ?
           AND COALESCE(is_active, 1) = 1
           AND NOT (COALESCE(end_date, '2999-12-31') < ? OR COALESCE(start_date, '1970-01-01') > ?)
           AND start_time < ? AND end_time > ?
           ${idSql}
         LIMIT 1`,
        params
    );
    if (overlap.length) {
        const err = new Error('برای این پزشک، مرکز و خدمت در بازه زمانی انتخاب‌شده برنامه تداخل‌دار وجود دارد');
        err.status = 409;
        throw err;
    }

    return {
        doctor_id: doctorId,
        medical_center_id: centerId,
        service_id: serviceId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: Math.floor(slotDuration),
        slot_duration: Math.floor(slotDuration), // compatibility with old column
        capacity_per_slot: Math.floor(capacity),
        start_date: startDate,
        end_date: endDate,
        is_recurring: isRecurring,
        is_active: isActive
    };
}

async function generateSlotsForSchedule(connection, scheduleId) {
    const [rows] = await connection.query('SELECT * FROM doctor_schedules WHERE id = ? LIMIT 1', [scheduleId]);
    const schedule = rows[0];
    if (!schedule || !Number(schedule.is_active) || !schedule.medical_center_id || !schedule.service_id) return 0;

    const startDate = formatDate(schedule.start_date || new Date());
    const duration = toPositiveInt(schedule.slot_duration_minutes || schedule.slot_duration, 30);
    const capacity = toPositiveInt(schedule.capacity_per_slot, 1);
    const startTime = normalizeTime(schedule.start_time);
    const endTime = normalizeTime(schedule.end_time);
    const day = Number(schedule.day_of_week);
    const recurring = Number(schedule.is_recurring) === 1;

    if (!startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        const err = new Error('ساعت شروع و پایان زمان‌بندی نامعتبر است');
        err.status = 400;
        throw err;
    }
    if (!duration || duration <= 0) {
        const err = new Error('مدت هر نوبت نامعتبر است');
        err.status = 400;
        throw err;
    }
    if (!capacity || capacity <= 0) {
        const err = new Error('ظرفیت هر نوبت نامعتبر است');
        err.status = 400;
        throw err;
    }

    // Recurring schedules must have an explicit end_date.
    // No silent 30-day fallback is allowed.
    if (recurring && !schedule.end_date) return 0;

    const endDateRaw = formatDate(schedule.end_date || startDate);
    const maxEnd = addDays(startDate, 365);
    const endDate = endDateRaw > maxEnd ? maxEnd : endDateRaw;

    let created = 0;
    for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
        if (recurring && weekdayFromDate(d) !== day) continue;
        if (!recurring && d !== startDate) continue;

        for (let start = startTime; timeToMinutes(start) + duration <= timeToMinutes(endTime); start = timePlusMinutes(start, duration)) {
            const end = timePlusMinutes(start, duration);

            const [slotOverlap] = await connection.query(
                `SELECT id, doctor_schedule_id
                 FROM appointment_slots
                 WHERE doctor_id = ?
                   AND medical_center_id = ?
                   AND service_id = ?
                   AND slot_date = ?
                   AND doctor_schedule_id <> ?
                   AND COALESCE(status, 'available') NOT IN ('cancelled', 'disabled', 'deleted')
                   AND start_time < ?
                   AND end_time > ?
                 LIMIT 1`,
                [schedule.doctor_id, schedule.medical_center_id, schedule.service_id, d, scheduleId, end, start]
            );

            if (slotOverlap.length) {
                const err = new Error('برای این پزشک، مرکز و خدمت در این ساعت قبلاً نوبت تولید شده است');
                err.status = 409;
                throw err;
            }

            await connection.query(
                `INSERT INTO appointment_slots
                 (doctor_schedule_id, doctor_id, medical_center_id, service_id, slot_date, start_time, end_time, capacity, booked_count, remaining_capacity, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'available')
                 ON DUPLICATE KEY UPDATE
                    doctor_id = VALUES(doctor_id),
                    medical_center_id = VALUES(medical_center_id),
                    service_id = VALUES(service_id),
                    end_time = VALUES(end_time),
                    capacity = IF(booked_count = 0, VALUES(capacity), capacity),
                    remaining_capacity = GREATEST(IF(booked_count = 0, VALUES(capacity), capacity) - booked_count, 0),
                    status = IF(status = 'disabled', 'disabled', IF(GREATEST(IF(booked_count = 0, VALUES(capacity), capacity) - booked_count, 0) > 0, 'available', 'full'))`,
                [scheduleId, schedule.doctor_id, schedule.medical_center_id, schedule.service_id, d, start, end, capacity, capacity]
            );
            created += 1;
        }
    }
    return created;
}

function normalizeCenter(row) {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        province: row.province,
        city: row.city,
        address: row.address,
        phone: row.phone,
        latitude: row.latitude,
        longitude: row.longitude,
        description: row.description,
        is_active: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function normalizeService(row) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        category: row.category,
        description: row.description,
        default_capacity: Number(row.default_capacity || 1),
        default_duration_minutes: Number(row.default_duration_minutes || 30),
        is_active: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function normalizeSchedule(row) {
    return {
        id: row.id,
        doctor_id: row.doctor_id,
        doctor_name: row.doctor_name || row.full_name || null,
        medical_center_id: row.medical_center_id,
        medical_center_name: row.medical_center_name || null,
        service_id: row.service_id,
        service_name: row.service_name || null,
        day_of_week: Number(row.day_of_week),
        start_time: trimTime(row.start_time),
        end_time: trimTime(row.end_time),
        slot_duration_minutes: Number(row.slot_duration_minutes || row.slot_duration || 30),
        capacity_per_slot: Number(row.capacity_per_slot || 1),
        start_date: formatDate(row.start_date || ''),
        end_date: formatDate(row.end_date || ''),
        is_recurring: Boolean(row.is_recurring),
        is_active: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function normalizeSlot(row) {
    return {
        id: row.id,
        doctor_schedule_id: row.doctor_schedule_id,
        doctor_id: row.doctor_id,
        doctor_name: row.doctor_name || null,
        medical_center_id: row.medical_center_id,
        medical_center_name: row.medical_center_name || null,
        service_id: row.service_id,
        service_name: row.service_name || null,
        slot_date: formatDate(row.slot_date),
        start_time: trimTime(row.start_time),
        end_time: trimTime(row.end_time),
        capacity: Number(row.capacity || 0),
        booked_count: Number(row.booked_count || 0),
        remaining_capacity: Number(row.remaining_capacity || 0),
        status: row.status,
        is_available: row.status === 'available' && Number(row.remaining_capacity || 0) > 0
    };
}

function handleError(res, error) {
    console.error('Appointment architecture API:', error);
    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'خطای داخلی سرور'
    });
}

// Medical centers
router.get('/medical-centers', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const includeInactive = ['1', 'true', 'all'].includes(String(req.query.include_inactive || req.query.all || '').toLowerCase());
        const [rows] = await pool.query(
            `SELECT * FROM medical_centers ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY is_active DESC, name ASC`
        );
        res.json({ success: true, centers: rows.map(normalizeCenter), medical_centers: rows.map(normalizeCenter) });
    } catch (error) { handleError(res, error); }
});

router.get('/medical-centers/:id', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const [rows] = await pool.query('SELECT * FROM medical_centers WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'مرکز درمانی یافت نشد' });
        res.json({ success: true, center: normalizeCenter(rows[0]) });
    } catch (error) { handleError(res, error); }
});

router.post('/medical-centers', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const name = cleanText(req.body.name, 200);
        if (!name) return res.status(400).json({ success: false, message: 'نام مرکز درمانی الزامی است' });
        const [result] = await pool.query(
            `INSERT INTO medical_centers (name, type, province, city, address, phone, latitude, longitude, description, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                ['clinic','hospital','treatment_center','surgery_center','other'].includes(req.body.type) ? req.body.type : 'clinic',
                cleanText(req.body.province, 100),
                cleanText(req.body.city, 100),
                cleanText(req.body.address, 2000),
                cleanText(req.body.phone, 50),
                req.body.latitude || null,
                req.body.longitude || null,
                cleanText(req.body.description, 2000),
                toBool(req.body.is_active, true)
            ]
        );
        res.status(201).json({ success: true, id: result.insertId, message: 'مرکز درمانی ثبت شد' });
    } catch (error) { handleError(res, error); }
});

router.patch('/medical-centers/:id', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        await updateDynamic(pool, 'medical_centers', {
            name: req.body.name ? cleanText(req.body.name, 200) : undefined,
            type: ['clinic','hospital','treatment_center','surgery_center','other'].includes(req.body.type) ? req.body.type : undefined,
            province: req.body.province !== undefined ? cleanText(req.body.province, 100) : undefined,
            city: req.body.city !== undefined ? cleanText(req.body.city, 100) : undefined,
            address: req.body.address !== undefined ? cleanText(req.body.address, 2000) : undefined,
            phone: req.body.phone !== undefined ? cleanText(req.body.phone, 50) : undefined,
            latitude: req.body.latitude !== undefined ? req.body.latitude || null : undefined,
            longitude: req.body.longitude !== undefined ? req.body.longitude || null : undefined,
            description: req.body.description !== undefined ? cleanText(req.body.description, 2000) : undefined,
            is_active: req.body.is_active !== undefined ? toBool(req.body.is_active, true) : undefined
        }, 'WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'مرکز درمانی به‌روزرسانی شد' });
    } catch (error) { handleError(res, error); }
});

router.delete('/medical-centers/:id', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        await pool.query('UPDATE medical_centers SET is_active = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'مرکز درمانی غیرفعال شد' });
    } catch (error) { handleError(res, error); }
});

// Services
router.get('/services', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const includeInactive = ['1', 'true', 'all'].includes(String(req.query.include_inactive || req.query.all || '').toLowerCase());
        const [rows] = await pool.query(
            `SELECT * FROM services ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY is_active DESC, category ASC, name ASC`
        );
        res.json({ success: true, services: rows.map(normalizeService) });
    } catch (error) { handleError(res, error); }
});

router.get('/services/:id', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const [rows] = await pool.query('SELECT * FROM services WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'خدمت یافت نشد' });
        res.json({ success: true, service: normalizeService(rows[0]) });
    } catch (error) { handleError(res, error); }
});

router.post('/services', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const name = cleanText(req.body.name, 200);
        if (!name) return res.status(400).json({ success: false, message: 'نام خدمت الزامی است' });
        const capacity = Number(req.body.default_capacity || 1);
        const duration = Number(req.body.default_duration_minutes || 30);
        if (capacity <= 0 || duration <= 0) return res.status(400).json({ success: false, message: 'ظرفیت و مدت خدمت باید مثبت باشند' });
        const slug = makeSlug(req.body.slug || name);
        const [result] = await pool.query(
            `INSERT INTO services (name, slug, category, description, default_capacity, default_duration_minutes, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, slug, cleanText(req.body.category, 100), cleanText(req.body.description, 2000), Math.floor(capacity), Math.floor(duration), toBool(req.body.is_active, true)]
        );
        res.status(201).json({ success: true, id: result.insertId, message: 'خدمت ثبت شد' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') error.message = 'slug این خدمت تکراری است';
        handleError(res, error);
    }
});

router.patch('/services/:id', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        await updateDynamic(pool, 'services', {
            name: req.body.name ? cleanText(req.body.name, 200) : undefined,
            slug: req.body.slug ? makeSlug(req.body.slug) : undefined,
            category: req.body.category !== undefined ? cleanText(req.body.category, 100) : undefined,
            description: req.body.description !== undefined ? cleanText(req.body.description, 2000) : undefined,
            default_capacity: req.body.default_capacity !== undefined ? Math.max(1, Number(req.body.default_capacity || 1)) : undefined,
            default_duration_minutes: req.body.default_duration_minutes !== undefined ? Math.max(1, Number(req.body.default_duration_minutes || 30)) : undefined,
            is_active: req.body.is_active !== undefined ? toBool(req.body.is_active, true) : undefined
        }, 'WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'خدمت به‌روزرسانی شد' });
    } catch (error) { handleError(res, error); }
});

router.delete('/services/:id', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        await pool.query('UPDATE services SET is_active = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'خدمت غیرفعال شد' });
    } catch (error) { handleError(res, error); }
});

// Doctor-centers
router.get('/doctors/:doctorId/medical-centers', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const [rows] = await pool.query(
            `SELECT mc.*, dmc.is_active AS relation_active
             FROM doctor_medical_centers dmc
             JOIN medical_centers mc ON mc.id = dmc.medical_center_id
             WHERE dmc.doctor_id = ? AND dmc.is_active = 1 AND mc.is_active = 1
             ORDER BY mc.name ASC`,
            [req.params.doctorId]
        );
        res.json({ success: true, centers: rows.map(normalizeCenter), medical_centers: rows.map(normalizeCenter) });
    } catch (error) { handleError(res, error); }
});

router.post('/doctors/:doctorId/medical-centers', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const doctorId = Number(req.params.doctorId);
        await assertActiveDoctor(pool, doctorId);
        const ids = Array.isArray(req.body.medical_center_ids) ? req.body.medical_center_ids : [req.body.medical_center_id || req.body.center_id];
        for (const id of ids.map(Number).filter(Boolean)) {
            await assertActiveCenter(pool, id);
            await pool.query(
                `INSERT INTO doctor_medical_centers (doctor_id, medical_center_id, is_active)
                 VALUES (?, ?, 1)
                 ON DUPLICATE KEY UPDATE is_active = 1, updated_at = CURRENT_TIMESTAMP`,
                [doctorId, id]
            );
        }
        res.json({ success: true, message: 'ارتباط پزشک و مرکز درمانی ذخیره شد' });
    } catch (error) { handleError(res, error); }
});

router.delete('/doctors/:doctorId/medical-centers/:centerId', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        await pool.query('UPDATE doctor_medical_centers SET is_active = 0 WHERE doctor_id = ? AND medical_center_id = ?', [req.params.doctorId, req.params.centerId]);
        res.json({ success: true, message: 'ارتباط پزشک و مرکز درمانی غیرفعال شد' });
    } catch (error) { handleError(res, error); }
});

// Schedules
router.get('/doctor-schedules', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const where = [];
        const params = [];
        if (req.query.doctor_id) { where.push('ds.doctor_id = ?'); params.push(req.query.doctor_id); }
        if (req.query.medical_center_id) { where.push('ds.medical_center_id = ?'); params.push(req.query.medical_center_id); }
        if (req.query.service_id) { where.push('ds.service_id = ?'); params.push(req.query.service_id); }
        if (req.query.is_active !== undefined) { where.push('ds.is_active = ?'); params.push(toBool(req.query.is_active, true)); }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(
            `SELECT ds.*,
                    COALESCE(du.full_name, d.full_name, du.username) AS doctor_name,
                    mc.name AS medical_center_name,
                    s.name AS service_name
             FROM doctor_schedules ds
             LEFT JOIN doctors d ON d.id = ds.doctor_id
             LEFT JOIN users du ON du.id = d.user_id
             LEFT JOIN medical_centers mc ON mc.id = ds.medical_center_id
             LEFT JOIN services s ON s.id = ds.service_id
             ${whereSql}
             ORDER BY ds.day_of_week ASC, ds.start_time ASC, ds.id DESC`,
            params
        );
        res.json({ success: true, schedules: rows.map(normalizeSchedule) });
    } catch (error) { handleError(res, error); }
});

router.get('/doctor-schedules/:id', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const [rows] = await pool.query(
            `SELECT ds.*,
                    COALESCE(du.full_name, d.full_name, du.username) AS doctor_name,
                    mc.name AS medical_center_name,
                    s.name AS service_name
             FROM doctor_schedules ds
             LEFT JOIN doctors d ON d.id = ds.doctor_id
             LEFT JOIN users du ON du.id = d.user_id
             LEFT JOIN medical_centers mc ON mc.id = ds.medical_center_id
             LEFT JOIN services s ON s.id = ds.service_id
             WHERE ds.id = ? LIMIT 1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'زمان‌بندی یافت نشد' });
        res.json({ success: true, schedule: normalizeSchedule(rows[0]) });
    } catch (error) { handleError(res, error); }
});

router.post('/doctor-schedules', ...managerOnly, async (req, res) => {
    let connection;
    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);
        const data = await validateSchedulePayload(connection, req.body);
        const result = await insertDynamic(connection, 'doctor_schedules', data);
        const generated_slots = await generateSlotsForSchedule(connection, result.insertId);
        await connection.commit();
        res.status(201).json({ success: true, id: result.insertId, generated_slots, message: generated_slots > 0 ? 'زمان‌بندی پزشک ثبت شد و نوبت‌ها تولید شدند' : 'زمان‌بندی ثبت شد اما نوبتی تولید نشد' });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
});

router.patch('/doctor-schedules/:id', ...managerOnly, async (req, res) => {
    let connection;
    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);
        const id = Number(req.params.id);
        const data = await validateSchedulePayload(connection, req.body, id);
        await updateDynamic(connection, 'doctor_schedules', data, 'WHERE id = ?', [id]);
        await connection.query('DELETE FROM appointment_slots WHERE doctor_schedule_id = ? AND booked_count = 0', [id]);
        const generated_slots = await generateSlotsForSchedule(connection, id);
        await connection.commit();
        res.json({ success: true, generated_slots, message: generated_slots > 0 ? 'زمان‌بندی پزشک به‌روزرسانی شد و نوبت‌ها تولید شدند' : 'زمان‌بندی به‌روزرسانی شد اما نوبتی تولید نشد' });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
});

router.delete('/doctor-schedules/:id', ...managerOnly, async (req, res) => {
    let connection;
    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);

        const result = await hardDeleteScheduleWithSlots(connection, Number(req.params.id));
        if (!result.exists) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'زمان‌بندی یافت نشد' });
        }

        await connection.commit();
        res.json({
            success: true,
            ...result,
            message: result.hardDeleted
                ? `زمان‌بندی حذف شد و ${result.slotsDeleted} نوبت مرتبط حذف شد`
                : 'این زمان‌بندی رزرو فعال دارد؛ برای حفظ سوابق حذف نشد و فقط غیرفعال شد'
        });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
});

// Appointment slots

async function buildSlotPositions(poolOrConnection, slots) {
    const expanded = [];
    const positionStates = await getSlotPositionStateMap(poolOrConnection, slots.map(slot => slot.id));

    for (const slot of slots) {
        const normalizedSlot = normalizeSlot(slot);
        const capacity = Math.max(Number(slot.capacity || 1), 1);
        const base = await dailyQueueBaseForSlot(poolOrConnection, slot);

        const [appointments] = await poolOrConnection.query(
            `SELECT a.id,
                    a.appointment_slot_id,
                    a.appointment_queue_number,
                    a.status,
                    a.tracking_code,
                    COALESCE(p.full_name, p.username, pu.full_name, pu.username) AS patient_name,
                    COALESCE(p.phone, p.mobile, pu.phone) AS patient_phone
             FROM appointments a
             LEFT JOIN patients p ON p.id = a.patient_id
             LEFT JOIN users pu ON pu.id = p.user_id
             WHERE a.appointment_slot_id = ?
               AND ${activeAppointmentStatusSql('a')}
             ORDER BY a.appointment_queue_number ASC`,
            [slot.id]
        );

        const byQueue = new Map();
        for (const appointment of appointments) {
            const queue = Number(appointment.appointment_queue_number || 0);
            if (queue > 0) byQueue.set(queue, appointment);
        }

        for (let position = 1; position <= capacity; position += 1) {
            const dailyQueueNumber = base + position;
            const appointment = byQueue.get(dailyQueueNumber) || null;

            expanded.push({
                id: `${slot.id}-${position}`,
                slot_id: slot.id,
                doctor_schedule_id: slot.doctor_schedule_id,
                doctor_id: slot.doctor_id,
                doctor_name: normalizedSlot.doctor_name,
                medical_center_id: slot.medical_center_id,
                medical_center_name: normalizedSlot.medical_center_name,
                service_id: slot.service_id,
                service_name: normalizedSlot.service_name,
                slot_date: normalizedSlot.slot_date,
                start_time: normalizedSlot.start_time,
                end_time: normalizedSlot.end_time,
                capacity,
                position_in_slot: position,
                appointment_queue_number: dailyQueueNumber,
                daily_queue_number: dailyQueueNumber,
                appointment_id: appointment?.id || null,
                patient_name: appointment?.patient_name || null,
                patient_phone: appointment?.patient_phone || null,
                tracking_code: appointment?.tracking_code || null,
                appointment_status: appointment?.status || null,
                status: appointment
                    ? 'booked'
                    : (positionStates.get(`${slot.id}:${position}`) === 'deleted'
                        ? 'deleted'
                        : (positionStates.get(`${slot.id}:${position}`) === 'disabled'
                            ? 'disabled'
                            : (slot.status === 'disabled' || slot.status === 'cancelled' ? slot.status : 'available'))),
                position_status: positionStates.get(`${slot.id}:${position}`) || null,
                is_booked: Boolean(appointment),
                remaining_capacity: normalizedSlot.remaining_capacity,
                booked_count: normalizedSlot.booked_count,
                source_slot: normalizedSlot
            });
        }
    }

    return expanded;
}

router.get('/appointment-slots', ...managerOnly, async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const expandPositions = String(req.query.expand_positions || req.query.expand || '') === '1';
        const requestedStatus = String(req.query.status || '').toLowerCase();
        const where = [];
        const params = [];
        if (req.query.doctor_id) { where.push('aps.doctor_id = ?'); params.push(req.query.doctor_id); }
        if (req.query.medical_center_id) { where.push('aps.medical_center_id = ?'); params.push(req.query.medical_center_id); }
        if (req.query.service_id) { where.push('aps.service_id = ?'); params.push(req.query.service_id); }
        // در حالت نمایش جایگاه‌های ظرفیت، وضعیت هر ردیف ممکن است مستقل از status رکورد مادر باشد.
        // بنابراین فیلتر وضعیت بعد از expand اعمال می‌شود.
        if (requestedStatus && !expandPositions) { where.push('aps.status = ?'); params.push(requestedStatus); }
        if (req.query.date_from) { where.push('aps.slot_date >= ?'); params.push(req.query.date_from); }
        if (req.query.date_to) { where.push('aps.slot_date <= ?'); params.push(req.query.date_to); }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(
            `SELECT aps.*,
                    COALESCE(du.full_name, d.full_name, du.username) AS doctor_name,
                    mc.name AS medical_center_name,
                    s.name AS service_name
             FROM appointment_slots aps
             LEFT JOIN doctors d ON d.id = aps.doctor_id
             LEFT JOIN users du ON du.id = d.user_id
             LEFT JOIN medical_centers mc ON mc.id = aps.medical_center_id
             LEFT JOIN services s ON s.id = aps.service_id
             ${whereSql}
             ORDER BY aps.slot_date ASC, aps.start_time ASC
             LIMIT 500`,
            params
        );

        if (expandPositions) {
            let positions = await buildSlotPositions(pool, rows);
            if (requestedStatus) {
                positions = positions.filter(position => String(position.status || '').toLowerCase() === requestedStatus);
            }
            return res.json({ success: true, slots: rows.map(normalizeSlot), positions });
        }

        res.json({ success: true, slots: rows.map(normalizeSlot) });
    } catch (error) { handleError(res, error); }
});

async function updateSlotStatusHandler(req, res) {
    try {
        const pool = await ensureAndGetPool();
        await ensureAppointmentArchitecture(pool);

        const ref = parseSlotPositionRef(req.params.id);
        const id = ref.slotId;
        const status = String(req.body.status || req.body.next_status || '').toLowerCase();

        if (!id) {
            return res.status(400).json({ success: false, message: 'شناسه نوبت نامعتبر است' });
        }

        if (!['available', 'disabled', 'cancelled', 'canceled'].includes(status)) {
            return res.status(400).json({ success: false, message: 'وضعیت نوبت نامعتبر است' });
        }

        if (ref.isPosition) {
            let connection;
            try {
                connection = await pool.getConnection();
                await connection.beginTransaction();
                const result = await setSlotPositionStatus(connection, ref, status);
                await connection.commit();
                return res.json(result);
            } catch (error) {
                if (connection) await connection.rollback();
                throw error;
            } finally {
                if (connection) connection.release();
            }
        }

        const [rows] = await pool.query('SELECT * FROM appointment_slots WHERE id = ? LIMIT 1', [id]);
        const slot = rows[0];
        if (!slot) {
            return res.status(404).json({ success: false, message: 'نوبت پیدا نشد' });
        }

        const bookedCount = Number(slot.booked_count || 0);
        const capacity = Math.max(Number(slot.capacity || 1), 1);
        const remaining = Math.max(capacity - bookedCount, 0);

        if ((status === 'cancelled' || status === 'canceled') && bookedCount > 0) {
            return res.status(409).json({
                success: false,
                message: 'این ساعت نوبت رزروشده دارد؛ ابتدا نوبت‌های بیماران را لغو کنید'
            });
        }

        let finalStatus = status === 'canceled' ? 'cancelled' : status;
        if (finalStatus === 'available') {
            finalStatus = remaining > 0 ? 'available' : 'full';
        }

        await pool.query(
            'UPDATE appointment_slots SET status = ?, remaining_capacity = ?, booked_count = ? WHERE id = ?',
            [finalStatus, remaining, bookedCount, id]
        );

        res.json({
            success: true,
            id,
            status: finalStatus,
            message: finalStatus === 'available'
                ? 'نوبت فعال شد'
                : finalStatus === 'disabled'
                    ? 'نوبت غیرفعال شد'
                    : 'نوبت لغو شد'
        });
    } catch (error) {
        handleError(res, error);
    }
}

async function hardDeleteSlotHandler(req, res) {
    try {
        const pool = await ensureAndGetPool();
        await ensureAppointmentArchitecture(pool);

        const ref = parseSlotPositionRef(req.params.id);
        const id = ref.slotId;
        if (!id) {
            return res.status(400).json({ success: false, message: 'شناسه نوبت نامعتبر است' });
        }

        if (ref.isPosition) {
            let connection;
            try {
                connection = await pool.getConnection();
                await connection.beginTransaction();
                const result = await deleteSlotPosition(connection, ref);
                await connection.commit();
                return res.json(result);
            } catch (error) {
                if (connection) await connection.rollback();
                throw error;
            } finally {
                if (connection) connection.release();
            }
        }

        const [rows] = await pool.query('SELECT id, booked_count FROM appointment_slots WHERE id = ? LIMIT 1', [id]);
        const slot = rows[0];
        if (!slot) {
            return res.status(404).json({ success: false, message: 'نوبت پیدا نشد' });
        }

        if (Number(slot.booked_count || 0) > 0) {
            return res.status(409).json({
                success: false,
                message: 'این نوبت رزرو دارد و قابل حذف نیست؛ ابتدا رزروهای بیمار را لغو کنید'
            });
        }

        await pool.query('DELETE FROM appointment_slots WHERE id = ?', [id]);
        res.json({ success: true, id, message: 'نوبت حذف شد' });
    } catch (error) {
        handleError(res, error);
    }
}

router.post('/appointment-slots/:id/status', ...managerOnly, updateSlotStatusHandler);
router.patch('/appointment-slots/:id/status', ...managerOnly, updateSlotStatusHandler);
router.post('/appointment-slots/:id/toggle-status', ...managerOnly, updateSlotStatusHandler);
router.post('/appointment-slots/:id/hard-delete', ...managerOnly, hardDeleteSlotHandler);
router.delete('/appointment-slots/:id', ...managerOnly, hardDeleteSlotHandler);


router.get('/appointment-slots/available', async (req, res) => {
    try {
        const pool = await ensureAndGetPool();
        const today = new Date().toISOString().slice(0, 10);
        const where = ['aps.status = "available"', 'aps.remaining_capacity > 0', 'aps.slot_date >= ?'];
        const params = [req.query.date_from || today];
        if (req.query.date_to) { where.push('aps.slot_date <= ?'); params.push(req.query.date_to); }
        if (req.query.doctor_id) { where.push('aps.doctor_id = ?'); params.push(req.query.doctor_id); }
        if (req.query.medical_center_id) { where.push('aps.medical_center_id = ?'); params.push(req.query.medical_center_id); }
        if (req.query.service_id) { where.push('aps.service_id = ?'); params.push(req.query.service_id); }
        const [rows] = await pool.query(
            `SELECT aps.*,
                    COALESCE(du.full_name, d.full_name, du.username) AS doctor_name,
                    mc.name AS medical_center_name,
                    s.name AS service_name
             FROM appointment_slots aps
             LEFT JOIN doctors d ON d.id = aps.doctor_id
             LEFT JOIN users du ON du.id = d.user_id
             JOIN medical_centers mc ON mc.id = aps.medical_center_id AND mc.is_active = 1
             JOIN services s ON s.id = aps.service_id AND s.is_active = 1
             WHERE ${where.join(' AND ')}
             ORDER BY aps.slot_date ASC, aps.start_time ASC
             LIMIT 200`,
            params
        );
        res.json({ success: true, slots: rows.map(normalizeSlot) });
    } catch (error) { handleError(res, error); }
});


function activeAppointmentStatusSql(alias = '') {
    const prefix = alias ? `${alias}.` : '';
    return `COALESCE(${prefix}status, 'pending') NOT IN ('cancelled','canceled','deleted','rejected')`;
}


function parseSlotPositionRef(value) {
    const text = String(value ?? '').trim();
    const match = text.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) return { slotId: 0, position: null, isPosition: false };
    const slotId = Number(match[1]);
    const position = match[2] ? Number(match[2]) : null;
    return {
        slotId: Number.isFinite(slotId) ? slotId : 0,
        position: Number.isFinite(position) ? position : null,
        isPosition: position !== null && Number.isFinite(position)
    };
}

async function ensureSlotPositionStateTable(connection) {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS appointment_slot_position_states (
            id INT AUTO_INCREMENT PRIMARY KEY,
            slot_id INT NOT NULL,
            position_in_slot INT NOT NULL,
            status ENUM('available','disabled','deleted') NOT NULL DEFAULT 'disabled',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_slot_position_state (slot_id, position_in_slot),
            INDEX idx_slot_position_state_slot (slot_id, status),
            INDEX idx_slot_position_state_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);
}

async function getSlotPositionStateMap(connection, slotIds) {
    const ids = [...new Set((slotIds || []).map(Number).filter(Boolean))];
    const map = new Map();
    if (!ids.length) return map;
    await ensureSlotPositionStateTable(connection);
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await connection.query(
        `SELECT slot_id, position_in_slot, status
         FROM appointment_slot_position_states
         WHERE slot_id IN (${placeholders})`,
        ids
    );
    for (const row of rows) {
        map.set(`${Number(row.slot_id)}:${Number(row.position_in_slot)}`, String(row.status || '').toLowerCase());
    }
    return map;
}

async function appointmentForSlotPosition(connection, slot, position, lock = false) {
    const capacity = Math.max(Number(slot.capacity || 1), 1);
    const positionNumber = Number(position || 0);
    if (!positionNumber || positionNumber < 1 || positionNumber > capacity) return null;

    const base = await dailyQueueBaseForSlot(connection, slot);
    const queueNumber = base + positionNumber;
    const [rows] = await connection.query(
        `SELECT id, status, appointment_queue_number
         FROM appointments
         WHERE appointment_slot_id = ?
           AND appointment_queue_number = ?
           AND ${activeAppointmentStatusSql()}
         LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [slot.id, queueNumber]
    );
    return rows[0] || null;
}

async function materializeDisabledSlotPositions(connection, slot, exceptPosition = null) {
    if (String(slot.status || '').toLowerCase() !== 'disabled') return;

    const capacity = Math.max(Number(slot.capacity || 1), 1);
    for (let position = 1; position <= capacity; position += 1) {
        if (Number(exceptPosition || 0) === position) continue;
        await connection.query(
            `INSERT IGNORE INTO appointment_slot_position_states (slot_id, position_in_slot, status)
             VALUES (?, ?, 'disabled')`,
            [slot.id, position]
        );
    }
}

async function recalculateSlotAggregate(connection, slotId) {
    await ensureSlotPositionStateTable(connection);

    const [slotRows] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? LIMIT 1', [slotId]);
    const slot = slotRows[0];
    if (!slot) return null;

    const capacity = Math.max(Number(slot.capacity || 1), 1);
    const [[bookedRow]] = await connection.query(
        `SELECT COUNT(*) AS booked_count
         FROM appointments
         WHERE appointment_slot_id = ?
           AND ${activeAppointmentStatusSql()}`,
        [slotId]
    );
    const bookedCount = Math.max(Number(bookedRow?.booked_count || 0), 0);

    const [[blockedRow]] = await connection.query(
        `SELECT COUNT(*) AS blocked_count
         FROM appointment_slot_position_states
         WHERE slot_id = ?
           AND position_in_slot BETWEEN 1 AND ?
           AND status IN ('disabled', 'deleted')`,
        [slotId, capacity]
    );
    const blockedCount = Math.max(Number(blockedRow?.blocked_count || 0), 0);
    const activeCapacity = Math.max(capacity - blockedCount, 0);
    const remaining = Math.max(activeCapacity - bookedCount, 0);
    const finalStatus = activeCapacity <= 0 ? 'disabled' : (remaining > 0 ? 'available' : 'full');

    await connection.query(
        'UPDATE appointment_slots SET booked_count = ?, remaining_capacity = ?, status = ? WHERE id = ?',
        [bookedCount, remaining, finalStatus, slotId]
    );

    return { id: slotId, capacity, booked_count: bookedCount, blocked_count: blockedCount, remaining_capacity: remaining, status: finalStatus };
}

async function setSlotPositionStatus(connection, ref, requestedStatus) {
    await ensureSlotPositionStateTable(connection);

    const status = String(requestedStatus || '').toLowerCase() === 'available' ? 'available' : 'disabled';
    const [slotRows] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE', [ref.slotId]);
    const slot = slotRows[0];
    if (!slot) {
        const err = new Error('نوبت پیدا نشد');
        err.status = 404;
        throw err;
    }

    const capacity = Math.max(Number(slot.capacity || 1), 1);
    if (!ref.position || ref.position < 1 || ref.position > capacity) {
        const err = new Error('شماره جایگاه نوبت نامعتبر است');
        err.status = 400;
        throw err;
    }

    const appointment = await appointmentForSlotPosition(connection, slot, ref.position, true);
    if (appointment && status !== 'available') {
        const err = new Error('این جایگاه نوبت رزرو دارد و قابل غیرفعال‌سازی نیست');
        err.status = 409;
        throw err;
    }

    if (status === 'available') {
        await materializeDisabledSlotPositions(connection, slot, ref.position);
        await connection.query(
            'DELETE FROM appointment_slot_position_states WHERE slot_id = ? AND position_in_slot = ?',
            [ref.slotId, ref.position]
        );
    } else {
        await connection.query(
            `INSERT INTO appointment_slot_position_states (slot_id, position_in_slot, status)
             VALUES (?, ?, 'disabled')
             ON DUPLICATE KEY UPDATE status = 'disabled', updated_at = NOW()`,
            [ref.slotId, ref.position]
        );
    }

    const aggregate = await recalculateSlotAggregate(connection, ref.slotId);
    return {
        success: true,
        id: `${ref.slotId}-${ref.position}`,
        slot_id: ref.slotId,
        position_in_slot: ref.position,
        status,
        slot_status: aggregate?.status || null,
        remaining_capacity: aggregate?.remaining_capacity ?? null,
        message: status === 'available' ? 'این جایگاه نوبت فعال شد' : 'این جایگاه نوبت غیرفعال شد'
    };
}

async function deleteSlotPosition(connection, ref) {
    await ensureSlotPositionStateTable(connection);

    const [slotRows] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE', [ref.slotId]);
    const slot = slotRows[0];
    if (!slot) {
        const err = new Error('نوبت پیدا نشد');
        err.status = 404;
        throw err;
    }

    const capacity = Math.max(Number(slot.capacity || 1), 1);
    if (!ref.position || ref.position < 1 || ref.position > capacity) {
        const err = new Error('شماره جایگاه نوبت نامعتبر است');
        err.status = 400;
        throw err;
    }

    const appointment = await appointmentForSlotPosition(connection, slot, ref.position, true);
    if (appointment) {
        const err = new Error('این جایگاه نوبت رزرو دارد و قابل حذف نیست');
        err.status = 409;
        throw err;
    }

    await materializeDisabledSlotPositions(connection, slot, ref.position);
    await connection.query(
        `INSERT INTO appointment_slot_position_states (slot_id, position_in_slot, status)
         VALUES (?, ?, 'deleted')
         ON DUPLICATE KEY UPDATE status = 'deleted', updated_at = NOW()`,
        [ref.slotId, ref.position]
    );

    const aggregate = await recalculateSlotAggregate(connection, ref.slotId);
    return {
        success: true,
        id: `${ref.slotId}-${ref.position}`,
        slot_id: ref.slotId,
        position_in_slot: ref.position,
        status: 'deleted',
        slot_status: aggregate?.status || null,
        remaining_capacity: aggregate?.remaining_capacity ?? null,
        message: 'این جایگاه نوبت حذف شد'
    };
}

async function scheduleHasActiveAppointments(connection, scheduleId) {
    const [[slotCount]] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM appointment_slots
         WHERE doctor_schedule_id = ?
           AND COALESCE(booked_count, 0) > 0`,
        [scheduleId]
    );
    if (Number(slotCount?.count || 0) > 0) return true;

    const [[appointmentCount]] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN appointment_slots aps ON aps.id = a.appointment_slot_id
         WHERE aps.doctor_schedule_id = ?
           AND ${activeAppointmentStatusSql('a')}`,
        [scheduleId]
    );
    return Number(appointmentCount?.count || 0) > 0;
}

async function hardDeleteScheduleWithSlots(connection, scheduleId) {
    if (!scheduleId) return { exists: false };

    const [scheduleRows] = await connection.query('SELECT id FROM doctor_schedules WHERE id = ? LIMIT 1', [scheduleId]);
    if (!scheduleRows.length) return { exists: false };

    const hasActiveAppointments = await scheduleHasActiveAppointments(connection, scheduleId);
    if (hasActiveAppointments) {
        await connection.query('UPDATE doctor_schedules SET is_active = 0 WHERE id = ?', [scheduleId]);
        await connection.query(
            `UPDATE appointment_slots
             SET status = 'disabled'
             WHERE doctor_schedule_id = ?
               AND COALESCE(booked_count, 0) = 0`,
            [scheduleId]
        );
        return { exists: true, hardDeleted: false, disabled: true, slotsDeleted: 0 };
    }

    const [slotRows] = await connection.query('SELECT id FROM appointment_slots WHERE doctor_schedule_id = ?', [scheduleId]);
    const slotIds = slotRows.map(row => Number(row.id)).filter(Boolean);
    let slotsDeleted = 0;

    if (slotIds.length) {
        const placeholders = slotIds.map(() => '?').join(',');
        await ensureSlotPositionStateTable(connection);
        await connection.query(`DELETE FROM appointment_slot_position_states WHERE slot_id IN (${placeholders})`, slotIds);
        await connection.query(
            `UPDATE appointments
             SET appointment_slot_id = NULL
             WHERE appointment_slot_id IN (${placeholders})
               AND COALESCE(status,'') IN ('cancelled','canceled','deleted','rejected')`,
            slotIds
        );
        const [slotResult] = await connection.query(`DELETE FROM appointment_slots WHERE id IN (${placeholders})`, slotIds);
        slotsDeleted = Number(slotResult.affectedRows || 0);
    }

    const [scheduleResult] = await connection.query('DELETE FROM doctor_schedules WHERE id = ?', [scheduleId]);
    return {
        exists: true,
        hardDeleted: Number(scheduleResult.affectedRows || 0) > 0,
        disabled: false,
        slotsDeleted
    };
}

async function dailyQueueBaseForSlot(connection, slot) {
    const [rows] = await connection.query(
        `SELECT COALESCE(SUM(capacity), 0) AS base
         FROM appointment_slots
         WHERE doctor_id = ?
           AND medical_center_id = ?
           AND service_id = ?
           AND slot_date = ?
           AND start_time < ?
           AND COALESCE(status, 'available') NOT IN ('disabled', 'cancelled')`,
        [
            slot.doctor_id,
            slot.medical_center_id,
            slot.service_id,
            formatDate(slot.slot_date),
            slot.start_time
        ]
    );

    return Number(rows[0]?.base || 0);
}

async function nextQueueNumberForSlot(connection, slot) {
    // Daily order number:
    // order = capacity of earlier slots in the same day/doctor/center/service
    //       + first free position inside the selected slot.
    //
    // Example:
    // 08:00 capacity 10 => positions 1..10
    // 08:30 capacity 10 => positions 11..20
    const capacity = Math.max(Number(slot.capacity || 1), 1);
    const base = await dailyQueueBaseForSlot(connection, slot);

    const [rows] = await connection.query(
        `SELECT appointment_queue_number
         FROM appointments
         WHERE appointment_slot_id = ?
           AND appointment_queue_number IS NOT NULL
           AND ${activeAppointmentStatusSql()}
         ORDER BY appointment_queue_number ASC
         FOR UPDATE`,
        [slot.id]
    );

    await ensureSlotPositionStateTable(connection);
    const [positionRows] = await connection.query(
        `SELECT position_in_slot
         FROM appointment_slot_position_states
         WHERE slot_id = ?
           AND position_in_slot BETWEEN 1 AND ?
           AND status IN ('disabled', 'deleted')`,
        [slot.id, capacity]
    );

    const used = new Set(rows.map(row => Number(row.appointment_queue_number)).filter(n => Number.isFinite(n) && n > 0));
    const blockedPositions = new Set(positionRows.map(row => Number(row.position_in_slot)).filter(n => Number.isFinite(n) && n > 0));
    for (let position = 1; position <= capacity; position += 1) {
        if (blockedPositions.has(position)) continue;
        const queueNumber = base + position;
        if (!used.has(queueNumber)) return queueNumber;
    }

    const err = new Error('ظرفیت این نوبت تکمیل شده است');
    err.status = 409;
    throw err;
}


function queueMessage(queueNumber) {
    const number = Number(queueNumber || 1);
    return `شماره ترتیب روزانه شما ${number} است.`;
}

async function ensureAppointmentQueueNumber(connection, appointmentId) {
    const [appointments] = await connection.query('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [appointmentId]);
    const appointment = appointments[0];
    if (!appointment) {
        const err = new Error('نوبت یافت نشد');
        err.status = 404;
        throw err;
    }

    if (appointment.appointment_queue_number) {
        let capacity = 1;
        if (appointment.appointment_slot_id) {
            const [slotRows] = await connection.query('SELECT capacity FROM appointment_slots WHERE id = ? LIMIT 1', [appointment.appointment_slot_id]);
            capacity = Number(slotRows[0]?.capacity || 1);
        }
        return {
            appointment,
            queueNumber: Number(appointment.appointment_queue_number),
            capacity
        };
    }

    if (!appointment.appointment_slot_id) {
        await connection.query('UPDATE appointments SET appointment_queue_number = 1 WHERE id = ?', [appointmentId]);
        return { appointment, queueNumber: 1, capacity: 1 };
    }

    const [slots] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE', [appointment.appointment_slot_id]);
    const slot = slots[0];
    if (!slot) {
        await connection.query('UPDATE appointments SET appointment_queue_number = 1 WHERE id = ?', [appointmentId]);
        return { appointment, queueNumber: 1, capacity: 1 };
    }

    const queueNumber = await nextQueueNumberForSlot(connection, slot);
    await connection.query('UPDATE appointments SET appointment_queue_number = ? WHERE id = ?', [queueNumber, appointmentId]);

    return {
        appointment: Object.assign({}, appointment, { appointment_queue_number: queueNumber }),
        queueNumber,
        capacity: Number(slot.capacity || 1)
    };
}

async function sendConfirmationSmsAfterCommit(pool, appointmentId) {
    try {
        return await appointmentConfirmationSms.sendAppointmentConfirmationSms(pool, appointmentId);
    } catch (error) {
        console.warn('Appointment confirmation SMS warning:', error.message);
        return { success: false, skipped: true, error: error.message };
    }
}

async function findOrCreatePatient(connection, body) {
    if (body.patient_id) {
        const [rows] = await connection.query('SELECT id FROM patients WHERE id = ? LIMIT 1', [body.patient_id]);
        if (!rows.length) {
            const err = new Error('بیمار انتخاب‌شده یافت نشد');
            err.status = 400;
            throw err;
        }
        return Number(body.patient_id);
    }

    const phone = cleanText(body.patient_phone || body.phone || body.mobile, 20);
    const fullName = cleanText(body.patient_name || body.full_name || body.name, 200) || 'بیمار جدید';
    if (!phone) {
        const err = new Error('شماره تماس بیمار الزامی است');
        err.status = 400;
        throw err;
    }

    const [existing] = await connection.query(
        'SELECT id FROM patients WHERE phone = ? OR mobile = ? ORDER BY id DESC LIMIT 1',
        [phone, phone]
    );
    if (existing.length) return existing[0].id;

    const username = `patient_${phone.replace(/\D/g, '').slice(-10) || Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const userResult = await insertDynamic(connection, 'users', {
        username,
        password: `no_login_${Date.now()}`,
        full_name: fullName,
        phone,
        role: 'patient',
        is_active: 1
    });

    const patientResult = await insertDynamic(connection, 'patients', {
        user_id: userResult.insertId,
        username,
        full_name: fullName,
        phone,
        mobile: phone,
        is_active: 1
    });

    return patientResult.insertId;
}

// Transaction-based appointment booking
router.post('/appointments', optionalAuth, async (req, res) => {
    let connection;
    let smsAfterCommitAppointmentId = null;
    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);

        const slotId = Number(req.body.appointment_slot_id || req.body.slot_id);
        if (!slotId) {
            const err = new Error('انتخاب نوبت الزامی است');
            err.status = 400;
            throw err;
        }

        const [slots] = await connection.query(
            `SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE`,
            [slotId]
        );
        const slot = slots[0];
        if (!slot) {
            const err = new Error('نوبت انتخاب‌شده یافت نشد');
            err.status = 404;
            throw err;
        }
        if (slot.status !== 'available' || Number(slot.remaining_capacity) <= 0 || Number(slot.booked_count) >= Number(slot.capacity)) {
            const err = new Error('ظرفیت این نوبت تکمیل شده است');
            err.status = 409;
            throw err;
        }

        const patientId = await findOrCreatePatient(connection, req.body);
        const code = trackingCode();
        const queueNumber = await nextQueueNumberForSlot(connection, slot);
        const appointmentStatus = req.body.status || 'pending';

        const result = await insertDynamic(connection, 'appointments', {
            patient_id: patientId,
            appointment_slot_id: slot.id,
            appointment_queue_number: queueNumber,
            doctor_id: slot.doctor_id,
            medical_center_id: slot.medical_center_id,
            service_id: slot.service_id,
            appointment_date: formatDate(slot.slot_date),
            appointment_time: trimTime(slot.start_time),
            type: req.body.type || 'regular',
            status: appointmentStatus,
            tracking_code: code,
            confirmed_at: appointmentStatus === 'confirmed' ? new Date() : null,
            reason: cleanText(req.body.reason, 2000),
            notes: cleanText(req.body.notes, 2000),
            description: cleanText(req.body.description, 2000),
            created_by: req.user?.id || null
        });

        const newBooked = Number(slot.booked_count) + 1;
        const newRemaining = Math.max(Number(slot.capacity) - newBooked, 0);
        const status = newRemaining > 0 ? 'available' : 'full';

        await connection.query(
            `UPDATE appointment_slots SET booked_count = ?, remaining_capacity = ?, status = ? WHERE id = ?`,
            [newBooked, newRemaining, status, slot.id]
        );

        if (appointmentStatus === 'confirmed') smsAfterCommitAppointmentId = result.insertId;

        await connection.commit();

        let sms = null;
        if (smsAfterCommitAppointmentId) {
            sms = await sendConfirmationSmsAfterCommit(pool, smsAfterCommitAppointmentId);
        }

        res.status(201).json({
            success: true,
            appointment_id: result.insertId,
            tracking_code: code,
            appointment_queue_number: queueNumber,
            queue_number: queueNumber,
            queue_label: queueMessage(queueNumber),
            remaining_capacity: newRemaining,
            sms,
            message: `نوبت با موفقیت ثبت شد. ساعت ${trimTime(slot.start_time)}، ${queueMessage(queueNumber)}`.trim()
        });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
});


async function confirmAppointmentHandler(req, res) {
    let connection;
    let appointmentId = Number(req.params.id);
    let queueNumber = 1;
    let capacity = 1;

    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);

        if (!appointmentId) {
            const err = new Error('شناسه نوبت نامعتبر است');
            err.status = 400;
            throw err;
        }

        const queueInfo = await ensureAppointmentQueueNumber(connection, appointmentId);
        queueNumber = queueInfo.queueNumber;
        capacity = queueInfo.capacity;

        await connection.query(
            `UPDATE appointments
             SET status = 'confirmed',
                 confirmed_at = COALESCE(confirmed_at, NOW())
             WHERE id = ?`,
            [appointmentId]
        );

        await connection.commit();

        const sms = await sendConfirmationSmsAfterCommit(pool, appointmentId);

        res.json({
            success: true,
            appointment_id: appointmentId,
            appointment_queue_number: queueNumber,
            queue_number: queueNumber,
            queue_label: queueMessage(queueNumber),
            sms,
            message: `نوبت تایید شد. ${queueMessage(queueNumber)} پیامک تایید شامل ساعت و شماره ترتیب ارسال شد.`
        });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
}

router.patch('/appointments/:id/confirm', ...managerOnly, confirmAppointmentHandler);
router.put('/appointments/:id/confirm', ...managerOnly, confirmAppointmentHandler);

router.patch('/appointments/:id/cancel', optionalAuth, async (req, res) => {
    let connection;
    try {
        const pool = await ensureAndGetPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureAppointmentArchitecture(connection);

        const [rows] = await connection.query('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [req.params.id]);
        const appointment = rows[0];
        if (!appointment) {
            const err = new Error('نوبت یافت نشد');
            err.status = 404;
            throw err;
        }

        if (appointment.status !== 'cancelled') {
            await connection.query('UPDATE appointments SET status = "cancelled", notes = COALESCE(?, notes) WHERE id = ?', [cleanText(req.body.reason || req.body.notes, 500), req.params.id]);

            if (appointment.appointment_slot_id) {
                const [slotRows] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE', [appointment.appointment_slot_id]);
                const slot = slotRows[0];
                if (slot) {
                    const newBooked = Math.max(Number(slot.booked_count || 0) - 1, 0);
                    const newRemaining = Math.max(Number(slot.capacity || 0) - newBooked, 0);
                    const newStatus = slot.status === 'disabled' ? 'disabled' : (newRemaining > 0 ? 'available' : 'full');
                    await connection.query(
                        'UPDATE appointment_slots SET booked_count = ?, remaining_capacity = ?, status = ? WHERE id = ?',
                        [newBooked, newRemaining, newStatus, slot.id]
                    );
                }
            }
        }

        await connection.commit();
        res.json({ success: true, message: 'نوبت لغو شد و ظرفیت آزاد شد' });
    } catch (error) {
        if (connection) await connection.rollback();
        handleError(res, error);
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
