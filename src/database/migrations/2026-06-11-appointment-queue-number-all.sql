-- src/database/migrations/2026-06-11-appointment-queue-number-all.sql
-- Queue/order number for all appointments.
-- The application assigns queue numbers transactionally during booking and confirmation.
-- Run this only if your migration system does not call ensureAppointmentArchitecture automatically.

ALTER TABLE appointments
  ADD COLUMN appointment_queue_number INT NULL AFTER appointment_slot_id;

ALTER TABLE appointments
  ADD COLUMN confirmed_at DATETIME NULL AFTER tracking_code;

ALTER TABLE appointments
  ADD COLUMN confirmation_sms_sent_at DATETIME NULL AFTER confirmed_at;

ALTER TABLE appointments
  ADD COLUMN confirmation_sms_status VARCHAR(30) NULL AFTER confirmation_sms_sent_at;

ALTER TABLE appointments
  ADD COLUMN confirmation_sms_error TEXT NULL AFTER confirmation_sms_status;

CREATE INDEX idx_appointment_queue_number
  ON appointments (appointment_slot_id, appointment_queue_number);
