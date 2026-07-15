ALTER TABLE booking_categories
  ADD COLUMN IF NOT EXISTS booking_duration_minutes integer NOT NULL DEFAULT 60;

ALTER TABLE booking_categories
  DROP CONSTRAINT IF EXISTS booking_categories_booking_duration_check;

ALTER TABLE booking_categories
  ADD CONSTRAINT booking_categories_booking_duration_check
  CHECK (booking_duration_minutes BETWEEN 1 AND 480);
