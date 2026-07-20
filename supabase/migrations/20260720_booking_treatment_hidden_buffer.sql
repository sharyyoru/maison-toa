ALTER TABLE booking_treatments
  ADD COLUMN IF NOT EXISTS buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE booking_treatments
  DROP CONSTRAINT IF EXISTS booking_treatments_buffer_before_check,
  DROP CONSTRAINT IF EXISTS booking_treatments_buffer_after_check;

ALTER TABLE booking_treatments
  ADD CONSTRAINT booking_treatments_buffer_before_check
    CHECK (buffer_before_minutes BETWEEN 0 AND 480),
  ADD CONSTRAINT booking_treatments_buffer_after_check
    CHECK (buffer_after_minutes BETWEEN 0 AND 480);
