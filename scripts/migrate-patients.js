/**
 * Patient Migration Script for Maison Toa
 * Reads CSV export and imports patients to Supabase
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mwtdhbllkzuryswrumrd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('Please set it in your .env.local file or export it:');
  console.log('export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// CSV file path
const CSV_FILE = path.join('C:', 'Users', 'user', 'Desktop', 'Maison-Toa-Data', 'Exportreport_20260212.csv');

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

/**
 * Parse date from DD-MM-YYYY format to YYYY-MM-DD
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr === '-') return null;
  
  // Handle DD-MM-YYYY format
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  
  // Handle DD.MM.YYYY HH:MM format (for last appointment)
  const matchWithTime = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (matchWithTime) {
    const [, day, month, year] = matchWithTime;
    return `${year}-${month}-${day}`;
  }
  
  return null;
}

/**
 * Main migration function
 */
async function migratePatients() {
  console.log('='.repeat(60));
  console.log('Maison Toa Patient Migration');
  console.log('='.repeat(60));
  console.log(`\nReading CSV from: ${CSV_FILE}\n`);

  // Read and parse CSV
  const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  // Parse header
  const header = parseCSVLine(lines[0]);
  console.log('CSV Headers:', header);
  
  // Map header indices
  const headerMap = {};
  header.forEach((col, idx) => {
    headerMap[col.toLowerCase().replace(/[^a-z0-9]/g, '_')] = idx;
  });
  
  console.log(`\nTotal rows in CSV: ${lines.length - 1}`);
  
  // Parse all patient rows
  const patients = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 6) continue;
    
    const patientId = row[headerMap['patient_id']] || null;
    const patientNr = row[headerMap['patient_nr_']] || row[1] || '';
    const firstName = row[headerMap['first_name']] || row[3] || '';
    const lastName = row[headerMap['last_name']] || row[4] || '';
    const dob = row[headerMap['date_of_birth']] || row[5] || '';
    const lastAppointment = row[6] || '';
    
    if (!firstName && !lastName) continue;
    
    patients.push({
      id: patientId,
      patient_nr: patientNr,
      first_name: firstName,
      last_name: lastName,
      dob: parseDate(dob),
      last_appointment: parseDate(lastAppointment),
      source: 'manual',
      notes: `Migrated from Aesthetics Clinic\nPatient Nr: ${patientNr}${lastAppointment && lastAppointment !== '-' ? `\nLast Appointment: ${lastAppointment}` : ''}`,
    });
  }
  
  console.log(`Parsed ${patients.length} patients from CSV\n`);
  
  // Check for existing patients to avoid duplicates
  console.log('Checking for existing patients...');
  const { data: existingPatients, error: fetchError } = await supabase
    .from('patients')
    .select('id, first_name, last_name, email');
  
  if (fetchError) {
    console.error('Error fetching existing patients:', fetchError);
    process.exit(1);
  }
  
  console.log(`Found ${existingPatients?.length || 0} existing patients in database\n`);
  
  // Create a set of existing patient IDs
  const existingIds = new Set(existingPatients?.map(p => p.id) || []);
  
  // Filter out patients that already exist
  const newPatients = patients.filter(p => !existingIds.has(p.id));
  console.log(`New patients to import: ${newPatients.length}`);
  console.log(`Already existing (will skip): ${patients.length - newPatients.length}\n`);
  
  if (newPatients.length === 0) {
    console.log('No new patients to import. Migration complete.');
    return;
  }
  
  // Import in batches
  const BATCH_SIZE = 100;
  let imported = 0;
  let failed = 0;
  const errors = [];
  
  console.log(`Importing ${newPatients.length} patients in batches of ${BATCH_SIZE}...\n`);
  
  for (let i = 0; i < newPatients.length; i += BATCH_SIZE) {
    const batch = newPatients.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(newPatients.length / BATCH_SIZE);
    
    process.stdout.write(`Batch ${batchNum}/${totalBatches}: Importing ${batch.length} patients... `);
    
    // Prepare batch for insert
    const insertData = batch.map(p => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      dob: p.dob,
      source: p.source,
      notes: p.notes,
      lifecycle_stage: 'patient',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    
    const { data, error } = await supabase
      .from('patients')
      .upsert(insertData, { 
        onConflict: 'id',
        ignoreDuplicates: false 
      })
      .select('id');
    
    if (error) {
      console.log(`FAILED - ${error.message}`);
      failed += batch.length;
      errors.push(`Batch ${batchNum}: ${error.message}`);
      
      // Try inserting one by one to identify problematic records
      console.log('  Retrying individually...');
      for (const patient of batch) {
        const { error: singleError } = await supabase
          .from('patients')
          .upsert({
            id: patient.id,
            first_name: patient.first_name,
            last_name: patient.last_name,
            dob: patient.dob,
            source: patient.source,
            notes: patient.notes,
            lifecycle_stage: 'patient',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
        
        if (singleError) {
          errors.push(`  ${patient.first_name} ${patient.last_name}: ${singleError.message}`);
        } else {
          imported++;
          failed--;
        }
      }
    } else {
      console.log(`OK (${data?.length || batch.length} inserted)`);
      imported += batch.length;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total in CSV:     ${patients.length}`);
  console.log(`Already existed:  ${patients.length - newPatients.length}`);
  console.log(`Imported:         ${imported}`);
  console.log(`Failed:           ${failed}`);
  
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    errors.slice(0, 20).forEach(e => console.log(`  - ${e}`));
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more`);
    }
  }
  
  console.log('\nMigration complete!');
}

// Run migration
migratePatients().catch(console.error);
