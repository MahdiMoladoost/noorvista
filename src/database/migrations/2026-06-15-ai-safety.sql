CREATE TABLE IF NOT EXISTS ai_safety_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  event_type ENUM('emergency','medication','diagnosis_request','pii_redacted','provider_error','unsafe_output') NOT NULL,
  message_hash CHAR(64) NOT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_safety_type_time (event_type, created_at),
  CONSTRAINT fk_ai_safety_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
