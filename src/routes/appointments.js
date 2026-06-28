// src/routes/appointments.js
const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const router = createAsyncRouter(express);
const { protect, restrictTo } = require('../middleware/auth');
const appointmentController = require('../controllers/appointmentController');

// Validation rules can be added if needed

// Routes
router.get('/', protect, appointmentController.getAppointments);
router.get('/available-slots', protect, appointmentController.getAvailableSlots);
router.get('/:id', protect, appointmentController.getAppointmentById);
router.post('/', protect, appointmentController.createAppointment);
router.put('/:id/status', protect, restrictTo('doctor', 'receptionist', 'clinic_admin', 'system_admin'), appointmentController.updateAppointmentStatus);

module.exports = router;