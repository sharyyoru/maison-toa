BEGIN;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS mirror_calendar_provider_id uuid
    REFERENCES providers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS mirror_duration_minutes integer;

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_mirror_configuration_check;
ALTER TABLE services
  ADD CONSTRAINT services_mirror_configuration_check
  CHECK (
    (mirror_calendar_provider_id IS NULL AND mirror_duration_minutes IS NULL)
    OR
    (mirror_calendar_provider_id IS NOT NULL AND mirror_duration_minutes BETWEEN 1 AND 480)
  );

CREATE INDEX IF NOT EXISTS services_mirror_calendar_provider_idx
  ON services(mirror_calendar_provider_id)
  WHERE mirror_calendar_provider_id IS NOT NULL;

COMMIT;
