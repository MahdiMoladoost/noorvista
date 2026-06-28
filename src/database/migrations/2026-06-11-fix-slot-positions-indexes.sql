-- src/database/migrations/2026-06-11-fix-slot-positions-indexes.sql
-- Optional indexes for expanded capacity-position view.
-- Ignore duplicate-index errors if already exists.

CREATE INDEX idx_slots_daily_position_lookup
  ON appointment_slots (doctor_id, medical_center_id, service_id, slot_date, start_time);

CREATE INDEX idx_appointments_slot_queue_status
  ON appointments (appointment_slot_id, appointment_queue_number, status);
