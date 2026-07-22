BEGIN;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS mirror_position text NOT NULL DEFAULT 'start';

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_mirror_position_check;
ALTER TABLE services
  ADD CONSTRAINT services_mirror_position_check
  CHECK (mirror_position IN ('start', 'end'));

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_mirror_position_duration_check;
ALTER TABLE services
  ADD CONSTRAINT services_mirror_position_duration_check
  CHECK (
    mirror_position = 'start'
    OR mirror_calendar_provider_id IS NULL
    OR duration_minutes IS NULL
    OR mirror_duration_minutes >= duration_minutes
  );

COMMIT;
