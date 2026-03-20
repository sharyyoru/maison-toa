-- Add no_patient column to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_patient boolean DEFAULT false;

-- Set no_patient = true for all appointments with the placeholder patient ID
UPDATE appointments 
SET no_patient = true 
WHERE patient_id = '58299080-b76f-4fbc-9a73-baa9e1baccbd';

-- Add index for faster queries filtering by no_patient
CREATE INDEX IF NOT EXISTS idx_appointments_no_patient ON appointments(no_patient) WHERE no_patient = true;
