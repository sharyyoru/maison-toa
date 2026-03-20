-- Migration: Create patient_health_background table
-- This table stores health and lifestyle information from the intake form

CREATE TABLE IF NOT EXISTS patient_health_background (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES patient_intake_submissions(id) ON DELETE SET NULL,
  
  -- Physical measurements
  weight_kg DECIMAL(5,2),
  height_cm DECIMAL(5,2),
  bmi DECIMAL(4,2),
  
  -- Medical history
  known_illnesses TEXT,
  previous_surgeries TEXT,
  allergies TEXT,
  medications TEXT,
  
  -- Lifestyle
  cigarettes TEXT,
  alcohol_consumption TEXT,
  sports_activity TEXT,
  
  -- Healthcare providers
  general_practitioner TEXT,
  gynecologist TEXT,
  
  -- Family/Children info
  children_count INTEGER,
  birth_type_1 TEXT,
  birth_type_2 TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_health_background_patient_id ON patient_health_background(patient_id);
CREATE INDEX IF NOT EXISTS idx_health_background_submission_id ON patient_health_background(submission_id);

-- Enable RLS (Row Level Security)
ALTER TABLE patient_health_background ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your auth requirements)
CREATE POLICY "Allow all operations on patient_health_background" ON patient_health_background
  FOR ALL USING (true) WITH CHECK (true);

-- Add comment
COMMENT ON TABLE patient_health_background IS 'Stores patient health background and lifestyle information from intake form';
