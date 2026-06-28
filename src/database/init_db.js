// src/database/init_db.js
// ======================================================
// NoorVista destructive database reset + seed users
// Runtime logs are intentionally English.
// Seed data can still contain Persian names because those are real records.
// ======================================================

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { DEFAULT_TEST_PASSWORD, SEED_PEOPLE, DEFAULT_SERVICES, DEFAULT_CENTERS } = require('./seed-data');

const DB_NAME = process.env.DB_NAME || 'noorvista_clinic';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: DB_NAME,
  multipleStatements: false,
  dateStrings: true,
  timezone: 'Z',
};

const DEFAULT_PASSWORD_MODE = process.env.INIT_DB_PASSWORD_MODE || 'random'; // random | fixed
const FIXED_PASSWORD = process.env.INIT_DB_DEFAULT_PASSWORD || DEFAULT_TEST_PASSWORD;
const generatedPasswords = new Map();


function logStep(message) {
  console.log(`\n\x1b[36m${message}\x1b[0m`);
}

function logOk(message) {
  console.log(`\x1b[32m✓ ${message}\x1b[0m`);
}

function logWarn(message) {
  console.log(`\x1b[33m⚠ ${message}\x1b[0m`);
}

function passwordForPerson(person) {
  if (generatedPasswords.has(person.username)) return generatedPasswords.get(person.username);
  let password;
  if (DEFAULT_PASSWORD_MODE === 'fixed') {
    if (FIXED_PASSWORD.length < 8) throw new Error('رمز ثابت داده‌های آزمایشی باید حداقل ۸ نویسه باشد.');
    password = FIXED_PASSWORD;
  } else {
    password = crypto.randomBytes(18).toString('base64url');
  }
  generatedPasswords.set(person.username, password);
  return password;
}

function splitName(fullName) {
  const cleaned = String(fullName || '').replace(/^دکتر\s+/u, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || cleaned,
    lastName: parts.slice(1).join(' ') || '',
  };
}

async function tableExists(conn, tableName) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND TABLE_TYPE = 'BASE TABLE'`,
    [DB_NAME, tableName]
  );
  return rows.length > 0;
}

async function getTables(conn) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
    [DB_NAME]
  );
  return rows.map(r => r.TABLE_NAME);
}

async function getColumns(conn, tableName) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [DB_NAME, tableName]
  );

  const map = new Map();
  for (const row of rows) {
    map.set(row.COLUMN_NAME, {
      name: row.COLUMN_NAME,
      dataType: row.DATA_TYPE,
      columnType: row.COLUMN_TYPE,
      nullable: row.IS_NULLABLE === 'YES',
      defaultValue: row.COLUMN_DEFAULT,
      extra: row.EXTRA || '',
    });
  }
  return map;
}

function enumValues(columnType) {
  const text = String(columnType || '');
  const match = text.match(/^enum\((.*)\)$/i);
  if (!match) return [];

  const values = [];
  const regex = /'((?:\\'|[^'])*)'/g;
  let item;
  while ((item = regex.exec(match[1]))) {
    values.push(item[1].replace(/\\'/g, "'"));
  }
  return values;
}

function pickFirstAllowed(allowed, candidates, fallbackIndex = 0) {
  for (const candidate of candidates) {
    if (allowed.includes(candidate)) return candidate;
  }
  return allowed[fallbackIndex] || candidates[0] || null;
}

function normalizeEnumValue(column, value) {
  if (!column || column.dataType !== 'enum') return value;

  const allowed = enumValues(column.columnType);
  if (!allowed.length) return value;
  if (allowed.includes(value)) return value;

  const name = String(column.name || '').toLowerCase();
  const valueText = String(value ?? '').toLowerCase();

  if (name === 'type' || name.includes('type')) {
    if (valueText.includes('clinic') || valueText.includes('کلینیک')) {
      return pickFirstAllowed(allowed, ['clinic', 'کلینیک', 'medical_clinic', 'center', 'other', 'سایر']);
    }
    if (valueText.includes('hospital') || valueText.includes('بیمارستان')) {
      return pickFirstAllowed(allowed, ['hospital', 'بیمارستان', 'other', 'سایر']);
    }
    if (valueText.includes('surgery') || valueText.includes('جراحی')) {
      return pickFirstAllowed(allowed, ['surgery_center', 'surgical_center', 'center', 'other', 'سایر']);
    }
    return pickFirstAllowed(allowed, ['clinic', 'other', 'سایر']);
  }

  if (name === 'status' || name.includes('status')) {
    if (['active', '1', 'true'].includes(valueText)) {
      return pickFirstAllowed(allowed, ['active', 'available', 'confirmed', 'pending', 'فعال']);
    }
    if (['inactive', '0', 'false'].includes(valueText)) {
      return pickFirstAllowed(allowed, ['inactive', 'disabled', 'cancelled', 'غیرفعال']);
    }
    return pickFirstAllowed(allowed, ['active', 'available', 'pending'], 0);
  }

  if (name === 'role' || name.includes('role')) {
    return pickFirstAllowed(allowed, [value, 'patient', 'user'], 0);
  }

  if (name === 'gender') {
    if (valueText.includes('female') || valueText.includes('زن')) return pickFirstAllowed(allowed, ['female', 'woman', 'زن']);
    if (valueText.includes('male') || valueText.includes('مرد')) return pickFirstAllowed(allowed, ['male', 'man', 'مرد']);
    return pickFirstAllowed(allowed, ['other', 'male'], 0);
  }

  return allowed[0];
}

async function getAllowedUserRoles(conn) {
  if (!(await tableExists(conn, 'users'))) return [];

  const columns = await getColumns(conn, 'users');
  const roleCol = columns.get('role');
  if (!roleCol) return [];

  return enumValues(roleCol.columnType);
}

function chooseRole(kind, allowedRoles = []) {
  const candidates = {
    system_admin: ['system_admin', 'super_admin', 'admin'],
    clinic_manager: ['clinic_manager', 'clinic_admin', 'manager', 'admin'],
    receptionist: ['receptionist', 'secretary', 'staff'],
    doctor: ['doctor'],
    patient: ['patient'],
  }[kind] || [kind];

  if (!allowedRoles.length) return candidates[0];

  for (const candidate of candidates) {
    if (allowedRoles.includes(candidate)) return candidate;
  }

  return allowedRoles[0];
}

function defaultForColumn(column, row, context = {}) {
  const name = column.name;
  const type = column.dataType;

  if (column.extra && column.extra.toLowerCase().includes('auto_increment')) return undefined;
  if (row[name] !== undefined) return normalizeEnumValue(column, row[name]);
  if (column.defaultValue !== null && column.defaultValue !== undefined) return undefined;
  if (column.nullable) return undefined;

  if (name === 'created_at' || name === 'updated_at') return new Date();
  if (name === 'is_active' || name === 'active' || name === 'is_available') return 1;
  if (name === 'status') return normalizeEnumValue(column, 'active');

  if (type.includes('int') || type === 'decimal' || type === 'float' || type === 'double') return 0;
  if (type === 'date') return '1990-01-01';
  if (type === 'datetime' || type === 'timestamp') return new Date();
  if (type === 'time') return '08:00:00';
  if (type === 'enum') return normalizeEnumValue(column, '');

  if (name.includes('phone') || name === 'mobile') return context.phone || '';
  if (name.includes('name')) return context.fullName || '';
  if (name.includes('code')) return context.phone ? context.phone.slice(-10) : '';
  if (name.includes('email')) return null;

  return '';
}

async function insertFlexible(conn, tableName, values, context = {}) {
  if (!(await tableExists(conn, tableName))) {
    logWarn(`Table ${tableName} does not exist; insert skipped.`);
    return null;
  }

  const columns = await getColumns(conn, tableName);
  const finalRow = {};

  for (const [name, column] of columns.entries()) {
    const value = defaultForColumn(column, values, context);
    if (value !== undefined) finalRow[name] = normalizeEnumValue(column, value);
  }

  for (const key of Object.keys(finalRow)) {
    if (!columns.has(key)) delete finalRow[key];
  }

  const columnNames = Object.keys(finalRow);
  if (!columnNames.length) {
    logWarn(`No insertable columns found for table ${tableName}.`);
    return null;
  }

  const placeholders = columnNames.map(() => '?').join(', ');
  const sql = `INSERT INTO \`${tableName}\` (${columnNames.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
  const [result] = await conn.execute(sql, columnNames.map(c => finalRow[c]));
  return result.insertId;
}

async function createCoreTablesIfMissing(conn) {
  logStep('Checking core tables...');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      full_name VARCHAR(200) NOT NULL,
      email VARCHAR(200) NULL,
      phone VARCHAR(20) NOT NULL,
      role ENUM('system_admin','clinic_manager','clinic_admin','doctor','receptionist','patient','admin','staff') NOT NULL DEFAULT 'patient',
      is_active BOOLEAN DEFAULT TRUE,
      last_login DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_role (role),
      INDEX idx_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL UNIQUE,
      full_name VARCHAR(200) NULL,
      phone VARCHAR(20) NULL,
      mobile VARCHAR(20) NULL,
      email VARCHAR(200) NULL,
      specialty VARCHAR(200) NOT NULL DEFAULT 'چشم‌پزشکی',
      sub_specialty VARCHAR(200) NULL,
      license_number VARCHAR(100) NOT NULL DEFAULT 'NV-DR-001',
      experience_years INT DEFAULT 0,
      bio TEXT NULL,
      consultation_fee DECIMAL(12,0) DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      is_available BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL UNIQUE,
      username VARCHAR(100) NULL,
      full_name VARCHAR(200) NULL,
      phone VARCHAR(20) NULL,
      mobile VARCHAR(20) NULL,
      email VARCHAR(200) NULL,
      is_active BOOLEAN DEFAULT TRUE,
      national_code VARCHAR(20) NULL,
      birth_date DATE NULL,
      gender ENUM('male','female','other') NULL,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_patients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
  `);

  logOk('Core tables are ready.');
}

async function addColumnIfMissing(conn, tableName, columnName, ddl) {
  const columns = await getColumns(conn, tableName);
  if (columns.has(columnName)) return;

  await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  logOk(`Column added: ${tableName}.${columnName}`);
}

async function ensureCoreColumns(conn) {
  logStep('Checking required login and role columns...');

  if (await tableExists(conn, 'users')) {
    await addColumnIfMissing(conn, 'users', 'username', '`username` VARCHAR(100) NULL');
    await addColumnIfMissing(conn, 'users', 'password', '`password` VARCHAR(255) NULL');
    await addColumnIfMissing(conn, 'users', 'full_name', '`full_name` VARCHAR(200) NULL');
    await addColumnIfMissing(conn, 'users', 'phone', '`phone` VARCHAR(20) NULL');
    await addColumnIfMissing(conn, 'users', 'is_active', '`is_active` BOOLEAN DEFAULT TRUE');
    await addColumnIfMissing(conn, 'users', 'created_at', '`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await addColumnIfMissing(conn, 'users', 'updated_at', '`updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    const userColumns = await getColumns(conn, 'users');
    if (!userColumns.has('role')) {
      await conn.query(
        "ALTER TABLE `users` ADD COLUMN `role` ENUM('system_admin','clinic_manager','clinic_admin','doctor','receptionist','patient','admin','staff') NOT NULL DEFAULT 'patient'"
      );
      logOk('Column added: users.role');
    }
  }

  if (await tableExists(conn, 'doctors')) {
    await addColumnIfMissing(conn, 'doctors', 'user_id', '`user_id` INT NULL');
    await addColumnIfMissing(conn, 'doctors', 'full_name', '`full_name` VARCHAR(200) NULL');
    await addColumnIfMissing(conn, 'doctors', 'phone', '`phone` VARCHAR(20) NULL');
    await addColumnIfMissing(conn, 'doctors', 'specialty', "`specialty` VARCHAR(200) NOT NULL DEFAULT 'چشم‌پزشکی'");
    await addColumnIfMissing(conn, 'doctors', 'license_number', "`license_number` VARCHAR(100) NOT NULL DEFAULT 'NV-DR-001'");
    await addColumnIfMissing(conn, 'doctors', 'is_active', '`is_active` BOOLEAN DEFAULT TRUE');
    await addColumnIfMissing(conn, 'doctors', 'is_available', '`is_available` BOOLEAN DEFAULT TRUE');
  }

  if (await tableExists(conn, 'patients')) {
    await addColumnIfMissing(conn, 'patients', 'user_id', '`user_id` INT NULL');
    await addColumnIfMissing(conn, 'patients', 'username', '`username` VARCHAR(100) NULL');
    await addColumnIfMissing(conn, 'patients', 'full_name', '`full_name` VARCHAR(200) NULL');
    await addColumnIfMissing(conn, 'patients', 'phone', '`phone` VARCHAR(20) NULL');
    await addColumnIfMissing(conn, 'patients', 'mobile', '`mobile` VARCHAR(20) NULL');
    await addColumnIfMissing(conn, 'patients', 'email', '`email` VARCHAR(200) NULL');
    await addColumnIfMissing(conn, 'patients', 'is_active', '`is_active` BOOLEAN DEFAULT TRUE');
    await addColumnIfMissing(conn, 'patients', 'national_code', '`national_code` VARCHAR(20) NULL');
    await addColumnIfMissing(conn, 'patients', 'birth_date', '`birth_date` DATE NULL');
    await addColumnIfMissing(conn, 'patients', 'gender', "`gender` ENUM('male','female','other') NULL");
    await addColumnIfMissing(conn, 'patients', 'blood_type', '`blood_type` VARCHAR(10) NULL');
    await addColumnIfMissing(conn, 'patients', 'address', '`address` TEXT NULL');
    await addColumnIfMissing(conn, 'patients', 'emergency_contact_name', '`emergency_contact_name` VARCHAR(150) NULL');
    await addColumnIfMissing(conn, 'patients', 'emergency_contact_phone', '`emergency_contact_phone` VARCHAR(30) NULL');
    await addColumnIfMissing(conn, 'patients', 'insurance_provider', '`insurance_provider` VARCHAR(120) NULL');
    await addColumnIfMissing(conn, 'patients', 'insurance_number', '`insurance_number` VARCHAR(80) NULL');
    await addColumnIfMissing(conn, 'patients', 'allergies', '`allergies` TEXT NULL');
    await addColumnIfMissing(conn, 'patients', 'medications', '`medications` TEXT NULL');
    await addColumnIfMissing(conn, 'patients', 'chronic_diseases', '`chronic_diseases` TEXT NULL');
    await addColumnIfMissing(conn, 'patients', 'medical_history', '`medical_history` TEXT NULL');
    await addColumnIfMissing(conn, 'patients', 'notes', '`notes` TEXT NULL');
  }

  logOk('Required columns are ready.');
}

async function truncateAllTables(conn) {
  logStep('Clearing all data from all tables...');

  const tables = await getTables(conn);
  const preservedTables = new Set(['schema_migrations']);
  if (!tables.length) {
    logWarn('No tables found in the database.');
    return;
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const tableName of tables) {
    if (preservedTables.has(tableName)) {
      logOk(`Preserved: ${tableName}`);
      continue;
    }
    try {
      await conn.query(`TRUNCATE TABLE \`${tableName}\``);
      logOk(`Truncated: ${tableName}`);
    } catch (error) {
      logWarn(`TRUNCATE failed for ${tableName}; trying DELETE instead. Reason: ${error.message}`);
      try {
        await conn.query(`DELETE FROM \`${tableName}\``);
        try {
          await conn.query(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1`);
        } catch (_) {}
        logOk(`Deleted: ${tableName}`);
      } catch (deleteError) {
        logWarn(`Clearing ${tableName} failed: ${deleteError.message}`);
      }
    }
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function seedRolesTableIfExists(conn) {
  if (!(await tableExists(conn, 'roles'))) return;

  const columns = await getColumns(conn, 'roles');
  const roleRows = [
    { key: 'system_admin', name: 'مدیر سیستم', title: 'مدیر سیستم', label: 'مدیر سیستم' },
    { key: 'clinic_manager', name: 'مدیر کلینیک', title: 'مدیر کلینیک', label: 'مدیر کلینیک' },
    { key: 'doctor', name: 'پزشک', title: 'پزشک', label: 'پزشک' },
    { key: 'receptionist', name: 'منشی', title: 'منشی', label: 'منشی' },
    { key: 'patient', name: 'بیمار', title: 'بیمار', label: 'بیمار' },
  ];

  for (const role of roleRows) {
    const row = {};
    if (columns.has('key')) row.key = role.key;
    if (columns.has('slug')) row.slug = role.key;
    if (columns.has('name')) row.name = role.name;
    if (columns.has('title')) row.title = role.title;
    if (columns.has('label')) row.label = role.label;
    if (columns.has('description')) row.description = role.label;
    if (columns.has('is_active')) row.is_active = 1;
    if (columns.has('created_at')) row.created_at = new Date();
    if (columns.has('updated_at')) row.updated_at = new Date();

    await insertFlexible(conn, 'roles', row, { fullName: role.label });
  }

  logOk('Roles seeded.');
}

async function seedUsers(conn) {
  logStep('Creating seed users...');

  const allowedRoles = await getAllowedUserRoles(conn);
  const userIds = {};
  const passwordHashCache = new Map();

  for (const person of SEED_PEOPLE) {
    const password = passwordForPerson(person);
    if (!passwordHashCache.has(password)) {
      passwordHashCache.set(password, await bcrypt.hash(password, 10));
    }

    const role = chooseRole(person.roleKind, allowedRoles);
    const { firstName, lastName } = splitName(person.fullName);
    const hashedPassword = passwordHashCache.get(password);

    const userValues = {
      username: person.username,
      password: hashedPassword,
      password_hash: hashedPassword,
      full_name: person.fullName,
      name: person.fullName,
      first_name: firstName,
      last_name: lastName,
      display_name: person.fullName,
      email: null,
      phone: person.phone,
      mobile: person.phone,
      role,
      is_active: 1,
      active: 1,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const userId = await insertFlexible(conn, 'users', userValues, person);
    userIds[person.phone] = userId;

    logOk(`${person.roleLabel}: ${person.fullName} | username: ${person.username} | password: ${password} | role: ${role}`);
  }

  return userIds;
}

async function seedDoctorProfiles(conn, userIds) {
  const doctor = SEED_PEOPLE.find(p => p.roleKind === 'doctor');
  if (!doctor || !userIds[doctor.phone]) return;

  const { firstName, lastName } = splitName(doctor.fullName);

  const doctorId = await insertFlexible(conn, 'doctors', {
    user_id: userIds[doctor.phone],
    username: doctor.username,
    full_name: doctor.fullName,
    name: doctor.fullName,
    first_name: firstName,
    last_name: lastName,
    phone: doctor.phone,
    mobile: doctor.phone,
    email: null,
    specialty: doctor.specialty || 'چشم‌پزشکی',
    sub_specialty: doctor.subSpecialty || 'جراحی و بیماری‌های چشم',
    license_number: doctor.licenseNumber || 'NV-DR-001',
    medical_code: doctor.licenseNumber || 'NV-DR-001',
    experience_years: 15,
    bio: 'پزشک آزمایشی سامانه نورویستا',
    consultation_fee: doctor.consultationFee || 0,
    work_start_time: '08:00:00',
    work_end_time: '16:00:00',
    slot_duration: 30,
    break_between: 5,
    is_active: 1,
    active: 1,
    is_available: 1,
    created_at: new Date(),
    updated_at: new Date(),
  }, doctor);

  if (doctorId) logOk(`Doctor profile created: ${doctor.fullName}`);
}

async function seedPatientProfiles(conn, userIds) {
  const patients = SEED_PEOPLE.filter(p => p.roleKind === 'patient');

  for (const patient of patients) {
    if (!userIds[patient.phone]) continue;

    const { firstName, lastName } = splitName(patient.fullName);

    const patientId = await insertFlexible(conn, 'patients', {
      user_id: userIds[patient.phone],
      username: patient.username,
      full_name: patient.fullName,
      name: patient.fullName,
      first_name: firstName,
      last_name: lastName,
      phone: patient.phone,
      mobile: patient.phone,
      email: null,
      is_active: 1,
      active: 1,
      national_code: patient.nationalCode || patient.phone.slice(-10),
      birth_date: null,
      gender: patient.gender || null,
      address: null,
      created_at: new Date(),
      updated_at: new Date(),
    }, patient);

    if (patientId) logOk(`Patient profile created: ${patient.fullName}`);
  }
}

async function seedStaffProfilesIfExists(conn, userIds) {
  const possibleStaffTables = ['staff', 'employees', 'clinic_staff'];
  const staffPeople = SEED_PEOPLE.filter(p => ['clinic_manager', 'receptionist', 'system_admin'].includes(p.roleKind));

  for (const tableName of possibleStaffTables) {
    if (!(await tableExists(conn, tableName))) continue;

    for (const person of staffPeople) {
      if (!userIds[person.phone]) continue;

      const { firstName, lastName } = splitName(person.fullName);
      await insertFlexible(conn, tableName, {
        user_id: userIds[person.phone],
        username: person.username,
        full_name: person.fullName,
        name: person.fullName,
        first_name: firstName,
        last_name: lastName,
        phone: person.phone,
        mobile: person.phone,
        role: person.roleKind,
        position: person.roleLabel,
        job_title: person.roleLabel,
        department: 'Administration',
        is_active: 1,
        active: 1,
        created_at: new Date(),
        updated_at: new Date(),
      }, person);
    }

    logOk(`Staff profiles created in table ${tableName}.`);
  }
}


async function seedDefaultServicesIfExists(conn) {
  if (!(await tableExists(conn, 'services'))) {
    logWarn('Services table was not found; default ophthalmology services were not seeded.');
    return;
  }

  for (const service of DEFAULT_SERVICES) {
    await insertFlexible(conn, 'services', {
      name: service.name,
      title: service.name,
      slug: service.slug,
      category: service.category,
      description: service.description,
      default_capacity: service.defaultCapacity,
      capacity: service.defaultCapacity,
      default_duration_minutes: service.defaultDurationMinutes,
      default_fee: service.defaultFee || 0,
      duration_minutes: service.defaultDurationMinutes,
      duration: service.defaultDurationMinutes,
      is_active: 1,
      active: 1,
      created_at: new Date(),
      updated_at: new Date(),
    }, { fullName: service.name });
  }

  logOk(`Default ophthalmology services created: ${DEFAULT_SERVICES.length}`);
}

async function seedDefaultClinicIfExists(conn) {
  const tableNames = ['medical_centers', 'clinics'];
  const centers = DEFAULT_CENTERS;

  for (const tableName of tableNames) {
    if (!(await tableExists(conn, tableName))) continue;

    const columns = await getColumns(conn, tableName);
    const typeColumn = columns.get('type');

    for (const center of centers) {
      const typeValue = typeColumn ? normalizeEnumValue(typeColumn, center.type) : center.type;

      await insertFlexible(conn, tableName, {
        ...center,
        type: typeValue,
        is_active: 1,
        active: 1,
        created_at: new Date(),
        updated_at: new Date(),
      }, { fullName: center.name, phone: center.phone });
    }

    logOk(`Default centers created in table ${tableName}.`);
    return;
  }
}


async function seedDoctorCenterLinks(conn) {
  if (!(await tableExists(conn, 'doctor_medical_centers')) ||
      !(await tableExists(conn, 'doctors')) ||
      !(await tableExists(conn, 'medical_centers'))) return;

  const [doctors] = await conn.query('SELECT id FROM doctors ORDER BY id ASC');
  const [centers] = await conn.query('SELECT id FROM medical_centers ORDER BY id ASC');
  for (const doctor of doctors) {
    for (const center of centers) {
      await conn.query(
        `INSERT INTO doctor_medical_centers (doctor_id, medical_center_id, is_active)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE is_active = 1`,
        [doctor.id, center.id]
      );
    }
  }
  logOk('Doctor and medical center links created.');
}

async function main() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Destructive init_db is disabled in production. Use versioned migrations and controlled user provisioning.');
  }
  const startedAt = new Date();

  console.log('\n======================================================');
  console.log('NOORVISTA init_db');
  console.log('WARNING: all data in all database tables will be deleted.');
  console.log(`Database: ${DB_NAME}`);
  console.log('======================================================');

  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    await conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_persian_ci');
    await createCoreTablesIfMissing(conn);
    await ensureCoreColumns(conn);
    await truncateAllTables(conn);
    await createCoreTablesIfMissing(conn);
    await ensureCoreColumns(conn);

    await seedRolesTableIfExists(conn);
    await seedDefaultClinicIfExists(conn);
    await seedDefaultServicesIfExists(conn);

    const userIds = await seedUsers(conn);
    await seedDoctorProfiles(conn, userIds);
    await seedDoctorCenterLinks(conn);
    await seedPatientProfiles(conn, userIds);
    await seedStaffProfilesIfExists(conn, userIds);

    const [countRows] = await conn.query('SELECT COUNT(*) AS total FROM users');
    const totalUsers = countRows[0]?.total ?? 0;

    console.log('\n======================================================');
    logOk(`init_db completed successfully. Users count: ${totalUsers}`);
    console.log(`Started at: ${startedAt.toISOString()}`);
    console.log(`Finished at: ${new Date().toISOString()}`);
    console.log('======================================================\n');

    console.log('Login credentials:');
    console.log('One-time development credentials (store securely; users must change them):');
    for (const person of SEED_PEOPLE) {
      console.log(`- ${person.roleLabel} | ${person.fullName} | username: ${person.username} | password: ${passwordForPerson(person)}`);
    }

  } catch (error) {
    try {
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (_) {}

    console.error('\ninit_db failed:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  SEED_PEOPLE,
  DEFAULT_SERVICES,
  DEFAULT_CENTERS,
  seedDefaultServicesIfExists,
};
