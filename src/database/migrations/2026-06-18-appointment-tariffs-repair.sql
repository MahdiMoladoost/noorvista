-- ترمیم ایمن ستون‌های تعرفه برای دیتابیس‌هایی که migration قبلی ناقص اجرا شده است
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS default_fee DECIMAL(14,0) NOT NULL DEFAULT 0 AFTER default_duration_minutes;

ALTER TABLE doctor_schedules
  ADD COLUMN IF NOT EXISTS custom_fee DECIMAL(14,0) NULL AFTER capacity_per_slot;
