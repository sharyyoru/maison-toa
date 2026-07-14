-- Appointments used for internal blocks (leave, meetings, room holds, etc.)
-- intentionally have no patient and are identified by appointments.no_patient.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS no_patient boolean DEFAULT false;

ALTER TABLE appointments
  ALTER COLUMN patient_id DROP NOT NULL;

-- Normalize legacy rows before enforcing the relationship. Some appointments
-- were already saved with a NULL patient_id before no_patient was populated.
UPDATE appointments
SET no_patient = true
WHERE patient_id IS NULL;

UPDATE appointments
SET no_patient = false
WHERE patient_id IS NOT NULL
  AND no_patient IS NULL;

ALTER TABLE appointments
  ALTER COLUMN no_patient SET DEFAULT false,
  ALTER COLUMN no_patient SET NOT NULL;

-- DROP makes this migration safe to rerun if a previous execution reached the
-- NOT VALID constraint but failed while validating it.
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_patient_assignment_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_patient_assignment_check
  CHECK (no_patient = true OR patient_id IS NOT NULL) NOT VALID;

ALTER TABLE appointments
  VALIDATE CONSTRAINT appointments_patient_assignment_check;
