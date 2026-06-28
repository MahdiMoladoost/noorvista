-- Complete schema previously created or altered at request time, plus MFA/session management.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS national_code VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS birth_date DATE NULL,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS address TEXT NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS insurance_provider VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS insurance_number VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS allergies TEXT NULL,
  ADD COLUMN IF NOT EXISTS medications TEXT NULL,
  ADD COLUMN IF NOT EXISTS chronic_diseases TEXT NULL,
  ADD COLUMN IF NOT EXISTS medical_history TEXT NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

ALTER TABLE doctor_schedules
  ADD COLUMN IF NOT EXISTS booking_window_days INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS reminder_enabled TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reminder_before_minutes INT NOT NULL DEFAULT 1440;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS reminder_status VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS reminder_error TEXT NULL;

ALTER TABLE auth_refresh_tokens
  ADD COLUMN IF NOT EXISTS last_used_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS mfa_verified TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS auth_mfa (
  user_id INT PRIMARY KEY,
  secret_encrypted TEXT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  enabled_at DATETIME NULL,
  disabled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_auth_mfa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

CREATE TABLE IF NOT EXISTS auth_mfa_recovery_codes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mfa_recovery_hash (user_id, code_hash),
  INDEX idx_mfa_recovery_available (user_id, used_at),
  CONSTRAINT fk_mfa_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
