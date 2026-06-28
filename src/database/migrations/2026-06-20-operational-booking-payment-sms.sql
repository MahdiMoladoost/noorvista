-- Operational public booking, ZarinPal callback hardening and appointment SMS tracking.

ALTER TABLE appointment_payment_reservations
  ADD COLUMN IF NOT EXISTS callback_token_hash CHAR(64) NULL AFTER token_hash,
  ADD COLUMN IF NOT EXISTS gateway_requested_at DATETIME NULL AFTER expires_at,
  ADD COLUMN IF NOT EXISTS gateway_callback_at DATETIME NULL AFTER gateway_requested_at,
  ADD COLUMN IF NOT EXISTS payment_context VARCHAR(30) NOT NULL DEFAULT 'patient' AFTER provider;

CREATE UNIQUE INDEX uq_checkout_callback_token_hash
  ON appointment_payment_reservations (callback_token_hash);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cancellation_sms_status VARCHAR(30) NULL AFTER confirmation_sms_error,
  ADD COLUMN IF NOT EXISTS cancellation_sms_sent_at DATETIME NULL AFTER cancellation_sms_status,
  ADD COLUMN IF NOT EXISTS cancellation_sms_error VARCHAR(1000) NULL AFTER cancellation_sms_sent_at;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS registration_source VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS is_guest TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_claimed_at DATETIME NULL;

CREATE INDEX idx_sms_outbox_daily_status
  ON sms_outbox (created_at, status, message_type);
