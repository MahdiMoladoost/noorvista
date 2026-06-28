CREATE TABLE IF NOT EXISTS appointment_status_history (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  appointment_id INT NOT NULL,
  from_status VARCHAR(40) NOT NULL,
  to_status VARCHAR(40) NOT NULL,
  reason VARCHAR(500) NULL,
  actor_user_id INT NULL,
  request_id VARCHAR(80) NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_appointment_status_history (appointment_id, created_at),
  INDEX idx_appointment_status_actor (actor_user_id, created_at),
  CONSTRAINT fk_appointment_status_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_appointment_status_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
