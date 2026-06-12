const winston = require('winston');
const path = require('path');

// Define log directory
const logDir = path.join(__dirname, '../../logs');

// Create logs directory if not exists
const fs = require('fs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'noorvista' },
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // Error log file
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    // Combined log file
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
  ]
});

module.exports = logger;
