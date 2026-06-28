const { getPool } = require('../config/db');
const appointmentStatusService = require('../services/appointmentStatusService');
const moment = require('moment-jalaali');

exports.getAppointments = async (req, res) => {
  try {
    const pool = await getPool();
    const { start_date, end_date, status, doctor_id } = req.query;
    let query = `
      SELECT a.*, 
             u.full_name as patient_name, u.phone as patient_phone,
             d.specialty as doctor_specialty,
             du.full_name as doctor_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users du ON d.user_id = du.id
      WHERE 1=1
    `;
    const params = [];
    
    if (start_date) {
      query += ' AND a.appointment_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND a.appointment_date <= ?';
      params.push(end_date);
    }
    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (doctor_id) {
      query += ' AND a.doctor_id = ?';
      params.push(doctor_id);
    }
    
    // Role-based filtering
    if (req.user.role === 'patient') {
      const [patient] = await pool.query('SELECT id FROM patients WHERE user_id = ?', [req.user.id]);
      if (patient.length) {
        query += ' AND a.patient_id = ?';
        params.push(patient[0].id);
      }
    } else if (req.user.role === 'doctor') {
      const [doctor] = await pool.query('SELECT id FROM doctors WHERE user_id = ?', [req.user.id]);
      if (doctor.length) {
        query += ' AND a.doctor_id = ?';
        params.push(doctor[0].id);
      }
    }
    
    query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
    
    const [appointments] = await pool.query(query, params);
    
    // Convert dates to Persian calendar
    const formattedAppointments = appointments.map(apt => ({
      ...apt,
      appointment_date_jalali: moment(apt.appointment_date).format('jYYYY/jMM/jDD'),
      created_at_jalali: moment(apt.created_at).format('jYYYY/jMM/jDD HH:mm')
    }));
    
    res.json({
      success: true,
      appointments: formattedAppointments
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ success: false, message: 'خطای داخلی سرور' });
  }
};

exports.getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    
    const [appointments] = await pool.query(`
      SELECT a.*, 
             u.full_name as patient_name, u.phone as patient_phone, u.email as patient_email,
             du.full_name as doctor_name, d.specialty
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users du ON d.user_id = du.id
      WHERE a.id = ?
        AND (
          ? IN ('system_admin','admin','clinic_admin','clinic_manager','manager','receptionist','reception')
          OR (? = 'patient' AND p.user_id = ?)
          OR (? = 'doctor' AND d.user_id = ?)
        )
    `, [id, req.user.role, req.user.role, req.user.id, req.user.role, req.user.id]);
    
    if (!appointments.length) {
      return res.status(404).json({ success: false, message: 'نوبت یافت نشد' });
    }
    
    res.json({
      success: true,
      appointment: {
        ...appointments[0],
        appointment_date_jalali: moment(appointments[0].appointment_date).format('jYYYY/jMM/jDD')
      }
    });
  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({ success: false, message: 'خطای داخلی سرور' });
  }
};

exports.createAppointment = async (req, res) => {
  try {
    const { doctor_id, appointment_date, appointment_time, type, reason } = req.body;
    const pool = await getPool();
    let patientId = Number(req.body.patient_id || 0);
    if (req.user.role === 'patient') {
      const [mine] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [req.user.id]);
      patientId = Number(mine[0]?.id || 0);
    } else if (!['system_admin','admin','clinic_admin','clinic_manager','manager','receptionist','reception'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'اجازه ثبت نوبت برای بیمار دیگر را ندارید' });
    }
    if (!patientId) return res.status(400).json({ success: false, message: 'بیمار معتبر انتخاب نشده است' });
    
    // Check if slot is available
    const [existing] = await pool.query(
      'SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status NOT IN ("cancelled")',
      [doctor_id, appointment_date, appointment_time]
    );
    
    if (existing.length) {
      return res.status(400).json({ 
        success: false, 
        message: 'این زمان توسط پزشک قبلاً رزرو شده است' 
      });
    }
    
    // Get consultation fee
    const [doctor] = await pool.query('SELECT consultation_fee FROM doctors WHERE id = ?', [doctor_id]);
    const amount = doctor[0]?.consultation_fee || 0;
    
    const [result] = await pool.query(`
      INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, type, reason, amount, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [patientId, doctor_id, appointment_date, appointment_time, type, reason, amount, req.user.id]);
    
    // Create notification for doctor
    const [patient] = await pool.query(`
      SELECT u.full_name FROM patients p JOIN users u ON p.user_id = u.id WHERE p.id = ?
    `, [patientId]);
    
    await pool.query(`
      INSERT INTO notifications (user_id, title, message, type, link)
      SELECT d.user_id, 'نوبت جدید', CONCAT('نوبت جدید برای بیمار ', ?, ' در تاریخ ', ?, ' ساعت ', ?, ' ثبت شد'), 'info',
             CONCAT('/dashboard/panel/doctor?appointment=', LAST_INSERT_ID())
      FROM doctors d WHERE d.id = ?
    `, [patient[0]?.full_name || '', appointment_date, appointment_time, doctor_id]);
    
    res.status(201).json({
      success: true,
      message: 'نوبت با موفقیت ثبت شد',
      appointment_id: result.insertId
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ success: false, message: 'خطای داخلی سرور' });
  }
};

exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const pool = await getPool();
    await appointmentStatusService.transition(pool, {
      appointmentId: id,
      targetStatus: status,
      notes,
      expectedDoctorId: req.user.role === 'doctor' ? req.user.doctor_id : null,
      actor: { id: req.user.id, requestId: req.correlationId, ip: req.ip }
    });

    const [patient] = await pool.query(`
      SELECT p.user_id FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.id = ?
    `, [id]);
    const statusMessages = { confirmed: 'تأیید شد', cancelled: 'لغو شد', completed: 'انجام شد', no_show: 'عدم حضور', rescheduled: 'جابه‌جا شد' };
    if (patient.length) {
      await pool.query(`INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, 'تغییر وضعیت نوبت', CONCAT('وضعیت نوبت شما به ', ?, ' تغییر یافت'), ?)`,
      [patient[0].user_id, statusMessages[status] || status, status === 'cancelled' ? 'error' : 'info']);
    }
    return res.json({ success: true, message: 'وضعیت نوبت با موفقیت تغییر کرد' });
  } catch (error) {
    console.error('Update appointment status error:', error.message);
    return appointmentStatusService.sendTransitionError(res, error);
  }
};

exports.getAvailableSlots = async (req, res) => {
  try {
    const { doctor_id, date } = req.query;
    const pool = await getPool();
    
    // Define working hours (can be dynamic from settings)
    const workingHours = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
      '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
    ];
    
    // Get booked slots
    const [booked] = await pool.query(
      'SELECT appointment_time FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status NOT IN ("cancelled")',
      [doctor_id, date]
    );
    
    const bookedTimes = booked.map(b => b.appointment_time);
    const availableSlots = workingHours.filter(time => !bookedTimes.includes(time));
    
    res.json({
      success: true,
      available_slots: availableSlots
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({ success: false, message: 'خطای داخلی سرور' });
  }
};