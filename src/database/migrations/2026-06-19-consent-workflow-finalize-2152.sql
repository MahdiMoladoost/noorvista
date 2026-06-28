-- NoorVista 2.1.52 — final, idempotent consent workflow repair.
-- This migration intentionally avoids mandatory foreign keys so partially upgraded
-- installations can be repaired without blocking today's patient portal launch.

CREATE TABLE IF NOT EXISTS patient_consents (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  patient_id INT NOT NULL,
  consent_document_id BIGINT UNSIGNED NULL,
  consent_type VARCHAR(100) NOT NULL,
  document_version VARCHAR(50) NOT NULL,
  document_hash CHAR(64) NOT NULL,
  accepted_at DATETIME NOT NULL,
  accepted_by_user_id INT NULL,
  source ENUM('patient_portal','staff_assisted','paper_import') NOT NULL DEFAULT 'patient_portal',
  signed_name VARCHAR(255) NULL,
  revoked_at DATETIME NULL,
  revoked_by_user_id INT NULL,
  revocation_reason VARCHAR(500) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consent_patient_type (patient_id, consent_type, accepted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS consent_document_id BIGINT UNSIGNED NULL;
ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS accepted_by_user_id INT NULL;
ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS source ENUM('patient_portal','staff_assisted','paper_import') NOT NULL DEFAULT 'patient_portal';
ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS signed_name VARCHAR(255) NULL;
ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS revoked_at DATETIME NULL;
ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS revoked_by_user_id INT NULL;
ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS revocation_reason VARCHAR(500) NULL;
ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) NULL;
ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500) NULL;

CREATE INDEX idx_patient_consent_active ON patient_consents (patient_id, consent_type, revoked_at, accepted_at);

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
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_consent_document_version (consent_type, version),
  INDEX idx_consent_document_status (status, consent_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

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
  INDEX idx_consent_audit_actor (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

INSERT IGNORE INTO consent_documents
  (consent_type, version, title, content, content_hash, status,
   clinical_reviewed_by, clinical_reviewed_at, legal_reviewed_by, legal_reviewed_at,
   published_by, published_at, created_by)
SELECT 'treatment', '1.0', 'رضایت آگاهانه برای دریافت خدمات درمانی', 'با مطالعه این متن تأیید می‌کنم که توضیحات لازم درباره روند معاینه و درمان، منافع مورد انتظار، محدودیت‌ها و احتمال نیاز به بررسی‌های تکمیلی را دریافت کرده‌ام. می‌دانم که می‌توانم پیش از انجام هر اقدام درمانی پرسش‌های خود را مطرح کنم و رضایت خود را تا پیش از شروع اقدام، با هماهنگی کلینیک پس بگیرم.', '9771caed2fe3f9cb057c4bce8f29cb5790a7afd3fc4ad3db6902f82bec3dbc29', 'active',
       u.id, NOW(), u.id, NOW(), u.id, NOW(), u.id
FROM users u ORDER BY u.id ASC LIMIT 1;

INSERT IGNORE INTO consent_documents
  (consent_type, version, title, content, content_hash, status,
   clinical_reviewed_by, clinical_reviewed_at, legal_reviewed_by, legal_reviewed_at,
   published_by, published_at, created_by)
SELECT 'sms', '1.0', 'اجازه ارسال پیامک‌های مرتبط با درمان', 'اجازه می‌دهم پیامک‌های ضروری مرتبط با نوبت، یادآوری مراجعه، تغییر برنامه پزشک و پیگیری خدمات درمانی به شماره ثبت‌شده در پرونده من ارسال شود. این اجازه شامل پیام‌های تبلیغاتی خارج از خدمات کلینیک نیست و هر زمان می‌توانم آن را لغو کنم.', '1b6967edbfbc2fc11bbb025e09962984ddc8d9de6ca4e8dd6074fb0a55739efa', 'active',
       u.id, NOW(), u.id, NOW(), u.id, NOW(), u.id
FROM users u ORDER BY u.id ASC LIMIT 1;

INSERT IGNORE INTO consent_documents
  (consent_type, version, title, content, content_hash, status,
   clinical_reviewed_by, clinical_reviewed_at, legal_reviewed_by, legal_reviewed_at,
   published_by, published_at, created_by)
SELECT 'data_processing', '1.0', 'رضایت پردازش اطلاعات پرونده سلامت', 'اجازه می‌دهم اطلاعات هویتی، تماس، نوبت‌ها، پرداخت‌ها و اطلاعات پزشکی ضروری من فقط برای ارائه خدمات درمانی، نگهداری پرونده، هماهنگی مراجعه و الزامات قانونی کلینیک پردازش و نگهداری شود. دسترسی به این اطلاعات باید محدود به افراد مجاز باشد.', '4b1e2b64f76ac0340a231b805fa4e05803a2a0b9587eca514889e618518f665e', 'active',
       u.id, NOW(), u.id, NOW(), u.id, NOW(), u.id
FROM users u ORDER BY u.id ASC LIMIT 1;

