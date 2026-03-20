-- =====================================================
-- FIX: Add unique constraints for upsert to work
-- Run this after the main patient_intake_form.sql
-- =====================================================

-- Add unique constraint on submission_id for tables that need upsert
-- This allows onConflict: "submission_id" to work properly

-- patient_intake_preferences: one preferences record per submission
ALTER TABLE patient_intake_preferences 
DROP CONSTRAINT IF EXISTS patient_intake_preferences_submission_id_key;
ALTER TABLE patient_intake_preferences 
ADD CONSTRAINT patient_intake_preferences_submission_id_key UNIQUE (submission_id);

-- patient_measurements: one measurements record per submission
ALTER TABLE patient_measurements 
DROP CONSTRAINT IF EXISTS patient_measurements_submission_id_key;
ALTER TABLE patient_measurements 
ADD CONSTRAINT patient_measurements_submission_id_key UNIQUE (submission_id);

-- patient_treatment_preferences: one treatment preferences record per submission
ALTER TABLE patient_treatment_preferences 
DROP CONSTRAINT IF EXISTS patient_treatment_preferences_submission_id_key;
ALTER TABLE patient_treatment_preferences 
ADD CONSTRAINT patient_treatment_preferences_submission_id_key UNIQUE (submission_id);

-- patient_simulations: one simulation record per submission
ALTER TABLE patient_simulations 
DROP CONSTRAINT IF EXISTS patient_simulations_submission_id_key;
ALTER TABLE patient_simulations 
ADD CONSTRAINT patient_simulations_submission_id_key UNIQUE (submission_id);

-- Verify the constraints were added
SELECT 
  tc.table_name, 
  tc.constraint_name, 
  tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public' 
  AND tc.constraint_type = 'UNIQUE'
  AND tc.table_name IN (
    'patient_intake_preferences',
    'patient_measurements', 
    'patient_treatment_preferences',
    'patient_simulations'
  );
