// src/routes/clinic.js
const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const router = createAsyncRouter(express);
const { protect, restrictTo } = require('../middleware/auth');
const clinicController = require('../controllers/clinicController');

// تمام مسیرهای پنل کلینیک فقط برای پرسنل مجاز هستند.
// نام‌های قدیمی نقش‌ها برای سازگاری با داده‌های موجود پشتیبانی می‌شوند،
// اما کنترل دسترسی همچنان در Backend انجام می‌شود.
const CLINIC_STAFF_ROLES = [
  'receptionist', 'reception', 'secretary', 'staff',
  'clinic_admin', 'clinic_manager', 'manager',
  'admin', 'system_admin'
];
const CLINIC_ADMIN_ROLES = ['clinic_admin', 'clinic_manager', 'manager', 'admin', 'system_admin'];

router.use(protect, restrictTo(...CLINIC_STAFF_ROLES));

// ============ آمار داشبورد ============
router.get('/stats', clinicController.getDashboardStats);

// ============ نوبت‌های امروز ============
router.get('/appointments/today', clinicController.getTodayAppointments);

// ============ نوبت‌های در انتظار ============
router.get('/appointments/pending', clinicController.getPendingAppointments);

// ============ درآمد هفتگی ============
router.get('/revenue/weekly', clinicController.getWeeklyRevenue);

// ============ لیست کامل نوبت‌ها ============
router.get('/appointments', clinicController.getAllAppointments);
router.get('/appointments/:id', clinicController.getAppointmentById);
router.post('/appointments', clinicController.createAppointment);
router.put('/appointments/:id', clinicController.updateAppointment);
router.put('/appointments/:id/status', clinicController.updateAppointmentStatus);
router.put('/appointments/:id/confirm', clinicController.confirmAppointment);

router.put('/appointments/:id/cancel', clinicController.cancelAppointment);
router.delete('/appointments/:id', clinicController.deleteAppointment);

// ============ لیست پزشکان ============
router.get('/doctors', clinicController.getAllDoctors);
router.get('/doctors/:id', clinicController.getDoctorById);
router.post('/doctors', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.createDoctor);
router.put('/doctors/:id', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.updateDoctor);
router.put('/doctors/:id/status', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.toggleDoctorStatus);
router.delete('/doctors/:id', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.deleteDoctor);

// ============ لیست بیماران ============
router.get('/patients', clinicController.getAllPatients);
router.get('/patients/:id', clinicController.getPatientById);
router.post('/patients', clinicController.createPatient);
router.put('/patients/:id', clinicController.updatePatient);
router.delete('/patients/:id', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.deletePatient);

// ============ لیست پرسنل ============
router.get('/staff', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.getAllStaff);
router.get('/staff/:id', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.getStaffById);
router.post('/staff', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.createStaff);
router.put('/staff/:id', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.updateStaff);
router.put('/staff/:id/status', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.toggleStaffStatus);
router.delete('/staff/:id', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.deleteStaff);

// ============ لیست پرداخت‌ها ============
router.get('/payments', clinicController.getAllPayments);
router.post('/payments', clinicController.createPayment);
router.put('/payments/:id', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.updatePayment);
router.delete('/payments/:id', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.cancelPayment);
router.post('/payments/:id/approve', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.approvePayment);
router.post('/payments/:id/reject', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.rejectPayment);
router.get('/payments/:id/refunds', clinicController.getRefunds);
router.post('/payments/:id/refunds', clinicController.requestRefund);
router.post('/payments/refunds/:refundId/approve', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.approveRefund);
router.post('/payments/refunds/:refundId/reject', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.rejectRefund);
router.post('/payments/refunds/:refundId/process', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.processRefund);

// ============ گزارشات ============
router.get('/reports', restrictTo(...CLINIC_ADMIN_ROLES), clinicController.getReports);

module.exports = router;