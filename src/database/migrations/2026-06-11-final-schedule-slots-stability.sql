-- src/database/migrations/2026-06-11-final-schedule-slots-stability.sql
-- Optional indexes and duplicate cleanup helpers.
-- Run manually if needed. Ignore duplicate-index errors if indexes already exist.

CREATE INDEX idx_schedule_overlap_guard
  ON doctor_schedules (doctor_id, medical_center_id, service_id, day_of_week, start_date, end_date, start_time, end_time);

CREATE INDEX idx_slot_overlap_guard
  ON appointment_slots (doctor_id, medical_center_id, service_id, slot_date, start_time, end_time);

-- Optional: disable duplicate EMPTY slots with same doctor/center/service/date/start_time.
UPDATE appointment_slots s
JOIN (
  SELECT doctor_id, medical_center_id, service_id, slot_date, start_time, MIN(id) AS keep_id
  FROM appointment_slots
  GROUP BY doctor_id, medical_center_id, service_id, slot_date, start_time
  HAVING COUNT(*) > 1
) d ON d.doctor_id = s.doctor_id
   AND d.medical_center_id = s.medical_center_id
   AND d.service_id = s.service_id
   AND d.slot_date = s.slot_date
   AND d.start_time = s.start_time
SET s.status = 'disabled'
WHERE s.id <> d.keep_id
  AND COALESCE(s.booked_count, 0) = 0;
