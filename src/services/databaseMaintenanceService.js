'use strict';

const logger = require('../config/logger');

const RESET_LOCK_NAME = 'noorvista_database_reset';
const FULL_RESET_PHRASE = 'حذف کامل اطلاعات';
const OPERATIONAL_RESET_PHRASE = 'پاکسازی داده های عملیاتی';

const CURRENT_ADMIN_TABLES = new Set([
  'users',
  'auth_refresh_tokens',
  'auth_mfa',
  'auth_mfa_recovery_codes'
]);

const HARD_PRESERVED_TABLES = new Set([
  'backups',
  'schema_migrations',
  'migrations',
  'knex_migrations',
  'knex_migrations_lock',
  'sequelize_meta',
  'typeorm_migrations'
]);

const OPERATIONAL_PRESERVE_TABLES = new Set([
  ...CURRENT_ADMIN_TABLES,
  ...HARD_PRESERVED_TABLES,
  'doctors',
  'settings',
  'services',
  'medical_centers',
  'doctor_medical_centers',
  'doctor_services',
  'doctor_schedules',
  'doctor_schedule_dates',
  'schedule_templates',
  'working_hours',
  'faqs',
  'consent_documents',
  'clinic_settings',
  'logs'
]);

let resetRunning = false;

function envFlag(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function isResetEnabled(env = process.env) {
  if (!envFlag(env.ALLOW_DATABASE_RESET)) return false;
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  if (!production) return true;
  return envFlag(env.ALLOW_DATABASE_RESET_IN_PRODUCTION);
}

function resetDisabledReason(env = process.env) {
  if (!envFlag(env.ALLOW_DATABASE_RESET)) {
    return 'قابلیت پاک‌سازی در تنظیمات سرور فعال نشده است';
  }
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  if (production && !envFlag(env.ALLOW_DATABASE_RESET_IN_PRODUCTION)) {
    return 'پاک‌سازی در محیط عملیاتی به تأیید جداگانه نیاز دارد';
  }
  return '';
}

function normalizeConfirmation(value) {
  return String(value || '')
    .replace(/[\u200c\u200f\u202a-\u202e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function expectedPhrase(mode) {
  return mode === 'full' ? FULL_RESET_PHRASE : OPERATIONAL_RESET_PHRASE;
}

function assertMode(mode) {
  if (!['operational', 'full'].includes(mode)) {
    const error = new Error('نوع پاک‌سازی نامعتبر است');
    error.code = 'DATABASE_RESET_MODE_INVALID';
    throw error;
  }
}

function assertConfirmation(mode, value) {
  assertMode(mode);
  if (normalizeConfirmation(value) !== normalizeConfirmation(expectedPhrase(mode))) {
    const error = new Error(`عبارت تأیید را دقیقاً به شکل «${expectedPhrase(mode)}» وارد کنید`);
    error.code = 'DATABASE_RESET_CONFIRMATION_INVALID';
    throw error;
  }
}

function quoteIdentifier(value) {
  const name = String(value || '');
  if (!/^[A-Za-z0-9_$]+$/.test(name)) {
    const error = new Error('نام جدول نامعتبر است');
    error.code = 'DATABASE_RESET_INVALID_IDENTIFIER';
    throw error;
  }
  return `\`${name}\``;
}

function isMigrationTable(name) {
  const normalized = String(name || '').toLowerCase();
  return HARD_PRESERVED_TABLES.has(normalized) ||
    /^schema_migrations$/i.test(normalized) ||
    /^migrations?$/i.test(normalized) ||
    /^knex_migrations(?:_lock)?$/i.test(normalized) ||
    /^sequelize_meta$/i.test(normalized) ||
    /^typeorm_migrations$/i.test(normalized);
}

async function listBaseTables(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS name, ENGINE AS engine, COALESCE(TABLE_ROWS, 0) AS estimated_rows
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`
  );
  return rows.map((row) => ({
    name: String(row.name || row.TABLE_NAME || ''),
    engine: String(row.engine || row.ENGINE || ''),
    estimatedRows: Number(row.estimated_rows || row.TABLE_ROWS || 0)
  })).filter((row) => row.name);
}

function targetTablesForMode(tables, mode) {
  assertMode(mode);
  return tables.filter((table) => {
    const name = String(table.name || '');
    if (!name || isMigrationTable(name) || name === 'backups') return false;
    if (mode === 'operational' && OPERATIONAL_PRESERVE_TABLES.has(name)) return false;
    return true;
  });
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE' LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function clearCurrentAdminTable(connection, tableName, currentUserId, currentSessionId) {
  if (tableName === 'users') {
    const [result] = await connection.query('DELETE FROM `users` WHERE id <> ?', [currentUserId]);
    return Number(result?.affectedRows || 0);
  }
  if (tableName === 'auth_refresh_tokens') {
    if (Number.isInteger(Number(currentSessionId)) && Number(currentSessionId) > 0) {
      const [result] = await connection.query(
        'DELETE FROM `auth_refresh_tokens` WHERE NOT (user_id = ? AND id = ?)',
        [currentUserId, Number(currentSessionId)]
      );
      return Number(result?.affectedRows || 0);
    }
    const [result] = await connection.query(
      'DELETE FROM `auth_refresh_tokens` WHERE user_id <> ?',
      [currentUserId]
    );
    return Number(result?.affectedRows || 0);
  }
  if (tableName === 'auth_mfa' || tableName === 'auth_mfa_recovery_codes') {
    const [result] = await connection.query(
      `DELETE FROM ${quoteIdentifier(tableName)} WHERE user_id <> ?`,
      [currentUserId]
    );
    return Number(result?.affectedRows || 0);
  }
  return 0;
}

async function deletePatientAccounts(connection, availableTables) {
  const names = new Set((availableTables || []).map((table) => String(table.name || table)));
  if (!names.has('users')) return 0;
  let affectedRows = 0;

  for (const tableName of ['auth_mfa_recovery_codes', 'auth_mfa', 'auth_refresh_tokens']) {
    if (!names.has(tableName)) continue;
    const [result] = await connection.query(
      `DELETE target FROM ${quoteIdentifier(tableName)} target
        JOIN users u ON u.id = target.user_id
       WHERE LOWER(REPLACE(REPLACE(u.role, '-', '_'), ' ', '_')) = 'patient'`
    );
    affectedRows += Number(result?.affectedRows || 0);
  }

  const [result] = await connection.query(
    "DELETE FROM users WHERE LOWER(REPLACE(REPLACE(role, '-', '_'), ' ', '_')) = 'patient'"
  );
  affectedRows += Number(result?.affectedRows || 0);
  return affectedRows;
}

async function writeResetAudit(connection, { userId, mode, backupFilename, clearedTables, ipAddress }) {
  if (!await tableExists(connection, 'logs')) return;
  const details = JSON.stringify({
    mode,
    backup_filename: backupFilename,
    cleared_tables: clearedTables,
    source: 'system_admin_panel'
  });
  await connection.query(
    `INSERT INTO logs (user_id, type, action, details, ip_address, created_at)
     VALUES (?, 'security', 'DATABASE_RESET_COMPLETED', ?, ?, NOW())`,
    [userId, details, ipAddress || null]
  ).catch((error) => {
    logger.error({
      type: 'AUDIT',
      action: 'DATABASE_RESET_AUDIT_FAILED',
      error: error.message
    });
  });
}

async function getMaintenanceStatus(connection, env = process.env) {
  const tables = await listBaseTables(connection);
  return {
    resetEnabled: isResetEnabled(env),
    resetDisabledReason: resetDisabledReason(env),
    tableCount: tables.length,
    estimatedRows: tables.reduce((sum, table) => sum + table.estimatedRows, 0),
    operationalTargetCount: targetTablesForMode(tables, 'operational').length,
    fullTargetCount: targetTablesForMode(tables, 'full').length,
    phrases: {
      operational: OPERATIONAL_RESET_PHRASE,
      full: FULL_RESET_PHRASE
    }
  };
}

async function resetDatabaseData({
  connection,
  currentUserId,
  currentSessionId,
  mode,
  backupFilename,
  ipAddress,
  env = process.env
}) {
  if (!isResetEnabled(env)) {
    const error = new Error(resetDisabledReason(env));
    error.code = 'DATABASE_RESET_DISABLED';
    throw error;
  }
  assertMode(mode);
  if (!Number.isInteger(Number(currentUserId)) || Number(currentUserId) <= 0) {
    const error = new Error('شناسه مدیر سیستم نامعتبر است');
    error.code = 'DATABASE_RESET_ADMIN_INVALID';
    throw error;
  }
  if (!String(backupFilename || '').trim()) {
    const error = new Error('نام پشتیبان ایمنی ثبت نشده است');
    error.code = 'DATABASE_RESET_BACKUP_REQUIRED';
    throw error;
  }
  if (resetRunning) {
    const error = new Error('یک عملیات پاک‌سازی دیگر در حال اجرا است');
    error.code = 'DATABASE_RESET_IN_PROGRESS';
    throw error;
  }

  resetRunning = true;
  let lockAcquired = false;
  let foreignKeysDisabled = false;
  try {
    const [lockRows] = await connection.query(`SELECT GET_LOCK('${RESET_LOCK_NAME}', 5) AS acquired`);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) {
      const error = new Error('پایگاه داده در حال انجام عملیات نگهداری دیگری است');
      error.code = 'DATABASE_RESET_LOCKED';
      throw error;
    }

    const tables = await listBaseTables(connection);
    const targets = targetTablesForMode(tables, mode);

    logger.warn({
      type: 'AUDIT',
      action: 'DATABASE_RESET_STARTED',
      userId: currentUserId,
      mode,
      backupFilename,
      targetCount: targets.length,
      ipAddress
    });

    // TRUNCATE intentionally bypasses append-only DELETE triggers and resets AUTO_INCREMENT.
    // A verified encrypted backup is mandatory before this non-transactional maintenance step.
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    foreignKeysDisabled = true;

    const clearedTables = [];
    const preservedAdminTables = [];
    for (const table of targets) {
      if (mode === 'full' && CURRENT_ADMIN_TABLES.has(table.name)) {
        await clearCurrentAdminTable(connection, table.name, Number(currentUserId), Number(currentSessionId || 0));
        preservedAdminTables.push(table.name);
        continue;
      }
      await connection.query(`TRUNCATE TABLE ${quoteIdentifier(table.name)}`);
      clearedTables.push(table.name);
    }

    const deletedPatientAccountRows = mode === 'operational'
      ? await deletePatientAccounts(connection, tables)
      : 0;

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    foreignKeysDisabled = false;
    await writeResetAudit(connection, {
      userId: Number(currentUserId),
      mode,
      backupFilename,
      clearedTables,
      ipAddress
    });

    logger.warn({
      type: 'AUDIT',
      action: 'DATABASE_RESET_COMPLETED',
      userId: currentUserId,
      mode,
      backupFilename,
      clearedTables,
      preservedAdminTables,
      deletedPatientAccountRows,
      ipAddress
    });

    return {
      mode,
      backup_filename: backupFilename,
      cleared_tables: clearedTables,
      preserved_admin_tables: preservedAdminTables,
      deleted_patient_account_rows: deletedPatientAccountRows,
      table_count: clearedTables.length,
      session_invalidated: false
    };
  } catch (error) {
    if (foreignKeysDisabled) {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    }
    logger.error({
      type: 'AUDIT',
      action: 'DATABASE_RESET_FAILED',
      userId: currentUserId,
      mode,
      backupFilename,
      code: error.code,
      error: error.message,
      ipAddress
    });
    throw error;
  } finally {
    if (lockAcquired) {
      await connection.query(`SELECT RELEASE_LOCK('${RESET_LOCK_NAME}') AS released`).catch(() => {});
    }
    resetRunning = false;
  }
}

module.exports = {
  RESET_LOCK_NAME,
  FULL_RESET_PHRASE,
  OPERATIONAL_RESET_PHRASE,
  CURRENT_ADMIN_TABLES,
  HARD_PRESERVED_TABLES,
  OPERATIONAL_PRESERVE_TABLES,
  envFlag,
  isResetEnabled,
  resetDisabledReason,
  normalizeConfirmation,
  expectedPhrase,
  assertConfirmation,
  quoteIdentifier,
  isMigrationTable,
  listBaseTables,
  targetTablesForMode,
  clearCurrentAdminTable,
  deletePatientAccounts,
  getMaintenanceStatus,
  resetDatabaseData
};
