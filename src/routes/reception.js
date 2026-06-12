const express = require('express');
const router = express.Router();
const receptionController = require('../controllers/receptionController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// Receptionist routes
router.use(authMiddleware, roleMiddleware('receptionist'));

// Dashboard
router.get('/stats', receptionController.getStats);

// Appointment management
router.get('/appointments', receptionController.getAppointments);
router.post('/appointments', receptionController.createAppointment);
router.put('/appointments/:id', receptionController.updateAppointment);
router.delete('/appointments/:id', receptionController.cancelAppointment);

// Patient registration
router.get('/patients', receptionController.getPatients);
router.post('/patients', receptionController.registerPatient);
router.get('/patients/search', receptionController.searchPatients);

// Doctor availability
router.get('/doctors/available', receptionController.getAvailableDoctors);
router.get('/doctors/:id/slots', receptionController.getDoctorAvailableSlots);

// Payments
router.get('/payments', receptionController.getPayments);
router.post('/payments', receptionController.createPayment);

module.exports = router;