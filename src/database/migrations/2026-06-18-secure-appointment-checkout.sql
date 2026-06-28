-- Secure appointment checkout: paid appointments are created only after a verified payment.
-- Temporary reservations expire automatically and never increment appointment slot booked_count.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_status ENUM('unpaid','pending','paid','free','refunded','cancelled') NOT NULL DEFAULT 'unpaid';

ALTER TABLE appointments
  MODIFY COLUMN payment_status ENUM('unpaid','pending','paid','free','refunded','cancelled') NOT NULL DEFAULT 'unpaid';

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_free TINYINT(1) NOT NULL DEFAULT 0 AFTER default_fee;

CREATE TABLE IF NOT EXISTS appointment_payment_reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  idempotency_key VARCHAR(191) NOT NULL,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  appointment_slot_id INT NULL,
  medical_center_id INT NULL,
  service_id INT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  appointment_type VARCHAR(32) NOT NULL DEFAULT 'regular',
  reason VARCHAR(1000) NULL,
  amount DECIMAL(14,0) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'IRT',
  status ENUM('pending','paid','cancelled','expired','failed') NOT NULL DEFAULT 'pending',
  provider VARCHAR(64) NOT NULL DEFAULT 'sandbox',
  provider_authority VARCHAR(191) NULL,
  provider_reference VARCHAR(191) NULL,
  payment_id INT NULL,
  appointment_id INT NULL,
  expires_at DATETIME NOT NULL,
  paid_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  failed_at DATETIME NULL,
  last_error_code VARCHAR(100) NULL,
  last_error_message VARCHAR(1000) NULL,
  requester_ip_hash CHAR(64) NULL,
  user_agent_hash CHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_checkout_token_hash (token_hash),
  UNIQUE KEY uq_checkout_idempotency (idempotency_key),
  KEY idx_checkout_patient_status (patient_id, status, created_at),
  KEY idx_checkout_slot_active (appointment_slot_id, status, expires_at),
  KEY idx_checkout_doctor_time (doctor_id, appointment_date, appointment_time, status, expires_at),
  KEY idx_checkout_payment (payment_id),
  KEY idx_checkout_appointment (appointment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

CREATE TABLE IF NOT EXISTS appointment_payment_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id BIGINT UNSIGNED NOT NULL,
  payment_id INT NULL,
  appointment_id INT NULL,
  event_type VARCHAR(80) NOT NULL,
  actor_type ENUM('patient','system','gateway','staff') NOT NULL DEFAULT 'system',
  actor_user_id INT NULL,
  provider VARCHAR(64) NULL,
  provider_authority VARCHAR(191) NULL,
  provider_reference VARCHAR(191) NULL,
  request_id VARCHAR(191) NULL,
  payload JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_checkout_event_reservation (reservation_id, created_at),
  KEY idx_checkout_event_payment (payment_id, created_at),
  KEY idx_checkout_event_appointment (appointment_id, created_at),
  KEY idx_checkout_event_type (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
