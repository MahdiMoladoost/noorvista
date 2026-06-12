// src/middleware/errorHandler.js
const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'خطای داخلی سرور';

  // لاگ کردن خطا
  logger.error({
    message: message,
    statusCode,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    userId: req.user?.id,
    ip: req.ip
  });

  // پاسخ به کاربر
  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'خطای داخلی سرور رخ داد' : message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;