BEGIN;

ALTER TABLE booking_categories
  ADD COLUMN IF NOT EXISTS secondary_calendar_position text NOT NULL DEFAULT 'start';

ALTER TABLE booking_categories
  DROP CONSTRAINT IF EXISTS booking_categories_secondary_calendar_position_check;
ALTER TABLE booking_categories
  ADD CONSTRAINT booking_categories_secondary_calendar_position_check
  CHECK (secondary_calendar_position IN ('start', 'end'));

ALTER TABLE booking_treatments
  ADD COLUMN IF NOT EXISTS secondary_calendar_position text;

UPDATE booking_treatments
SET secondary_calendar_position = 'start'
WHERE secondary_calendar_mode = 'custom'
  AND secondary_calendar_position IS NULL;

ALTER TABLE booking_treatments
  DROP CONSTRAINT IF EXISTS booking_treatments_secondary_calendar_position_check;
ALTER TABLE booking_treatments
  ADD CONSTRAINT booking_treatments_secondary_calendar_position_check
  CHECK (
    (secondary_calendar_mode = 'custom' AND secondary_calendar_position IN ('start', 'end'))
    OR
    (secondary_calendar_mode <> 'custom' AND secondary_calendar_position IS NULL)
  );

CREATE OR REPLACE FUNCTION sync_linked_booking_calendar_appointments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  start_delta interval;
BEGIN
  IF NEW.linked_parent_appointment_id IS NULL THEN
    start_delta := NEW.start_time - OLD.start_time;
    UPDATE appointments AS linked
    SET
      start_time = linked.start_time + start_delta,
      end_time = linked.end_time + start_delta,
      status = NEW.status,
      location = NEW.location
    WHERE linked.linked_parent_appointment_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
