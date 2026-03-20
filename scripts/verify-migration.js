const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mwtdhbllkzuryswrumrd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verify() {
  // Count total patients
  const { count } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true });
  
  console.log('Total patients in database:', count);
  
  // Get sample patients
  const { data } = await supabase
    .from('patients')
    .select('first_name, last_name, dob, notes')
    .limit(5);
  
  console.log('\nSample patients:');
  data.forEach(p => console.log(`  - ${p.first_name} ${p.last_name} (DOB: ${p.dob})`));
  
  // Count migrated patients (those with migration notes)
  const { count: migratedCount } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true })
    .ilike('notes', '%Migrated from Aesthetics Clinic%');
  
  console.log('\nMigrated patients (from Aesthetics Clinic):', migratedCount);
}

verify().catch(console.error);
