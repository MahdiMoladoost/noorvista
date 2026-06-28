-- 2026-06-18-appointment-tariffs.sql
-- تعرفه پیش‌فرض خدمت، تعرفه اختصاصی برنامه و ثبت مبلغ نهایی نوبت

ALTER TABLE services
  ADD COLUMN default_fee DECIMAL(14,0) NOT NULL DEFAULT 0 AFTER default_duration_minutes;

ALTER TABLE doctor_schedules
  ADD COLUMN custom_fee DECIMAL(14,0) NULL AFTER capacity_per_slot;
