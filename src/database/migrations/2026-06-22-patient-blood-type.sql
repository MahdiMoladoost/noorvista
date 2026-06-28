-- Runtime compatibility fix for /api/auth/me patient profile select.
-- Safe for existing databases; the migration runner skips duplicate-column errors.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS blood_type VARCHAR(10) NULL AFTER gender;
