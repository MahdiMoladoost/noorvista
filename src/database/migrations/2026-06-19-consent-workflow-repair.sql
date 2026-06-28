-- Repair migration for installations where the consent workflow migration was
-- skipped or only partially applied. This file is intentionally idempotent.

CREATE TABLE IF NOT EXISTS patient_consents (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  patient_id INT NOT NULL,
  consent_type VARCHAR(100) NOT NULL,
  document_version VARCHAR(50) NOT NULL,
  document_hash CHAR(64) NOT NULL,
  accepted_at DATETIME NOT NULL,
  accepted_by_user_id INT NULL,
  revoked_at DATETIME NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consent_patient_type (patient_id, consent_type, accepted_at),
  CONSTRAINT fk_consent_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_consent_user FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

CREATE TABLE IF NOT EXISTS consent_documents (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  consent_type VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  status ENUM('draft','review','active','retired') NOT NULL DEFAULT 'draft',
  clinical_reviewed_by INT NULL,
  clinical_reviewed_at DATETIME NULL,
  legal_reviewed_by INT NULL,
  legal_reviewed_at DATETIME NULL,
  published_by INT NULL,
  published_at DATETIME NULL,
  retired_at DATETIME NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_consent_document_version (consent_type, version),
  INDEX idx_consent_document_status (status, consent_type),
  CONSTRAINT fk_consent_doc_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_consent_doc_clinical_review FOREIGN KEY (clinical_reviewed_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_consent_doc_legal_review FOREIGN KEY (legal_reviewed_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_consent_doc_published_by FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

ALTER TABLE patient_consents
  ADD COLUMN IF NOT EXISTS accepted_by_user_id INT NULL,
  ADD COLUMN IF NOT EXISTS revoked_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS consent_document_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS source ENUM('patient_portal','staff_assisted','paper_import') NOT NULL DEFAULT 'patient_portal',
  ADD COLUMN IF NOT EXISTS signed_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS revoked_by_user_id INT NULL,
  ADD COLUMN IF NOT EXISTS revocation_reason VARCHAR(500) NULL;

CREATE INDEX idx_patient_consent_active ON patient_consents (patient_id, consent_type, revoked_at, accepted_at);

CREATE TABLE IF NOT EXISTS consent_audit (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_user_id INT NOT NULL,
  patient_id INT NULL,
  consent_document_id BIGINT UNSIGNED NULL,
  patient_consent_id BIGINT UNSIGNED NULL,
  action ENUM('create_document','clinical_review','legal_review','publish','retire','accept','revoke','read') NOT NULL,
  reason VARCHAR(500) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consent_audit_patient (patient_id, created_at),
  INDEX idx_consent_audit_actor (actor_user_id, created_at),
  CONSTRAINT fk_consent_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_consent_audit_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_consent_audit_document FOREIGN KEY (consent_document_id) REFERENCES consent_documents(id) ON DELETE SET NULL,
  CONSTRAINT fk_consent_audit_consent FOREIGN KEY (patient_consent_id) REFERENCES patient_consents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
