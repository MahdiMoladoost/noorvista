-- NOORVISTA
-- جلوگیری از تولید برنامه و نوبت هم‌پوشان برای پزشک + خدمت، مستقل از مرکز درمانی.
-- اجرای این migration اختیاری است؛ ensureAppointmentArchitecture همین ایندکس‌ها را خودکار ایجاد می‌کند.
-- در صورت وجود ایندکس هم‌نام، خطای duplicate index را نادیده بگیرید.

CREATE INDEX idx_schedule_doctor_service_overlap
  ON doctor_schedules (doctor_id, service_id, day_of_week, start_date, end_date, start_time, end_time);

CREATE INDEX idx_slot_doctor_service_overlap
  ON appointment_slots (doctor_id, service_id, slot_date, start_time, end_time);
