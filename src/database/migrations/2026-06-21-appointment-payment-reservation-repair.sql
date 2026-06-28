-- Repair checkout columns for databases where the operational booking migration
-- was recorded or partially applied. Each ALTER is intentionally independent so
-- the migration runner can skip an existing column and still add the others.

ALTER TABLE appointment_payment_reservations
  ADD COLUMN callback_token_hash CHAR(64) NULL AFTER token_hash;

ALTER TABLE appointment_payment_reservations
  ADD COLUMN payment_context VARCHAR(30) NOT NULL DEFAULT 'patient' AFTER provider;

ALTER TABLE appointment_payment_reservations
  ADD COLUMN gateway_requested_at DATETIME NULL AFTER expires_at;

ALTER TABLE appointment_payment_reservations
  ADD COLUMN gateway_callback_at DATETIME NULL AFTER gateway_requested_at;

CREATE UNIQUE INDEX uq_checkout_callback_token_hash
  ON appointment_payment_reservations (callback_token_hash);
