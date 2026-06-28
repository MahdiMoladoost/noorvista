-- NoorVista 2.1.36
-- Repair/ensure the payment-attempt audit table used by the sandbox and future real gateways.
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
  KEY idx_payment_attempt_payment (payment_id, created_at),
  KEY idx_payment_attempt_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
