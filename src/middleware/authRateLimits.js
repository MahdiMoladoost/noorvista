'use strict';

const rateLimit = require('express-rate-limit');

function jsonMessage(message) {
  return { success: false, message };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: jsonMessage('تلاش‌های ورود بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید')
});

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('درخواست کد تأیید بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید')
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: jsonMessage('تلاش‌های تأیید کد بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید')
});

const passwordResetLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('درخواست بازیابی رمز بیش از حد مجاز است؛ بعداً دوباره تلاش کنید')
});

module.exports = { loginLimiter, otpRequestLimiter, otpVerifyLimiter, passwordResetLimiter };
