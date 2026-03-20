-- Migration: Fix insurance_type check constraint
-- The existing constraint may be blocking valid values like SEMI-PRIVATE

-- Drop the existing check constraint if it exists
ALTER TABLE patient_insurances DROP CONSTRAINT IF EXISTS patient_insurances_insurance_type_check;

-- First, normalize any existing data to lowercase valid values
UPDATE patient_insurances SET insurance_type = 'private' WHERE LOWER(insurance_type) = 'private';
UPDATE patient_insurances SET insurance_type = 'semi-private' WHERE LOWER(insurance_type) IN ('semi-private', 'semiprivate', 'semi_private');
UPDATE patient_insurances SET insurance_type = 'basic' WHERE LOWER(insurance_type) = 'basic';
-- Set any other invalid values to NULL
UPDATE patient_insurances SET insurance_type = NULL WHERE insurance_type IS NOT NULL 
  AND insurance_type NOT IN ('private', 'semi-private', 'basic');

-- Now add the constraint
ALTER TABLE patient_insurances ADD CONSTRAINT patient_insurances_insurance_type_check 
  CHECK (insurance_type IS NULL OR insurance_type IN ('private', 'semi-private', 'basic'));
