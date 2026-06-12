// src/routes/admin.js
const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

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

// ==================== مدیریت نوبت‌ها ====================
router.get('/appointments', adminController.getAppointments);
router.get('/appointments/:id', adminController.getAppointmentById);
router.post('/appointments', adminController.createAppointment);
router.put('/appointments/:id', adminController.updateAppointment);
router.delete('/appointments/:id', adminController.deleteAppointment);

// ==================== لاگ‌های سیستم ====================
router.get('/logs', adminController.getSystemLogs);

// ==================== تنظیمات سیستم ====================
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

// ==================== پشتیبان‌گیری ====================
router.get('/backups', adminController.getBackups);
router.post('/backup', adminController.createBackup);

module.exports = router;