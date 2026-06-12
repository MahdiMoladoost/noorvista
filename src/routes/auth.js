// src/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// مسیرهای عمومی
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/request-otp', authController.requestOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/check', authController.checkAuth);
router.get('/refresh-token', authController.refreshToken);

// مسیرهای نیازمند احراز هویت
router.get('/me', protect, authController.getMe);
router.post('/change-password', protect, authController.changePassword);
router.put('/profile', protect, authController.updateProfile);
router.patch('/profile', protect, authController.updateProfile);
router.put('/me', protect, authController.updateProfile);
router.patch('/me', protect, authController.updateProfile);

module.exports = router;