// src/routes/patients.js
const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const router = createAsyncRouter(express);
const { protect, restrictTo, isPatient } = require('../middleware/auth');
const patientController = require('../controllers/patientController');

router.use(protect);
router.use(restrictTo('patient'));
router.use(isPatient);

router.get('/stats', patientController.getDashboardStats);
router.get('/profile', patientController.getProfile);
router.put('/profile', patientController.updateProfile);

router.get('/appointments', patientController.getMyAppointments);
router.post('/appointments', patientController.bookAppointment);
router.put('/appointments/:id/cancel', patientController.cancelAppointment);

router.get('/doctors', patientController.getAvailableDoctors);
router.get('/doctors/:doctorId/services', patientController.getDoctorServices);
router.get('/doctors/:doctorId/schedule', patientController.getDoctorSchedule);
router.get('/available-dates', patientController.getAvailableDates);
router.get('/available-slots', patientController.getAvailableTimeSlots);

router.get('/medical-records', patientController.getMyMedicalRecords);
router.get('/prescriptions', patientController.getMyPrescriptions);
router.get('/payments', patientController.getMyPayments);
router.get('/payments/checkout/:token', patientController.getCheckoutPreview);
router.post('/payments/checkout/:token/test-complete', patientController.completeCheckoutTestPayment);
router.post('/payments/checkout/:token/cancel', patientController.cancelCheckoutPayment);
router.get('/payments/test/:appointmentId', patientController.getTestPaymentPreview);
router.post('/payments/test/:appointmentId/complete', patientController.completeTestPayment);
router.post('/payments/test/:appointmentId/cancel', patientController.cancelTestPayment);

module.exports = router;