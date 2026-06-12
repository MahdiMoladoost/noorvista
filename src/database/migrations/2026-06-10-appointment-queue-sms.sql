-- NOORVISTA appointment queue number + confirmation SMS migration
-- برای نوبت‌های ظرفیت‌دار، شماره پذیرش داخلی داخل همان slot و وضعیت ارسال پیامک تأیید اضافه می‌شود.

ALTER TABLE appointments
  ADD COLUMN appointment_queue_number INT NULL AFTER appointment_slot_id;

ALTER TABLE appointments
  ADD COLUMN confirmed_at DATETIME NULL AFTER tracking_code;

ALTER TABLE appointments
  ADD COLUMN confirmation_sms_sent_at DATETIME NULL AFTER confirmed_at;

ALTER TABLE appointments
  ADD COLUMN confirmation_sms_status VARCHAR(30) NULL AFTER confirmation_sms_sent_at;

ALTER TABLE appointments
  ADD COLUMN confirmation_sms_error TEXT NULL AFTER confirmation_sms_status;

ALTER TABLE appointments
  ADD INDEX idx_appointment_queue_number (appointment_slot_id, appointment_queue_number);

-- اگر دیتابیس شما ستون‌ها/ایندکس‌ها را قبلاً دارد، خطای Duplicate را نادیده بگیرید.
