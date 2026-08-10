-- Allow workflows to run when the configurable appointment display status changes.
ALTER TYPE workflow_trigger_type
  ADD VALUE IF NOT EXISTS 'appointment_status_changed';
