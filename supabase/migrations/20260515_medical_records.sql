-- Medical Records table for storing editable AP, AF, and Notes content
-- This allows fast loading from database instead of parsing PDFs from storage

CREATE TABLE IF NOT EXISTS medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  
  -- Three main content sections
  ap_content TEXT DEFAULT '',           -- Medical Notes (AP)
  af_content TEXT DEFAULT '',           -- Medical Notes (AF)
  notes_content TEXT DEFAULT '',        -- General Notes
  
  -- Original file references (for backup/reference)
  ap_file_path TEXT,                    -- Path in patient-docs bucket
  af_file_path TEXT,
  notes_file_path TEXT,
  
  -- Source tracking
  source_folder TEXT,                   -- Original Axenita folder name
  imported_from_storage BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_edited_by UUID REFERENCES users(id),
  last_edited_by_name TEXT
);

-- Index for fast patient lookup
CREATE INDEX IF NOT EXISTS medical_records_patient_id_idx ON medical_records(patient_id);

-- Unique constraint - one record per patient
CREATE UNIQUE INDEX IF NOT EXISTS medical_records_patient_unique ON medical_records(patient_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_medical_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS medical_records_updated_at ON medical_records;
CREATE TRIGGER medical_records_updated_at
  BEFORE UPDATE ON medical_records
  FOR EACH ROW
  EXECUTE FUNCTION update_medical_records_updated_at();

-- Enable RLS
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read all records
CREATE POLICY "medical_records_select_policy" ON medical_records
  FOR SELECT TO authenticated
  USING (true);

-- Policy for authenticated users to insert/update/delete
CREATE POLICY "medical_records_insert_policy" ON medical_records
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "medical_records_update_policy" ON medical_records
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "medical_records_delete_policy" ON medical_records
  FOR DELETE TO authenticated
  USING (true);

COMMENT ON TABLE medical_records IS 'Stores editable medical record content (AP, AF, Notes) for each patient with autosave support';
