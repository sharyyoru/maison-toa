-- Migration: Ensure patient_insurances table exists and has correct structure
-- This table stores insurance information from the intake form

CREATE TABLE IF NOT EXISTS patient_insurances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  
  -- Insurance details
  provider_name TEXT,
  card_number TEXT,
  insurance_type TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_patient_insurances_patient_id ON patient_insurances(patient_id);

-- Enable RLS (Row Level Security)
ALTER TABLE patient_insurances ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your auth requirements)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_insurances' AND policyname = 'Allow all operations on patient_insurances'
  ) THEN
    CREATE POLICY "Allow all operations on patient_insurances" ON patient_insurances
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Add comment
COMMENT ON TABLE patient_insurances IS 'Stores patient insurance information from intake form';
