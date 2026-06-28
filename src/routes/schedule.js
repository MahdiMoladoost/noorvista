// src/routes/schedule.js
const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const router = createAsyncRouter(express);
const { protect } = require('../middleware/auth');
const scheduleController = require('../controllers/scheduleController');

// زمان‌بندی پزشکان
router.get('/doctor/:doctorId/schedule', protect, scheduleController.getDoctorSchedule);
router.post('/doctor/schedule', protect, scheduleController.saveDoctorSchedule);

// نوبت‌ها
router.post('/appointments', protect, scheduleController.bookAppointment);
router.get('/doctor/:doctorId/appointments', protect, scheduleController.getDoctorAppointments);
router.put('/appointments/:id/status', protect, scheduleController.updateAppointmentStatus);
router.delete('/appointments/:id', protect, scheduleController.cancelAppointment);

// مرخصی‌ها
router.get('/doctor/:doctorId/leaves', protect, scheduleController.getDoctorLeaves);
router.post('/doctor/leaves', protect, scheduleController.addDoctorLeave);
router.delete('/doctor/leaves/:id', protect, scheduleController.deleteDoctorLeave);

module.exports = router;