-- Tables previously created during normal HTTP requests. They are now migration-owned.
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  setting_group VARCHAR(50) DEFAULT 'system',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_setting_key (setting_key),
  INDEX idx_setting_group (setting_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

CREATE TABLE IF NOT EXISTS faqs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question VARCHAR(500) NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100) NULL,
  keywords TEXT NULL,
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  show_on_public TINYINT(1) DEFAULT 1,
  use_for_chatbot TINYINT(1) DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_is_active (is_active),
  INDEX idx_show_on_public (show_on_public),
  INDEX idx_use_for_chatbot (use_for_chatbot),
  INDEX idx_sort_order (sort_order),
  FULLTEXT KEY ft_faq_question_answer_keywords (question, answer, keywords)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

INSERT INTO settings (setting_key, setting_value, setting_group) VALUES
('ai_enabled', 'false', 'ai'),
('ai_base_url', '', 'ai'),
('ai_api_key', '', 'ai'),
('ai_model', '', 'ai'),
('ai_temperature', '0.2', 'ai'),
('ai_max_tokens', '400', 'ai'),
('ai_use_faq_first', 'true', 'ai'),
('sms_enabled', 'false', 'sms'),
('sms_provider', 'kavenegar', 'sms'),
('sms_base_url', '', 'sms'),
('sms_api_key', '', 'sms'),
('sms_sender', '', 'sms'),
('sms_otp_template', '', 'sms'),
('sms_appointment_template', '', 'sms'),
('sms_appointment_reminder_enabled', 'false', 'sms'),
('sms_appointment_reminder_default_minutes', '1440', 'sms')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);
