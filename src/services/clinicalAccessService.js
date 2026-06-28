'use strict';
const { assertSchema } = require('../database/schemaGuard');

async function ensureSchema(connection) {
  return assertSchema(connection, 'clinical break-glass', { tables: ['clinical_break_glass_requests'] });
}

function numericId(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

async function resolveDoctorPatientAccess(connection, { doctorId, patientId, appointmentId = null, scope = 'read' }) {
  const doctor = numericId(doctorId);
  const patient = numericId(patientId);
  const appointment = numericId(appointmentId);
  if (!doctor || !patient) return { allowed: false };

  if (appointment) {
    const [appointments] = await connection.query(
      `SELECT id FROM appointments
       WHERE id = ? AND doctor_id = ? AND patient_id = ?
         AND COALESCE(status, 'pending') NOT IN ('cancelled','canceled','deleted','rejected')
       LIMIT 1`,
      [appointment, doctor, patient]
    );
    if (appointments.length) return { allowed: true, source: 'appointment', appointment_id: appointments[0].id };
    return { allowed: false };
  }

  const [relationships] = await connection.query(
    `SELECT source, relation_id FROM (
        SELECT 'appointment' AS source, id AS relation_id, COALESCE(appointment_date, created_at) AS relation_date
        FROM appointments
        WHERE doctor_id = ? AND patient_id = ?
          AND COALESCE(status, 'pending') NOT IN ('cancelled','canceled','deleted','rejected')
        UNION ALL
        SELECT 'medical_record' AS source, id AS relation_id, record_date AS relation_date
        FROM medical_records
        WHERE doctor_id = ? AND patient_id = ?
        UNION ALL
        SELECT 'prescription' AS source, id AS relation_id, created_at AS relation_date
        FROM prescriptions
        WHERE doctor_id = ? AND patient_id = ?
     ) relations
     ORDER BY relation_date DESC
     LIMIT 1`,
    [doctor, patient, doctor, patient, doctor, patient]
  );
  if (relationships.length) {
    return {
      allowed: true,
      source: relationships[0].source || 'clinical_relationship',
      relation_id: relationships[0].relation_id
    };
  }

  await ensureSchema(connection);
  const [grants] = await connection.query(
    `SELECT id, access_scope, reason, approved_by, expires_at
     FROM clinical_break_glass_requests
     WHERE doctor_id = ? AND patient_id = ? AND status = 'approved' AND expires_at > NOW()
       AND (access_scope = 'write' OR ? = 'read')
     ORDER BY approved_at DESC LIMIT 1`,
    [doctor, patient, scope]
  );
  if (!grants.length) return { allowed: false };
  return { allowed: true, source: 'break_glass', grant: grants[0] };
}

async function recordBreakGlassUse(connection, grantId) {
  await connection.query(
    `UPDATE clinical_break_glass_requests SET last_used_at = NOW(), use_count = use_count + 1
     WHERE id = ? AND status = 'approved' AND expires_at > NOW()`, [grantId]
  );
}
module.exports = { ensureSchema, resolveDoctorPatientAccess, recordBreakGlassUse };
