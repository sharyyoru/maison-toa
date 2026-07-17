ALTER TABLE booking_treatments
  ADD COLUMN IF NOT EXISTS display_duration_minutes INTEGER;

ALTER TABLE booking_treatments
  DROP CONSTRAINT IF EXISTS booking_treatments_display_duration_check;

ALTER TABLE booking_treatments
  ADD CONSTRAINT booking_treatments_display_duration_check
  CHECK (
    display_duration_minutes IS NULL
    OR display_duration_minutes BETWEEN 1 AND 480
  );
