'use strict';

const { normalizePatientPayload, patientValidationError } = require('../utils/patientProfile');

class PatientProfileError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'PatientProfileError';
    this.statusCode = statusCode;
  }
}

async function rows(connection, sql, params = []) {
  const [result] = await connection.query(sql, params);
  return Array.isArray(result) ? result : [];
}

async function columns(connection, table) {
  const [result] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set((result || []).map(item => item.Field));
}

async function updateClinicPatient(pool, patientIdInput, body = {}) {
  const patientId = Number(patientIdInput);
  if (!Number.isInteger(patientId) || patientId < 1) {
    throw new PatientProfileError(400, 'شناسه بیمار معتبر نیست');
  }

  const values = normalizePatientPayload(body);
  const validationError = patientValidationError(values);
  if (validationError) throw new PatientProfileError(400, validationError);

  const connection = typeof pool.getConnection === 'function' ? await pool.getConnection() : pool;
  const shouldRelease = connection !== pool && typeof connection.release === 'function';
  let transactionStarted = false;

  try {
    if (typeof connection.beginTransaction === 'function') {
      await connection.beginTransaction();
      transactionStarted = true;
    }

    const patientRows = await rows(
      connection,
      'SELECT id, user_id FROM patients WHERE id = ? LIMIT 1 FOR UPDATE',
      [patientId]
    );
    if (!patientRows.length) throw new PatientProfileError(404, 'بیمار یافت نشد');

    const patient = patientRows[0];
    const userColumns = await columns(connection, 'users');
    const patientColumns = await columns(connection, 'patients');

    if (userColumns.has('phone')) {
      const duplicatePhones = await rows(
        connection,
        'SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1 FOR UPDATE',
        [values.phone, patient.user_id]
      );
      if (duplicatePhones.length) throw new PatientProfileError(409, 'این شماره موبایل قبلاً ثبت شده است');
    }

    if (values.nationalCode && patientColumns.has('national_code')) {
      const duplicateCodes = await rows(
        connection,
        'SELECT id FROM patients WHERE national_code = ? AND id <> ? LIMIT 1 FOR UPDATE',
        [values.nationalCode, patientId]
      );
      if (duplicateCodes.length) throw new PatientProfileError(409, 'این کد ملی قبلاً ثبت شده است');
    }

    const userPayload = {};
    for (const key of ['full_name', 'fullname', 'name', 'display_name']) {
      if (userColumns.has(key)) userPayload[key] = values.fullName;
    }
    if (userColumns.has('phone')) userPayload.phone = values.phone;
    if (userColumns.has('mobile')) userPayload.mobile = values.phone;
    if (userColumns.has('email')) userPayload.email = values.email || null;
    if (userColumns.has('updated_at')) userPayload.updated_at = new Date();
    if (Object.keys(userPayload).length) {
      await connection.query('UPDATE users SET ? WHERE id = ?', [userPayload, patient.user_id]);
    }

    const patientPayload = {};
    for (const key of ['full_name', 'fullname', 'name']) {
      if (patientColumns.has(key)) patientPayload[key] = values.fullName;
    }
    if (patientColumns.has('phone')) patientPayload.phone = values.phone;
    if (patientColumns.has('mobile')) patientPayload.mobile = values.phone;
    if (patientColumns.has('email')) patientPayload.email = values.email || null;
    if (patientColumns.has('national_code')) patientPayload.national_code = values.nationalCode || null;
    if (patientColumns.has('birth_date')) patientPayload.birth_date = values.birthDate || null;
    if (patientColumns.has('gender')) patientPayload.gender = values.gender || null;
    if (patientColumns.has('address')) patientPayload.address = values.address || null;
    if (patientColumns.has('emergency_contact_name')) patientPayload.emergency_contact_name = values.emergencyContactName || null;
    if (patientColumns.has('emergency_contact_phone')) patientPayload.emergency_contact_phone = values.emergencyContactPhone || null;
    if (patientColumns.has('insurance_provider')) patientPayload.insurance_provider = values.insuranceProvider || null;
    if (patientColumns.has('insurance_number')) patientPayload.insurance_number = values.insuranceNumber || null;
    if (patientColumns.has('allergies')) patientPayload.allergies = values.allergies || null;
    if (patientColumns.has('medications')) patientPayload.medications = values.medications || null;
    if (patientColumns.has('chronic_diseases')) patientPayload.chronic_diseases = values.chronicDiseases || null;
    if (patientColumns.has('medical_history')) patientPayload.medical_history = values.medicalHistory || null;
    if (patientColumns.has('notes')) patientPayload.notes = values.notes || null;
    if (patientColumns.has('updated_at')) patientPayload.updated_at = new Date();
    if (!Object.keys(patientPayload).length) {
      throw new PatientProfileError(500, 'ساختار جدول بیماران قابل ویرایش نیست');
    }
    await connection.query('UPDATE patients SET ? WHERE id = ?', [patientPayload, patientId]);

    if (transactionStarted) {
      await connection.commit();
      transactionStarted = false;
    }
    return { success: true, message: 'اطلاعات بیمار به‌روزرسانی شد' };
  } catch (error) {
    if (transactionStarted && typeof connection.rollback === 'function') {
      await connection.rollback().catch(() => {});
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new PatientProfileError(409, 'اطلاعات هویتی یا تماس بیمار تکراری است');
    }
    throw error;
  } finally {
    if (shouldRelease) connection.release();
  }
}

module.exports = {
  PatientProfileError,
  updateClinicPatient
};
