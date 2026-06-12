// src/routes/appointmentQueueSms.js
// NOORVISTA - Appointment queue number + SMS confirmation endpoints

const express = require('express');
const db = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth');
const appointmentConfirmationSms = require('../services/appointmentConfirmationSms');

const router = express.Router();
const managerOnly = [protect, restrictTo('system_admin', 'admin', 'clinic_admin', 'clinic_manager', 'manager', 'secretary', 'reception', 'receptionist', 'staff')];

function activeStatusSql() {
    return "COALESCE(status, 'pending') NOT IN ('cancelled','canceled','deleted','rejected')";
}

async function ensureQueueColumns(connection) {
    await appointmentConfirmationSms.ensureSmsColumns(connection);
}

async function nextQueueNumberForAppointment(connection, appointment) {
    if (!appointment.appointment_slot_id) return appointment.appointment_queue_number || 1;

    const [slotRows] = await connection.query('SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE', [appointment.appointment_slot_id]);
    const slot = slotRows[0];
    const capacity = Math.max(Number(slot && slot.capacity || 1), 1);

    const [rows] = await connection.query(
        `SELECT appointment_queue_number
         FROM appointments
         WHERE appointment_slot_id = ?
           AND id <> ?
           AND appointment_queue_number IS NOT NULL
           AND ${activeStatusSql()}
         ORDER BY appointment_queue_number ASC
         FOR UPDATE`,
        [appointment.appointment_slot_id, appointment.id]
    );

    const used = new Set(rows.map(row => Number(row.appointment_queue_number)).filter(n => Number.isFinite(n) && n > 0));
    for (let i = 1; i <= capacity; i += 1) {
        if (!used.has(i)) return i;
    }

    const err = new Error('ظرفیت این نوبت تکمیل شده است');
    err.statusCode = 409;
    throw err;
}

async function confirmAppointment(req, res, next) {
    let connection;
    let appointmentId = Number(req.params.id);
    try {
        const pool = req.db || await db.getPool();
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await ensureQueueColumns(connection);

        const [rows] = await connection.query('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [appointmentId]);
        const appointment = rows[0];
        if (!appointment) {
            const err = new Error('نوبت یافت نشد');
            err.statusCode = 404;
            throw err;
        }

        const queueNumber = appointment.appointment_queue_number || await nextQueueNumberForAppointment(connection, appointment);

        await connection.query(
            `UPDATE appointments
             SET status = 'confirmed',
                 appointment_queue_number = ?,
                 confirmed_at = COALESCE(confirmed_at, NOW())
             WHERE id = ?`,
            [queueNumber, appointmentId]
        );

        await connection.commit();

        const sms = await appointmentConfirmationSms.sendAppointmentConfirmationSms(pool, appointmentId);

        res.json({
            success: true,
            appointment_id: appointmentId,
            appointment_queue_number: queueNumber,
            queue_number: queueNumber,
            sms,
            message: `نوبت با موفقیت تأیید شد. شماره نوبت: ${queueNumber}`
        });
    } catch (error) {
        if (connection) await connection.rollback();
        next(error);
    } finally {
        if (connection) connection.release();
    }
}

router.put('/clinic/appointments/:id/confirm', managerOnly, confirmAppointment);
router.patch('/clinic/appointments/:id/confirm', managerOnly, confirmAppointment);
router.put('/admin/appointments/:id/confirm', managerOnly, confirmAppointment);
router.patch('/admin/appointments/:id/confirm', managerOnly, confirmAppointment);
router.put('/appointments/:id/confirm', managerOnly, confirmAppointment);
router.patch('/appointments/:id/confirm', managerOnly, confirmAppointment);

module.exports = router;
