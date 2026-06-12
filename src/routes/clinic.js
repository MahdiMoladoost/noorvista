// src/routes/clinic.js
const express = require('express');
const router = express.Router();
const { protect, restrictTo, isClinicAdmin } = require('../middleware/auth');
const clinicController = require('../controllers/clinicController');

// ============ آمار داشبورد ============
router.get('/stats', protect, clinicController.getDashboardStats);

// ============ نوبت‌های امروز ============
router.get('/appointments/today', protect, clinicController.getTodayAppointments);

// ============ نوبت‌های در انتظار ============
router.get('/appointments/pending', protect, clinicController.getPendingAppointments);

// ============ درآمد هفتگی ============
router.get('/revenue/weekly', protect, clinicController.getWeeklyRevenue);

// ============ لیست کامل نوبت‌ها ============
router.get('/appointments', protect, clinicController.getAllAppointments);
router.get('/appointments/:id', protect, clinicController.getAppointmentById);
router.post('/appointments', protect, clinicController.createAppointment);
router.put('/appointments/:id', protect, clinicController.updateAppointment);
router.put('/appointments/:id/status', protect, clinicController.updateAppointmentStatus);
router.put('/appointments/:id/confirm', protect, clinicController.confirmAppointment);
router.put('/appointments/:id/cancel', protect, clinicController.cancelAppointment);
router.delete('/appointments/:id', protect, clinicController.deleteAppointment);

// ============ لیست پزشکان ============
router.get('/doctors', protect, clinicController.getAllDoctors);
router.get('/doctors/:id', protect, clinicController.getDoctorById);
router.post('/doctors', protect, restrictTo('clinic_admin', 'system_admin'), clinicController.createDoctor);
router.put('/doctors/:id', protect, restrictTo('clinic_admin', 'system_admin'), clinicController.updateDoctor);
router.put('/doctors/:id/status', protect, restrictTo('clinic_admin', 'system_admin'), clinicController.toggleDoctorStatus);
router.delete('/doctors/:id', protect, restrictTo('clinic_admin', 'system_admin'), clinicController.deleteDoctor);

// ============ لیست بیماران ============
router.get('/patients', protect, clinicController.getAllPatients);
router.get('/patients/:id', protect, clinicController.getPatientById);
router.post('/patients', protect, clinicController.createPatient);
router.delete('/patients/:id', protect, restrictTo('clinic_admin', 'system_admin'), clinicController.deletePatient);

// ============ لیست پرسنل ============
router.get('/staff', protect, restrictTo('clinic_admin', 'system_admin'), clinicController.getAllStaff);
router.post('/staff', protect, restrictTo('clinic_admin', 'system_admin'), clinicController.createStaff);
router.put('/staff/:id/status', protect, restrictTo('clinic_admin', 'system_admin'), clinicController.toggleStaffStatus);
router.delete('/staff/:id', protect, restrictTo('clinic_admin', 'system_admin'), clinicController.deleteStaff);

// ============ لیست پرداخت‌ها ============
router.get('/payments', protect, clinicController.getAllPayments);
router.post('/payments', protect, clinicController.createPayment);

// ============ گزارشات ============
router.get('/reports', protect, restrictTo('clinic_admin', 'system_admin'), clinicController.getReports);

module.exports = router;