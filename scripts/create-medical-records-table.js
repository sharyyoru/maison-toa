require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createMedicalRecordsTable() {
  console.log('Creating medical_records table...');

  // We'll create the table using individual insert/update operations
  // since we can't run raw SQL directly

  // First, check if table exists by trying to select from it
  const { error: checkError } = await supabase
    .from('medical_records')
    .select('id')
    .limit(1);

  if (!checkError) {
    console.log('medical_records table already exists');
    return true;
  }

  if (checkError && !checkError.message.includes('does not exist')) {
    console.log('Error checking table:', checkError.message);
  }

  console.log('');
  console.log('==============================================');
  console.log('MANUAL STEP REQUIRED:');
  console.log('==============================================');
  console.log('');
  console.log('Please run the following SQL in your Supabase SQL Editor:');
  console.log('Go to: https://supabase.com/dashboard/project/[YOUR-PROJECT]/sql');
  console.log('');
  console.log('--- SQL START ---');
  console.log(`
CREATE TABLE IF NOT EXISTS medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ap_content TEXT DEFAULT '',
  af_content TEXT DEFAULT '',
  notes_content TEXT DEFAULT '',
  ap_file_path TEXT,
  af_file_path TEXT,
  notes_file_path TEXT,
  source_folder TEXT,
  imported_from_storage BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_edited_by UUID,
  last_edited_by_name TEXT
);

CREATE INDEX IF NOT EXISTS medical_records_patient_id_idx ON medical_records(patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS medical_records_patient_unique ON medical_records(patient_id);

ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medical_records_select_policy" ON medical_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "medical_records_insert_policy" ON medical_records
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "medical_records_update_policy" ON medical_records
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "medical_records_delete_policy" ON medical_records
  FOR DELETE TO authenticated USING (true);
  `);
  console.log('--- SQL END ---');
  console.log('');
  console.log('After running the SQL, re-run this script to verify.');

  return false;
}

createMedicalRecordsTable()
  .then((exists) => {
    if (exists) {
      console.log('Setup complete!');
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
