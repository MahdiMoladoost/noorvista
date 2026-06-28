'use strict';

// Safe first-run database bootstrap for ParsPack / PaaS.
// It creates the minimum base schema required by NoorVista migrations, then
// runs the normal versioned migrations. It never truncates or drops data.

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { main: runMigrations } = require('./migrate');

function envFlag(name, fallback = false) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'noorvista_clinic',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 5),
    queueLimit: 0,
    multipleStatements: false,
    dateStrings: true,
    timezone: 'Z',
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  };
}

const baseSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(120) NOT NULL PRIMARY KEY,
    setting_value TEXT NULL,
    setting_group VARCHAR(80) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NULL UNIQUE,
    password VARCHAR(255) NULL,
    password_hash VARCHAR(255) NULL,
    full_name VARCHAR(200) NULL,
    fullname VARCHAR(200) NULL,
    name VARCHAR(200) NULL,
    first_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    display_name VARCHAR(200) NULL,
    email VARCHAR(200) NULL,
    phone VARCHAR(30) NULL,
    mobile VARCHAR(30) NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'patient',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    active TINYINT(1) NOT NULL DEFAULT 1,
    last_login DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_role (role),
    INDEX idx_users_phone (phone),
    INDEX idx_users_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS doctors (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL UNIQUE,
    username VARCHAR(100) NULL,
    full_name VARCHAR(200) NULL,
    name VARCHAR(200) NULL,
    first_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    phone VARCHAR(30) NULL,
    mobile VARCHAR(30) NULL,
    email VARCHAR(200) NULL,
    specialty VARCHAR(200) NOT NULL DEFAULT 'چشم‌پزشکی',
    sub_specialty VARCHAR(200) NULL,
    license_number VARCHAR(100) NULL,
    medical_code VARCHAR(100) NULL,
    experience_years INT NOT NULL DEFAULT 0,
    bio TEXT NULL,
    consultation_fee DECIMAL(14,0) NOT NULL DEFAULT 0,
    work_start_time TIME NULL,
    work_end_time TIME NULL,
    slot_duration INT NOT NULL DEFAULT 30,
    break_between INT NOT NULL DEFAULT 5,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    active TINYINT(1) NOT NULL DEFAULT 1,
    is_available TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_doctors_user (user_id),
    INDEX idx_doctors_active (is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS patients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL UNIQUE,
    username VARCHAR(100) NULL,
    full_name VARCHAR(200) NULL,
    name VARCHAR(200) NULL,
    first_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    phone VARCHAR(30) NULL,
    mobile VARCHAR(30) NULL,
    email VARCHAR(200) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    active TINYINT(1) NOT NULL DEFAULT 1,
    national_code VARCHAR(20) NULL,
    birth_date DATE NULL,
    gender VARCHAR(20) NULL,
    blood_type VARCHAR(10) NULL,
    address TEXT NULL,
    emergency_contact_name VARCHAR(150) NULL,
    emergency_contact_phone VARCHAR(30) NULL,
    insurance_provider VARCHAR(120) NULL,
    insurance_number VARCHAR(80) NULL,
    allergies TEXT NULL,
    medications TEXT NULL,
    chronic_diseases TEXT NULL,
    medical_history TEXT NULL,
    notes TEXT NULL,
    registration_source VARCHAR(80) NULL,
    is_guest TINYINT(1) NOT NULL DEFAULT 0,
    account_claimed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_patients_user (user_id),
    INDEX idx_patients_phone (phone)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS services (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NULL UNIQUE,
    category VARCHAR(100) NULL,
    description TEXT NULL,
    default_capacity INT NOT NULL DEFAULT 1,
    default_duration_minutes INT NOT NULL DEFAULT 30,
    default_fee DECIMAL(14,0) NOT NULL DEFAULT 0,
    is_free TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_services_active (is_active),
    INDEX idx_services_category (category)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS medical_centers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'clinic',
    province VARCHAR(100) NULL,
    city VARCHAR(100) NULL,
    address TEXT NULL,
    phone VARCHAR(50) NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    description TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_medical_centers_active (is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS doctor_medical_centers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    doctor_id INT NOT NULL,
    medical_center_id INT NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doctor_center (doctor_id, medical_center_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS doctor_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    doctor_id INT NOT NULL,
    medical_center_id INT NULL,
    service_id INT NULL,
    day_of_week TINYINT NULL,
    start_time TIME NULL,
    end_time TIME NULL,
    slot_duration INT NOT NULL DEFAULT 30,
    slot_duration_minutes INT NULL,
    break_between INT NOT NULL DEFAULT 5,
    capacity_per_slot INT NOT NULL DEFAULT 1,
    custom_fee DECIMAL(14,0) NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    is_recurring TINYINT(1) NOT NULL DEFAULT 1,
    booking_window_days INT NOT NULL DEFAULT 30,
    reminder_enabled TINYINT(1) NOT NULL DEFAULT 1,
    reminder_before_minutes INT NOT NULL DEFAULT 1440,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_doctor_schedules_doctor (doctor_id),
    INDEX idx_doctor_schedules_lookup (doctor_id, day_of_week, is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS appointment_slots (
    id INT PRIMARY KEY AUTO_INCREMENT,
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
    status VARCHAR(30) NOT NULL DEFAULT 'available',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_slot_unique (doctor_schedule_id, slot_date, start_time),
    INDEX idx_slots_lookup (service_id, doctor_id, medical_center_id, slot_date),
    INDEX idx_slots_status (status, slot_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS appointment_slot_position_states (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    slot_id INT NOT NULL,
    position_in_slot INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'available',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_slot_position_state (slot_id, position_in_slot),
    INDEX idx_slot_position_state_slot (slot_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS appointments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NULL,
    appointment_slot_id INT NULL,
    doctor_id INT NULL,
    medical_center_id INT NULL,
    service_id INT NULL,
    appointment_date DATE NULL,
    appointment_time TIME NULL,
    type VARCHAR(50) NULL,
    appointment_type VARCHAR(50) NULL,
    reason VARCHAR(1000) NULL,
    notes TEXT NULL,
    amount DECIMAL(14,0) NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_status ENUM('unpaid','pending','paid','free','refunded','cancelled') NOT NULL DEFAULT 'unpaid',
    tracking_code VARCHAR(50) NULL,
    appointment_queue_number INT NULL,
    confirmed_at DATETIME NULL,
    confirmation_sms_sent_at DATETIME NULL,
    confirmation_sms_status VARCHAR(30) NULL,
    confirmation_sms_error TEXT NULL,
    cancellation_sms_status VARCHAR(30) NULL,
    cancellation_sms_sent_at DATETIME NULL,
    cancellation_sms_error VARCHAR(1000) NULL,
    reminder_sent_at DATETIME NULL,
    reminder_status VARCHAR(50) NULL,
    reminder_error TEXT NULL,
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_appointments_patient (patient_id),
    INDEX idx_appointments_doctor_date (doctor_id, appointment_date),
    INDEX idx_appointments_slot (appointment_slot_id),
    INDEX idx_appointments_status (status),
    INDEX idx_appointments_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS medical_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    doctor_id INT NULL,
    appointment_id INT NULL,
    diagnosis TEXT NULL,
    notes TEXT NULL,
    record_status ENUM('draft','signed','amended','locked') NOT NULL DEFAULT 'draft',
    signed_at DATETIME NULL,
    signed_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_medical_records_patient (patient_id),
    INDEX idx_medical_records_doctor (doctor_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS prescriptions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    doctor_id INT NULL,
    medical_record_id INT NULL,
    appointment_id INT NULL,
    prescription_text TEXT NULL,
    prescribed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_prescriptions_patient (patient_id),
    INDEX idx_prescriptions_record (medical_record_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    appointment_id INT NULL,
    patient_id INT NULL,
    amount DECIMAL(14,0) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'IRT',
    method VARCHAR(50) NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_date DATETIME NULL,
    paid_at DATETIME NULL,
    approved_by INT NULL,
    approved_at DATETIME NULL,
    rejection_reason VARCHAR(1000) NULL,
    provider VARCHAR(64) NULL,
    provider_authority VARCHAR(191) NULL,
    provider_reference VARCHAR(191) NULL,
    idempotency_key VARCHAR(191) NULL,
    verified_at DATETIME NULL,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payments_appointment (appointment_id),
    INDEX idx_payments_patient (patient_id),
    INDEX idx_payments_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`,

  `CREATE TABLE IF NOT EXISTS doctor_leaves (
    id INT PRIMARY KEY AUTO_INCREMENT,
    doctor_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    leave_type VARCHAR(50) NULL,
    reason VARCHAR(500) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'approved',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_doctor_leaves_doctor (doctor_id),
    INDEX idx_doctor_leaves_dates (start_date, end_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`
,
  `CREATE TABLE IF NOT EXISTS visitor_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    visitor_id VARCHAR(64) NULL,
    ip_address VARCHAR(64) NULL,
    country VARCHAR(80) NULL,
    city VARCHAR(120) NULL,
    path VARCHAR(512) NULL,
    method VARCHAR(10) NULL,
    referrer TEXT NULL,
    device_type VARCHAR(50) NULL,
    os VARCHAR(80) NULL,
    browser VARCHAR(80) NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_visitor_created (created_at),
    INDEX idx_visitor_path (path),
    INDEX idx_visitor_country (country),
    INDEX idx_visitor_device (device_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`

];

async function connectWithRetry() {
  const attempts = Number(process.env.DB_BOOTSTRAP_RETRIES || 30);
  const delayMs = Number(process.env.DB_BOOTSTRAP_RETRY_DELAY_MS || 2000);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let pool;
    try {
      pool = mysql.createPool(dbConfig());
      const connection = await pool.getConnection();
      connection.release();
      return pool;
    } catch (error) {
      lastError = error;
      if (pool) await pool.end().catch(() => {});
      console.warn(`Database not ready yet (${attempt}/${attempts}): ${error.message}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

async function ensureBaseSchema() {
  const pool = await connectWithRetry();
  try {
    await pool.query('SET NAMES utf8mb4');
    for (const statement of baseSchemaStatements) {
      await pool.query(statement);
    }
    console.log('✅ Base database schema is ready');
  } finally {
    await pool.end();
  }
}


async function tableColumns(pool, tableName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function addColumnIfMissing(pool, tableName, columnName, ddl) {
  const cols = await tableColumns(pool, tableName);
  if (cols.has(columnName)) return false;
  await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  console.log(`✅ Added missing column: ${tableName}.${columnName}`);
  return true;
}

async function ensureRuntimeColumns() {
  const pool = mysql.createPool(dbConfig());
  try {
    // Keeps already-created ParsPack databases compatible with the current runtime.
    // This is intentionally additive only: no drop/truncate/data reset.
    await addColumnIfMissing(pool, 'patients', 'blood_type', '`blood_type` VARCHAR(10) NULL');

    // Payments table compatibility for older ParsPack databases.
    // Do not use `AFTER ...` here because older schemas may miss the referenced column.
    const paymentColumnDefinitions = [
      ['patient_id', '`patient_id` INT NULL'],
      ['amount', '`amount` DECIMAL(14,0) NOT NULL DEFAULT 0'],
      ['currency', "`currency` CHAR(3) NOT NULL DEFAULT 'IRT'"],
      ['method', '`method` VARCHAR(50) NULL'],
      ['payment_method', '`payment_method` VARCHAR(50) NULL'],
      ['receipt_number', '`receipt_number` VARCHAR(120) NULL'],
      ['description', '`description` VARCHAR(1000) NULL'],
      ['status', "`status` VARCHAR(50) NOT NULL DEFAULT 'pending'"],
      ['payment_date', '`payment_date` DATETIME NULL'],
      ['paid_at', '`paid_at` DATETIME NULL'],
      ['approved_by', '`approved_by` INT NULL'],
      ['approved_at', '`approved_at` DATETIME NULL'],
      ['rejection_reason', '`rejection_reason` VARCHAR(1000) NULL'],
      ['provider', '`provider` VARCHAR(64) NULL'],
      ['provider_authority', '`provider_authority` VARCHAR(191) NULL'],
      ['provider_reference', '`provider_reference` VARCHAR(191) NULL'],
      ['idempotency_key', '`idempotency_key` VARCHAR(191) NULL'],
      ['verified_at', '`verified_at` DATETIME NULL'],
      ['created_by', '`created_by` INT NULL']
    ];

    for (const [columnName, ddl] of paymentColumnDefinitions) {
      await addColumnIfMissing(pool, 'payments', columnName, ddl);
    }

    const paymentColumns = await tableColumns(pool, 'payments');
    if (paymentColumns.has('payment_method') && paymentColumns.has('method')) {
      await pool.query(
        'UPDATE `payments` SET `payment_method` = `method` WHERE `payment_method` IS NULL AND `method` IS NOT NULL'
      );
    }
  } finally {
    await pool.end();
  }
}

async function ensureNoorvista129SettingsCompatibility() {
  const pool = mysql.createPool(dbConfig());
  try {
    await pool.query(
      "UPDATE settings SET setting_value = REPLACE(setting_value, 'نورویستا', '{{clinic_name}}') WHERE setting_key = 'sms_otp_template' AND setting_value LIKE '%نورویستا%'"
    );
  } finally {
    await pool.end();
  }
}

async function seedBootstrapAdminIfRequested() {
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim();
  if (!username && !password) return;
  if (!username || password.length < 8) {
    throw new Error('BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD (min 8 chars) must both be set to create the first admin.');
  }

  const pool = mysql.createPool(dbConfig());
  try {
    const [admins] = await pool.query(
      "SELECT id FROM users WHERE role IN ('system_admin','admin','clinic_manager','clinic_admin') LIMIT 1"
    );
    if (admins.length) return;

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (username, password, password_hash, full_name, fullname, phone, email, role, is_active, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'system_admin', 1, 1)`,
      [
        username,
        hash,
        hash,
        process.env.BOOTSTRAP_ADMIN_FULL_NAME || 'مدیر سیستم',
        process.env.BOOTSTRAP_ADMIN_FULL_NAME || 'مدیر سیستم',
        process.env.BOOTSTRAP_ADMIN_PHONE || username,
        process.env.BOOTSTRAP_ADMIN_EMAIL || null,
      ]
    );
    console.log('✅ Bootstrap admin user created');
  } finally {
    await pool.end();
  }
}

async function main() {
  if (envFlag('SKIP_DB_BOOTSTRAP', false)) {
    console.log('SKIP_DB_BOOTSTRAP=true; database bootstrap skipped');
    return;
  }
  await ensureBaseSchema();
  await runMigrations();
  await ensureRuntimeColumns();
  await ensureNoorvista129SettingsCompatibility();
  await seedBootstrapAdminIfRequested();
  console.log('✅ Database bootstrap and migrations completed');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Database bootstrap failed:', error.message);
    process.exit(1);
  });
}

module.exports = { main, ensureBaseSchema, ensureRuntimeColumns, ensureNoorvista129SettingsCompatibility, seedBootstrapAdminIfRequested };
