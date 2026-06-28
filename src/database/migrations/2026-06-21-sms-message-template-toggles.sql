INSERT INTO settings (setting_key, setting_value, setting_group) VALUES
('sms_otp_enabled', 'true', 'sms'),
('sms_appointment_confirmation_enabled', 'true', 'sms'),
('sms_appointment_cancellation_enabled', 'true', 'sms'),
('sms_appointment_reminder_enabled', 'true', 'sms'),
('sms_payment_success_enabled', 'true', 'sms'),
('sms_general_notification_enabled', 'true', 'sms')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
