// src/routes/doctor.js
const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const doctorController = require('../controllers/doctorController');

router.use(protect);
router.use(restrictTo('doctor'));

router.get('/stats', doctorController.getDashboardStats);
router.get('/profile', doctorController.getProfile);
router.put('/profile', doctorController.updateProfile);

router.get('/appointments/today', doctorController.getTodayAppointments);
router.get('/appointments', doctorController.getMyAppointments);
router.put('/appointments/:id/status', doctorController.updateAppointmentStatus);

router.get('/patients', doctorController.getMyPatients);
router.get('/patients/:patientId/medical-records', doctorController.getPatientMedicalRecord);

router.get('/medical-records', doctorController.getMedicalRecords);
router.post('/medical-records', doctorController.addMedicalRecord);

router.get('/prescriptions', doctorController.getMyPrescriptions);
router.post('/prescriptions', doctorController.addPrescription);

router.get('/schedule', doctorController.getSchedule);
router.put('/schedule', doctorController.updateSchedule);

module.exports = router;