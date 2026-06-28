-- Temporary sandbox payment flow. The real provider can replace provider='sandbox' later.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_status ENUM('unpaid','pending','paid','refunded','cancelled') NOT NULL DEFAULT 'unpaid';

CREATE INDEX idx_payments_appointment_status
  ON payments (appointment_id, status, id);
