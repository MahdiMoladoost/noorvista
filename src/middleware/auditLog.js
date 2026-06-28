// src/middleware/auditLog.js
const logger = require('../config/logger');

const auditLog = (action, details = {}) => {
  return async (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info({
        type: 'AUDIT',
        action,
        userId: req.user?.id || null,
        userRole: req.user?.role || null,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        ...details
      });
    });

    next();
  };
};

module.exports = auditLog;