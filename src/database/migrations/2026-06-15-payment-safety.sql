-- Payment safety foundations. Online payment stays disabled until a verified provider adapter is configured.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS approved_by INT NULL,
  ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(1000) NULL,
  ADD COLUMN IF NOT EXISTS provider VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS provider_authority VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS verified_at DATETIME NULL;

CREATE UNIQUE INDEX uq_payments_provider_authority
  ON payments (provider, provider_authority);
CREATE UNIQUE INDEX uq_payments_provider_reference
  ON payments (provider, provider_reference);
CREATE UNIQUE INDEX uq_payments_idempotency_key
  ON payments (idempotency_key);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  provider VARCHAR(64) NOT NULL,
  authority VARCHAR(191) NULL,
  reference_id VARCHAR(191) NULL,
  request_payload JSON NULL,
  response_payload JSON NULL,
  status ENUM('created','redirected','verified','failed','cancelled') NOT NULL DEFAULT 'created',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at DATETIME NULL,
  UNIQUE KEY uq_payment_attempt_authority (provider, authority),
  UNIQUE KEY uq_payment_attempt_reference (provider, reference_id),
  KEY idx_payment_attempt_payment (payment_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_refunds (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  amount DECIMAL(14,0) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  status ENUM('requested','approved','rejected','processed','failed') NOT NULL DEFAULT 'requested',
  requested_by INT NOT NULL,
  approved_by INT NULL,
  provider_reference VARCHAR(191) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_refunds_payment (payment_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
