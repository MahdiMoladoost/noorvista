-- src/database/migrations/2026-06-11-slot-positions-expanded-view.sql
-- No new table is required.
-- appointment_slots remains one row per time slot.
-- The API can expand a slot with capacity N into N virtual position rows:
-- GET /api/appointment-slots?expand_positions=1

-- Optional indexes for faster position rendering:
CREATE INDEX idx_slots_daily_position_lookup
  ON appointment_slots (doctor_id, medical_center_id, service_id, slot_date, start_time);

CREATE INDEX idx_appointments_slot_queue_status
  ON appointments (appointment_slot_id, appointment_queue_number, status);
