-- =====================================================
-- PATIENT INTAKE FORM - Complete SQL Migration
-- =====================================================

-- 1. Create patient_intake_submissions table to track form submissions
CREATE TABLE IF NOT EXISTS patient_intake_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress, completed, abandoned
  current_step INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create patient_intake_preferences table (Step 1: Preferences)
CREATE TABLE IF NOT EXISTS patient_intake_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES patient_intake_submissions(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  preferred_language TEXT DEFAULT 'en',
  consultation_type TEXT, -- in-person, virtual, either
  preferred_contact_method TEXT, -- email, phone, whatsapp
  preferred_contact_time TEXT, -- morning, afternoon, evening, anytime
  additional_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create patient_treatment_areas table (Step 2: Body areas to treat)
CREATE TABLE IF NOT EXISTS patient_treatment_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES patient_intake_submissions(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  area_name TEXT NOT NULL, -- face, neck, chest, abdomen, arms, legs, back, buttocks, etc.
  area_category TEXT, -- body, face
  specific_concerns TEXT[], -- wrinkles, sagging, fat, scars, etc.
  priority INTEGER DEFAULT 1, -- 1 = highest priority
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create patient_measurements table (Step 3: Measurements)
CREATE TABLE IF NOT EXISTS patient_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES patient_intake_submissions(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  height_cm NUMERIC(5,1),
  weight_kg NUMERIC(5,1),
  bmi NUMERIC(4,1),
  chest_cm NUMERIC(5,1),
  waist_cm NUMERIC(5,1),
  hips_cm NUMERIC(5,1),
  other_measurements JSONB, -- For additional custom measurements
  measured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create patient_intake_photos table (Step 4: Photos)
CREATE TABLE IF NOT EXISTS patient_intake_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES patient_intake_submissions(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  photo_type TEXT NOT NULL, -- front, side_left, side_right, back, close_up, area_specific
  area_name TEXT, -- Which treatment area this photo is for
  storage_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create patient_simulations table (Step 5: Simulations)
CREATE TABLE IF NOT EXISTS patient_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES patient_intake_submissions(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  simulation_type TEXT, -- 3d, before_after, ai_generated
  simulation_url TEXT,
  storage_path TEXT,
  status TEXT DEFAULT 'pending', -- pending, processing, ready, failed
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create patient_treatment_preferences table (Step 6: Treatment preferences)
CREATE TABLE IF NOT EXISTS patient_treatment_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES patient_intake_submissions(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  interested_treatments TEXT[], -- Array of treatment/service IDs or names
  preferred_date_range_start DATE,
  preferred_date_range_end DATE,
  flexibility TEXT, -- flexible, specific_dates, asap
  budget_range TEXT, -- economy, standard, premium, no_limit
  financing_interest BOOLEAN DEFAULT false,
  special_requests TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Add intake form fields to patients table if not exists
DO $$ 
BEGIN
  -- Add source field if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'intake_submission_id') THEN
    ALTER TABLE patients ADD COLUMN intake_submission_id UUID REFERENCES patient_intake_submissions(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'intake_completed_at') THEN
    ALTER TABLE patients ADD COLUMN intake_completed_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'country_code') THEN
    ALTER TABLE patients ADD COLUMN country_code TEXT DEFAULT '+41'; -- Switzerland default
  END IF;
END $$;

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_intake_submissions_patient_id ON patient_intake_submissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_status ON patient_intake_submissions(status);
CREATE INDEX IF NOT EXISTS idx_intake_preferences_submission_id ON patient_intake_preferences(submission_id);
CREATE INDEX IF NOT EXISTS idx_treatment_areas_submission_id ON patient_treatment_areas(submission_id);
CREATE INDEX IF NOT EXISTS idx_measurements_submission_id ON patient_measurements(submission_id);
CREATE INDEX IF NOT EXISTS idx_intake_photos_submission_id ON patient_intake_photos(submission_id);
CREATE INDEX IF NOT EXISTS idx_simulations_submission_id ON patient_simulations(submission_id);
CREATE INDEX IF NOT EXISTS idx_treatment_preferences_submission_id ON patient_treatment_preferences(submission_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE patient_intake_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_intake_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_treatment_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_intake_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_treatment_preferences ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users (staff)
CREATE POLICY "Staff can read all intake submissions" ON patient_intake_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert intake submissions" ON patient_intake_submissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update intake submissions" ON patient_intake_submissions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Staff can read all intake preferences" ON patient_intake_preferences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert intake preferences" ON patient_intake_preferences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update intake preferences" ON patient_intake_preferences FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Staff can read all treatment areas" ON patient_treatment_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert treatment areas" ON patient_treatment_areas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update treatment areas" ON patient_treatment_areas FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Staff can read all measurements" ON patient_measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert measurements" ON patient_measurements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update measurements" ON patient_measurements FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Staff can read all intake photos" ON patient_intake_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert intake photos" ON patient_intake_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update intake photos" ON patient_intake_photos FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Staff can read all simulations" ON patient_simulations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert simulations" ON patient_simulations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update simulations" ON patient_simulations FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Staff can read all treatment preferences" ON patient_treatment_preferences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert treatment preferences" ON patient_treatment_preferences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update treatment preferences" ON patient_treatment_preferences FOR UPDATE TO authenticated USING (true);

-- Policies for anonymous users (public intake form)
CREATE POLICY "Anon can insert intake submissions" ON patient_intake_submissions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update own intake submissions" ON patient_intake_submissions FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can read own intake submissions" ON patient_intake_submissions FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert intake preferences" ON patient_intake_preferences FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update intake preferences" ON patient_intake_preferences FOR UPDATE TO anon USING (true);

CREATE POLICY "Anon can insert treatment areas" ON patient_treatment_areas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update treatment areas" ON patient_treatment_areas FOR UPDATE TO anon USING (true);

CREATE POLICY "Anon can insert measurements" ON patient_measurements FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update measurements" ON patient_measurements FOR UPDATE TO anon USING (true);

CREATE POLICY "Anon can insert intake photos" ON patient_intake_photos FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can insert treatment preferences" ON patient_treatment_preferences FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update treatment preferences" ON patient_treatment_preferences FOR UPDATE TO anon USING (true);

-- Service role full access
CREATE POLICY "Service role full access to intake_submissions" ON patient_intake_submissions FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access to intake_preferences" ON patient_intake_preferences FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access to treatment_areas" ON patient_treatment_areas FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access to measurements" ON patient_measurements FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access to intake_photos" ON patient_intake_photos FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access to simulations" ON patient_simulations FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access to treatment_preferences" ON patient_treatment_preferences FOR ALL TO service_role USING (true);

-- =====================================================
-- STORAGE BUCKET FOR INTAKE PHOTOS
-- =====================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-intake-photos',
  'patient-intake-photos',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies for patient-intake-photos bucket
CREATE POLICY "Authenticated users can read intake photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'patient-intake-photos');

CREATE POLICY "Authenticated users can upload intake photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'patient-intake-photos');

CREATE POLICY "Authenticated users can update intake photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'patient-intake-photos');

CREATE POLICY "Authenticated users can delete intake photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'patient-intake-photos');

-- Allow anonymous uploads for public intake form
CREATE POLICY "Anonymous users can upload intake photos"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'patient-intake-photos');

-- Service role full access
CREATE POLICY "Service role full access to intake photos storage"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'patient-intake-photos');

-- =====================================================
-- TRIGGER FOR UPDATING updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_intake_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_intake_submissions_updated_at
  BEFORE UPDATE ON patient_intake_submissions
  FOR EACH ROW EXECUTE FUNCTION update_intake_updated_at();

CREATE TRIGGER update_intake_preferences_updated_at
  BEFORE UPDATE ON patient_intake_preferences
  FOR EACH ROW EXECUTE FUNCTION update_intake_updated_at();

CREATE TRIGGER update_treatment_preferences_updated_at
  BEFORE UPDATE ON patient_treatment_preferences
  FOR EACH ROW EXECUTE FUNCTION update_intake_updated_at();

CREATE TRIGGER update_simulations_updated_at
  BEFORE UPDATE ON patient_simulations
  FOR EACH ROW EXECUTE FUNCTION update_intake_updated_at();
