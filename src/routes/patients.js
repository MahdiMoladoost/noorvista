// src/routes/patients.js
const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const patientController = require('../controllers/patientController');

router.use(protect);
router.use(restrictTo('patient'));

router.get('/stats', patientController.getDashboardStats);
router.get('/profile', patientController.getProfile);
router.put('/profile', patientController.updateProfile);

router.get('/appointments', patientController.getMyAppointments);
router.post('/appointments', patientController.bookAppointment);
router.put('/appointments/:id/cancel', patientController.cancelAppointment);

router.get('/doctors', patientController.getAvailableDoctors);
router.get('/doctors/:doctorId/schedule', patientController.getDoctorSchedule);
router.get('/available-slots', patientController.getAvailableTimeSlots);

router.get('/medical-records', patientController.getMyMedicalRecords);
router.get('/prescriptions', patientController.getMyPrescriptions);

module.exports = router;