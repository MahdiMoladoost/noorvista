// src/routes/appointments.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const appointmentController = require('../controllers/appointmentController');

// Validation rules can be added if needed

// Routes
router.get('/', protect, appointmentController.getAppointments);
router.get('/available-slots', protect, appointmentController.getAvailableSlots);
router.get('/:id', protect, appointmentController.getAppointmentById);
router.post('/', protect, appointmentController.createAppointment);
router.put('/:id/status', protect, appointmentController.updateAppointmentStatus);

module.exports = router;