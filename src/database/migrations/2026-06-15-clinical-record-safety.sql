-- Structured ophthalmology records, immutable signatures, amendments and consent/audit foundations.

ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS record_status ENUM('draft','signed','amended','locked') NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS signed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS signed_by INT NULL,
  ADD COLUMN IF NOT EXISTS visual_acuity_od VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS visual_acuity_os VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS refraction_od_sph DECIMAL(6,2) NULL,
  ADD COLUMN IF NOT EXISTS refraction_od_cyl DECIMAL(6,2) NULL,
  ADD COLUMN IF NOT EXISTS refraction_od_axis SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS refraction_os_sph DECIMAL(6,2) NULL,
  ADD COLUMN IF NOT EXISTS refraction_os_cyl DECIMAL(6,2) NULL,
  ADD COLUMN IF NOT EXISTS refraction_os_axis SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS add_power DECIMAL(6,2) NULL,
  ADD COLUMN IF NOT EXISTS iop_od DECIMAL(5,2) NULL,
  ADD COLUMN IF NOT EXISTS iop_os DECIMAL(5,2) NULL,
  ADD COLUMN IF NOT EXISTS iop_method VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS iop_measured_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS findings TEXT NULL,
  ADD COLUMN IF NOT EXISTS treatment_plan TEXT NULL,
  ADD COLUMN IF NOT EXISTS follow_up_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS medical_record_amendments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  medical_record_id INT NOT NULL,
  author_user_id INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  patch_json JSON NOT NULL,
  previous_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_amendment_record (medical_record_id, created_at),
  CONSTRAINT fk_amendment_record FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE RESTRICT,
  CONSTRAINT fk_amendment_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

CREATE TABLE IF NOT EXISTS prescription_items (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  prescription_id INT NOT NULL,
  drug_name VARCHAR(200) NOT NULL,
  dosage_form VARCHAR(100) NULL,
  dose VARCHAR(100) NOT NULL,
  route VARCHAR(100) NULL,
  frequency VARCHAR(100) NOT NULL,
  duration VARCHAR(100) NULL,
  quantity VARCHAR(100) NULL,
  instructions VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prescription_items (prescription_id),
  CONSTRAINT fk_prescription_item FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

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

CREATE TABLE IF NOT EXISTS medical_access_audit (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_user_id INT NOT NULL,
  patient_id INT NOT NULL,
  medical_record_id INT NULL,
  action ENUM('read','create','sign','amend','export','break_glass') NOT NULL,
  reason VARCHAR(500) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_med_audit_patient (patient_id, created_at),
  INDEX idx_med_audit_actor (actor_user_id, created_at),
  CONSTRAINT fk_med_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_med_audit_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_med_audit_record FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
