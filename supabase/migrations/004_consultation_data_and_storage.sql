-- Migration: Create consultation data table and storage bucket for patient photos
-- Run this SQL in Supabase SQL Editor

-- 1. Create patient_consultation_data table
CREATE TABLE IF NOT EXISTS patient_consultation_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES patient_intake_submissions(id) ON DELETE SET NULL,
  consultation_type TEXT NOT NULL, -- 'liposuction', 'breast', 'face'
  selected_areas TEXT[], -- Array of selected body areas (for liposuction)
  measurements JSONB, -- JSON object with measurement values
  breast_data JSONB, -- JSON object with breast consultation specific data
  face_data JSONB, -- JSON object with face consultation specific data
  upload_mode TEXT DEFAULT 'later', -- 'now' or 'later'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint for upsert
  CONSTRAINT unique_patient_consultation UNIQUE (patient_id, consultation_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_consultation_data_patient_id ON patient_consultation_data(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultation_data_type ON patient_consultation_data(consultation_type);

-- Enable RLS
ALTER TABLE patient_consultation_data ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_consultation_data' AND policyname = 'Allow all operations on patient_consultation_data'
  ) THEN
    CREATE POLICY "Allow all operations on patient_consultation_data" ON patient_consultation_data
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Add consultation_category column to patient_intake_submissions if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patient_intake_submissions' AND column_name = 'consultation_category'
  ) THEN
    ALTER TABLE patient_intake_submissions ADD COLUMN consultation_category TEXT;
  END IF;
END $$;

-- 2. Create storage bucket for patient photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-photos',
  'patient-photos',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Create storage policies for patient-photos bucket

-- Policy: Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads to patient-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patient-photos');

-- Policy: Allow authenticated users to read their own photos
CREATE POLICY "Allow authenticated reads from patient-photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'patient-photos');

-- Policy: Allow anon uploads (for intake form without auth)
CREATE POLICY "Allow anon uploads to patient-photos"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'patient-photos');

-- Policy: Allow service role full access
CREATE POLICY "Allow service role full access to patient-photos"
ON storage.objects
TO service_role
USING (bucket_id = 'patient-photos')
WITH CHECK (bucket_id = 'patient-photos');

-- Add comment
COMMENT ON TABLE patient_consultation_data IS 'Stores consultation-specific data including selected treatment areas and measurements';
