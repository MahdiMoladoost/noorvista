-- 2026-06-07-appointment-architecture-fix.sql
-- Patch for existing NOORVISTA databases.
-- Fixes old services table missing slug/default_capacity/default_duration_minutes.

ALTER TABLE services ADD COLUMN slug VARCHAR(200) NULL AFTER name;
ALTER TABLE services ADD COLUMN category VARCHAR(100) NULL AFTER slug;
ALTER TABLE services ADD COLUMN description TEXT NULL AFTER category;
ALTER TABLE services ADD COLUMN default_capacity INT NOT NULL DEFAULT 1 AFTER description;
ALTER TABLE services ADD COLUMN default_duration_minutes INT NOT NULL DEFAULT 30 AFTER default_capacity;
ALTER TABLE services ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER default_duration_minutes;
ALTER TABLE services ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE services ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- اگر خطای Duplicate column گرفتید، یعنی runtime ensure همین کار را انجام داده و می‌توانید ادامه دهید.
-- slug ردیف‌های قدیمی توسط src/routes/appointmentArchitecture.js در زمان اجرای API پر می‌شود.
