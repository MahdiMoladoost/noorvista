'use strict';

const logger = require('../config/logger');

const SAFE_CLIENT_CODES = new Set(['VALIDATION_ERROR', 'MIGRATION_REQUIRED', 'NOT_FOUND', 'CONFLICT']);

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const requestedStatus = Number(err.statusCode || err.status || 500);
  const statusCode = requestedStatus >= 400 && requestedStatus < 600 ? requestedStatus : 500;
  const correlationId = req.correlationId || null;

  logger.error({
    event: 'request_error',
    correlationId,
    statusCode,
    errorCode: err.code,
    message: err.message,
    method: req.method,
    path: req.originalUrl || req.path,
    userId: req.user?.id || null,
    userRole: req.user?.role || null,
    ip: req.ip,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  const expose = statusCode < 500 || SAFE_CLIENT_CODES.has(err.code);
  return res.status(statusCode).json({
    success: false,
    message: expose ? String(err.message || 'درخواست نامعتبر است') : 'خطای داخلی سرور رخ داد',
    code: expose && err.code ? err.code : undefined,
    correlation_id: correlationId
  });
}

module.exports = errorHandler;
