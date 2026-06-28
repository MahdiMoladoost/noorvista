INSERT INTO settings (setting_key, setting_value, setting_group) VALUES
('sms_appointment_confirmation_template', '{{patient_name}} عزیز، نوبت شما برای {{service_name}} با {{doctor_name}} در {{center_name}} ثبت شد. تاریخ: {{appointment_date}} ساعت {{appointment_time}}. شماره نوبت: {{queue_number}}. کد پیگیری: {{tracking_code}}', 'sms'),
('sms_appointment_cancellation_template', '{{patient_name}} عزیز، نوبت {{service_name}} با {{doctor_name}} در تاریخ {{appointment_date}} ساعت {{appointment_time}} لغو شد. علت: {{reason}}. کد پیگیری: {{tracking_code}}', 'sms'),
('sms_appointment_reminder_template', '{{patient_name}} عزیز، یادآوری نوبت شما در {{center_name}} با {{doctor_name}}، تاریخ {{appointment_date}} ساعت {{appointment_time}}. لطفاً کمی زودتر در کلینیک حضور داشته باشید.', 'sms'),
('sms_payment_success_template', '{{patient_name}} عزیز، پرداخت نوبت شما با مبلغ {{amount}} تومان با موفقیت ثبت شد. کد پیگیری: {{tracking_code}}. تاریخ نوبت: {{appointment_date}} ساعت {{appointment_time}}', 'sms'),
('sms_general_notification_template', '{{patient_name}} عزیز، {{message}}\n{{clinic_name}}', 'sms')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

UPDATE settings
SET setting_value = '{{patient_name}} عزیز، نوبت شما برای {{service_name}} با {{doctor_name}} در {{center_name}} ثبت شد. تاریخ: {{appointment_date}} ساعت {{appointment_time}}. شماره نوبت: {{queue_number}}. کد پیگیری: {{tracking_code}}',
    setting_group = 'sms'
WHERE setting_key = 'sms_appointment_template'
  AND (setting_value IS NULL OR setting_value = '' OR setting_value = '{{patient_name}} عزیز، نوبت شما در تاریخ {{appointment_date}} ساعت {{appointment_time}} است.');
