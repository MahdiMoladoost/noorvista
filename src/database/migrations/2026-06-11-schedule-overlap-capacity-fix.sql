-- src/database/migrations/2026-06-11-schedule-overlap-capacity-fix.sql
-- Optional indexes for overlap checks and capacity generation.
-- Ignore duplicate-index errors if they already exist.

CREATE INDEX idx_schedule_overlap_guard
  ON doctor_schedules (doctor_id, medical_center_id, service_id, day_of_week, start_date, end_date, start_time, end_time);

CREATE INDEX idx_slot_overlap_guard
  ON appointment_slots (doctor_id, medical_center_id, service_id, slot_date, start_time, end_time);
