ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(1000) NULL AFTER approved_by,
  ADD COLUMN IF NOT EXISTS processed_by INT NULL AFTER provider_reference,
  ADD COLUMN IF NOT EXISTS processed_at DATETIME NULL AFTER processed_by,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(191) NULL AFTER processed_at;

CREATE UNIQUE INDEX uq_payment_refund_idempotency ON payment_refunds (idempotency_key);
CREATE INDEX idx_payment_refund_status ON payment_refunds (status, created_at);
