-- Remove the incorrectly placed scheduling-setting link from the reverted attempt.
DROP INDEX IF EXISTS doctor_scheduling_settings_calendar_provider_id_key;
ALTER TABLE doctor_scheduling_settings
  DROP COLUMN IF EXISTS calendar_provider_id;

-- Each public booking doctor can point directly to a calendar shown on /appointments.
ALTER TABLE booking_doctors
  ADD COLUMN IF NOT EXISTS calendar_provider_id uuid
  REFERENCES providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS booking_doctors_calendar_provider_id_idx
  ON booking_doctors(calendar_provider_id);
