BEGIN;

ALTER TABLE booking_categories
  ADD COLUMN IF NOT EXISTS secondary_calendar_provider_id uuid
    REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS secondary_calendar_duration_minutes integer;

ALTER TABLE booking_categories
  DROP CONSTRAINT IF EXISTS booking_categories_secondary_calendar_duration_check;
ALTER TABLE booking_categories
  ADD CONSTRAINT booking_categories_secondary_calendar_duration_check
  CHECK (
    (secondary_calendar_provider_id IS NULL AND secondary_calendar_duration_minutes IS NULL)
    OR
    (secondary_calendar_provider_id IS NOT NULL AND secondary_calendar_duration_minutes BETWEEN 1 AND 480)
  );

ALTER TABLE booking_treatments
  ADD COLUMN IF NOT EXISTS secondary_calendar_mode text NOT NULL DEFAULT 'inherit',
  ADD COLUMN IF NOT EXISTS secondary_calendar_provider_id uuid
    REFERENCES providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS secondary_calendar_duration_minutes integer;

ALTER TABLE booking_treatments
  DROP CONSTRAINT IF EXISTS booking_treatments_secondary_calendar_mode_check;
ALTER TABLE booking_treatments
  ADD CONSTRAINT booking_treatments_secondary_calendar_mode_check
  CHECK (secondary_calendar_mode IN ('inherit', 'disabled', 'custom'));

ALTER TABLE booking_treatments
  DROP CONSTRAINT IF EXISTS booking_treatments_secondary_calendar_duration_check;
ALTER TABLE booking_treatments
  ADD CONSTRAINT booking_treatments_secondary_calendar_duration_check
  CHECK (
    (secondary_calendar_mode <> 'custom'
      AND secondary_calendar_provider_id IS NULL
      AND secondary_calendar_duration_minutes IS NULL)
    OR
    (secondary_calendar_mode = 'custom'
      AND secondary_calendar_provider_id IS NOT NULL
      AND secondary_calendar_duration_minutes BETWEEN 1 AND 480)
  );

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS booking_category_id uuid
    REFERENCES booking_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_treatment_id uuid
    REFERENCES booking_treatments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_parent_appointment_id uuid
    REFERENCES appointments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS appointments_linked_parent_idx
  ON appointments(linked_parent_appointment_id)
  WHERE linked_parent_appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS booking_categories_secondary_calendar_provider_idx
  ON booking_categories(secondary_calendar_provider_id)
  WHERE secondary_calendar_provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS booking_treatments_secondary_calendar_provider_idx
  ON booking_treatments(secondary_calendar_provider_id)
  WHERE secondary_calendar_provider_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_linked_booking_calendar_appointments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.linked_parent_appointment_id IS NULL THEN
    UPDATE appointments AS linked
    SET
      start_time = NEW.start_time,
      end_time = NEW.start_time + (linked.end_time - linked.start_time),
      status = NEW.status,
      location = NEW.location
    WHERE linked.linked_parent_appointment_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_sync_linked_booking_calendars ON appointments;
CREATE TRIGGER appointments_sync_linked_booking_calendars
AFTER UPDATE OF start_time, end_time, status, location ON appointments
FOR EACH ROW
EXECUTE FUNCTION sync_linked_booking_calendar_appointments();

COMMIT;
