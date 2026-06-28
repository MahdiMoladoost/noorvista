'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

/**
 * حساب‌های ثابت محیط توسعه و آزمایش نورویستا.
 *
 * اطلاعات قابل‌تغییر در فایل .env.test-accounts نگهداری می‌شود. این فایل به
 * خروجی release راه پیدا نمی‌کند و در محیط production نیز خوانده نمی‌شود.
 */

function loadLocalTestAccountEnv(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase();
  if (nodeEnv === 'production') return {};

  const configuredPath = String(env.TEST_ACCOUNTS_FILE || '.env.test-accounts').trim();
  const filePath = path.resolve(process.cwd(), configuredPath);
  if (!fs.existsSync(filePath)) return {};

  return dotenv.parse(fs.readFileSync(filePath, 'utf8'));
}

const localValues = loadLocalTestAccountEnv();
const value = (key, fallback = '') => String(process.env[key] ?? localValues[key] ?? fallback).trim();

const DEFAULT_TEST_PASSWORD = value('TEST_ACCOUNT_PASSWORD');

const TEST_ACCOUNTS = Object.freeze([
  Object.freeze({
    roleLabel: 'مدیر سیستم',
    roleKind: 'system_admin',
    fullName: value('TEST_SYSTEM_ADMIN_NAME'),
    phone: value('TEST_SYSTEM_ADMIN_PHONE'),
    username: value('TEST_SYSTEM_ADMIN_PHONE'),
    gender: 'male'
  }),
  Object.freeze({
    roleLabel: 'مدیر کلینیک',
    roleKind: 'clinic_manager',
    fullName: value('TEST_CLINIC_MANAGER_NAME'),
    phone: value('TEST_CLINIC_MANAGER_PHONE'),
    username: value('TEST_CLINIC_MANAGER_PHONE'),
    gender: 'male'
  }),
  Object.freeze({
    roleLabel: 'پزشک',
    roleKind: 'doctor',
    fullName: value('TEST_DOCTOR_NAME'),
    phone: value('TEST_DOCTOR_PHONE'),
    username: value('TEST_DOCTOR_PHONE'),
    specialty: 'چشم‌پزشکی',
    subSpecialty: 'جراحی و بیماری‌های چشم',
    licenseNumber: 'NV-DR-001',
    consultationFee: 500000,
    gender: 'male'
  }),
  Object.freeze({
    roleLabel: 'منشی',
    roleKind: 'receptionist',
    fullName: value('TEST_RECEPTIONIST_NAME'),
    phone: value('TEST_RECEPTIONIST_PHONE'),
    username: value('TEST_RECEPTIONIST_PHONE'),
    gender: 'female'
  }),
  Object.freeze({
    roleLabel: 'بیمار اول',
    roleKind: 'patient',
    fullName: value('TEST_PATIENT_ONE_NAME'),
    phone: value('TEST_PATIENT_ONE_PHONE'),
    username: value('TEST_PATIENT_ONE_PHONE'),
    nationalCode: value('TEST_PATIENT_ONE_NATIONAL_CODE', '0126196078'),
    gender: 'female'
  }),
  Object.freeze({
    roleLabel: 'بیمار دوم',
    roleKind: 'patient',
    fullName: value('TEST_PATIENT_TWO_NAME'),
    phone: value('TEST_PATIENT_TWO_PHONE'),
    username: value('TEST_PATIENT_TWO_PHONE'),
    nationalCode: value('TEST_PATIENT_TWO_NATIONAL_CODE', '0109805772'),
    gender: 'male'
  })
]);

function validateTestAccounts() {
  if (!DEFAULT_TEST_PASSWORD || DEFAULT_TEST_PASSWORD.length < 8) {
    throw new Error('رمز حساب‌های آزمایشی در فایل .env.test-accounts تنظیم نشده یا کمتر از ۸ نویسه است.');
  }

  for (const account of TEST_ACCOUNTS) {
    if (!account.fullName || !/^09\d{9}$/.test(account.phone)) {
      throw new Error(`اطلاعات حساب آزمایشی «${account.roleLabel}» کامل یا معتبر نیست.`);
    }
  }
  return true;
}

function shouldShowTestAccounts(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase();
  if (nodeEnv === 'production') return false;

  const setting = String(env.SHOW_TEST_ACCOUNTS_ON_STARTUP ?? 'true').trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(setting)) return false;

  try {
    return validateTestAccounts();
  } catch (_) {
    return false;
  }
}

function testAccountsLogLines({ includePassword = true } = {}) {
  validateTestAccounts();
  return [
    'حساب‌های ثابت محیط توسعه و آزمایش:',
    ...TEST_ACCOUNTS.map((account) => {
      const base = `- ${account.roleLabel}: ${account.fullName} | نام کاربری: ${account.username}`;
      return includePassword ? `${base} | رمز عبور: ${DEFAULT_TEST_PASSWORD}` : base;
    })
  ];
}

function printTestAccounts(logger = console.log) {
  for (const line of testAccountsLogLines({ includePassword: true })) logger(line);
}

module.exports = {
  DEFAULT_TEST_PASSWORD,
  TEST_ACCOUNTS,
  loadLocalTestAccountEnv,
  validateTestAccounts,
  shouldShowTestAccounts,
  testAccountsLogLines,
  printTestAccounts
};
