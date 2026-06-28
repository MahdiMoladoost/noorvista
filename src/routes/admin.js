// src/routes/admin.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { createAsyncRouter } = require('../utils/asyncRouter');
const router = createAsyncRouter(express);
const { protect, restrictTo } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

const sqlExportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'تعداد درخواست‌های دریافت SQL بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید' }
});

const databaseResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'تعداد درخواست‌های پاک‌سازی پایگاه داده بیش از حد مجاز است؛ بعداً دوباره تلاش کنید' }
});

// همه مسیرها نیاز به احراز هویت و نقش ادمین سیستم دارند
router.use(protect);
router.use(restrictTo('system_admin'));

// ==================== آمار و داشبورد ====================
router.get('/stats', adminController.getStats);

// ==================== مدیریت کاربران ====================
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.put('/users/:id/status', adminController.toggleUserStatus);
router.delete('/users/:id', adminController.deleteUser);

// ==================== مدیریت پزشکان ====================
router.get('/doctors', adminController.getDoctors);
router.get('/doctors/:id/slots', adminController.getDoctorAvailableSlots);

// ==================== مدیریت بیماران ====================
router.get('/patients', adminController.getPatients);
router.get('/patients/:id', adminController.getPatientById);
router.post('/patients', adminController.createPatient);
router.put('/patients/:id', adminController.updatePatient);
router.delete('/patients/:id', adminController.deletePatient);

// ==================== مدیریت نوبت‌ها ====================
router.get('/appointments', adminController.getAppointments);
router.get('/appointments/:id', adminController.getAppointmentById);
router.post('/appointments', adminController.createAppointment);
router.put('/appointments/:id', adminController.updateAppointment);
router.delete('/appointments/:id', adminController.deleteAppointment);

// ==================== لاگ‌های سیستم ====================
router.get('/logs', adminController.getSystemLogs);

// ==================== تنظیمات سیستم ====================



// ==================== پشتیبان‌گیری ====================
router.get('/backups', adminController.getBackups);
router.post('/backup', adminController.createBackup);
router.post('/backup/export-sql', sqlExportLimiter, adminController.exportDatabaseSql);
router.get('/database/maintenance-status', adminController.getDatabaseMaintenanceStatus);
router.post('/database/reset', databaseResetLimiter, adminController.resetDatabase);

module.exports = router;