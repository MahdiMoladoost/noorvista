-- NoorVista 2.1.40
-- Canonical appointment registration timestamp.
-- Existing rows are backfilled from the earliest appointment audit/checkout event
-- when available; rows without historical evidence receive the migration time.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS created_at DATETIME NULL;

UPDATE appointments a
LEFT JOIN (
  SELECT timeline.appointment_id, MIN(timeline.created_at) AS first_seen_at
  FROM (
    SELECT appointment_id, created_at
    FROM appointment_status_history
    WHERE appointment_id IS NOT NULL

    UNION ALL

    SELECT appointment_id, created_at
    FROM appointment_payment_events
    WHERE appointment_id IS NOT NULL

    UNION ALL

    SELECT appointment_id, created_at
    FROM appointment_payment_reservations
    WHERE appointment_id IS NOT NULL
  ) AS timeline
  GROUP BY timeline.appointment_id
) AS first_event ON first_event.appointment_id = a.id
SET a.created_at = COALESCE(a.created_at, first_event.first_seen_at, CURRENT_TIMESTAMP)
WHERE a.created_at IS NULL;

ALTER TABLE appointments
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_appointments_created_at
  ON appointments (created_at);
