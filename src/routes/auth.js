// src/routes/auth.js
const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const router = createAsyncRouter(express);
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginLimiter, otpRequestLimiter, otpVerifyLimiter, passwordResetLimiter } = require('../middleware/authRateLimits');
const { issueCsrfToken } = require('../middleware/csrf');

// مسیرهای عمومی
router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.post('/request-otp', otpRequestLimiter, authController.requestOTP);
router.post('/verify-otp', otpVerifyLimiter, authController.verifyOTP);
router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, authController.resetPassword);
router.post('/password-reset/request-otp', passwordResetLimiter, authController.requestPasswordResetOtp);
router.post('/password-reset/verify-otp', passwordResetLimiter, authController.verifyPasswordResetOtp);
router.post('/password-reset/confirm', passwordResetLimiter, authController.confirmPasswordResetOtp);
router.get('/check', authController.checkAuth);
router.get('/csrf-token', (req, res) => res.json({ success: true, csrf_token: issueCsrfToken(req, res) }));
router.post('/refresh-token', authController.refreshToken);
router.post('/2fa/verify-login', otpVerifyLimiter, authController.verifyTwoFactorLogin);
router.get('/2fa/status', authController.mfaSubject, authController.getTwoFactorStatus);
router.post('/2fa/setup', authController.mfaSubject, authController.setupTwoFactor);
router.post('/2fa/enable', authController.mfaSubject, authController.enableTwoFactor);

// مسیرهای نیازمند احراز هویت
router.get('/me', protect, authController.getMe);
router.post('/change-password', protect, authController.changePassword);
router.put('/profile', protect, authController.updateProfile);
router.patch('/profile', protect, authController.updateProfile);
router.put('/me', protect, authController.updateProfile);
router.patch('/me', protect, authController.updateProfile);
router.post('/2fa/disable', protect, authController.disableTwoFactor);
router.get('/sessions', protect, authController.listSessions);
router.delete('/sessions/others', protect, authController.revokeOtherSessions);
router.delete('/sessions/:id', protect, authController.revokeSession);

module.exports = router;