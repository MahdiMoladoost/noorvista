-- 2026-06-22-supplementary-insurance-booking-21114.sql
-- Supplementary insurance-aware online booking without changing the internal patient role or appointment state machine.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS supplementary_insurance_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplementary_insurance_payment_mode VARCHAR(40) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS supplementary_insurance_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplementary_insurance_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplementary_insurance_requires_review TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supplementary_insurance_attachment_required TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplementary_insurance_notice TEXT NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS original_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS online_payable_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_policy VARCHAR(60) NOT NULL DEFAULT 'standard_full_payment',
  ADD COLUMN IF NOT EXISTS has_supplementary_insurance TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_status VARCHAR(60) NULL,
  ADD COLUMN IF NOT EXISTS insurance_provider VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS insurance_number VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS insurance_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS insurance_attachment_url VARCHAR(500) NULL;

ALTER TABLE appointment_payment_reservations
  ADD COLUMN IF NOT EXISTS original_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS online_payable_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_policy VARCHAR(60) NOT NULL DEFAULT 'standard_full_payment',
  ADD COLUMN IF NOT EXISTS has_supplementary_insurance TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_status VARCHAR(60) NULL,
  ADD COLUMN IF NOT EXISTS insurance_provider VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS insurance_number VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS insurance_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS insurance_attachment_url VARCHAR(500) NULL;

UPDATE appointments
SET original_amount = CASE WHEN COALESCE(original_amount, 0) = 0 THEN COALESCE(amount, 0) ELSE original_amount END,
    online_payable_amount = CASE WHEN COALESCE(online_payable_amount, 0) = 0 THEN COALESCE(amount, 0) ELSE online_payable_amount END
WHERE COALESCE(original_amount, 0) = 0 OR COALESCE(online_payable_amount, 0) = 0;

UPDATE appointment_payment_reservations
SET original_amount = CASE WHEN COALESCE(original_amount, 0) = 0 THEN COALESCE(amount, 0) ELSE original_amount END,
    online_payable_amount = CASE WHEN COALESCE(online_payable_amount, 0) = 0 THEN COALESCE(amount, 0) ELSE online_payable_amount END
WHERE COALESCE(original_amount, 0) = 0 OR COALESCE(online_payable_amount, 0) = 0;

CREATE INDEX idx_appointments_insurance_status ON appointments (has_supplementary_insurance, insurance_status);
CREATE INDEX idx_reservations_insurance_status ON appointment_payment_reservations (has_supplementary_insurance, insurance_status);
