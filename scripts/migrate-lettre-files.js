/**
 * Migrate Lettre folder files to Supabase Storage
 * These are patient documents (consent forms, questionnaires, etc.) that should be viewable
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const DATA_FOLDER = 'C:/Users/user/Desktop/Maison-Toa-Data';

const stats = {
  processed: 0,
  uploaded: 0,
  skipped: 0,
  errors: 0
};

async function findPatient(patientNr, firstName, lastName, dob) {
  // Try exact match by patient_nr in notes
  const { data: byNotes } = await supabase
    .from('patients')
    .select('id, first_name, last_name')
    .ilike('notes', `%Patient Nr: ${patientNr}%`)
    .limit(1);
  
  if (byNotes && byNotes.length > 0) return byNotes[0];
  
  // Try by name and DOB
  const { data: byName } = await supabase
    .from('patients')
    .select('id, first_name, last_name')
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .limit(1);
  
  if (byName && byName.length > 0) return byName[0];
  
  return null;
}

async function uploadFile(filePath, bucket, storagePath) {
  const fileContent = fs.readFileSync(filePath);
  const contentType = filePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 
                      filePath.toLowerCase().match(/\.(jpg|jpeg)$/) ? 'image/jpeg' :
                      filePath.toLowerCase().endsWith('.png') ? 'image/png' : 
                      'application/octet-stream';
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, fileContent, {
      contentType,
      upsert: true
    });
  
  if (error) throw error;
  
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return urlData.publicUrl;
}

async function createDocumentRecord(patientId, title, filePath, docType = 'letter') {
  const { data, error } = await supabase
    .from('patient_documents')
    .insert({
      patient_id: patientId,
      title: title,
      file_path: filePath,
      document_type: docType,
      status: 'final',
      created_by_name: 'Migration Script'
    })
    .select()
    .single();
  
  if (error && !error.message.includes('duplicate')) {
    throw error;
  }
  
  return data;
}

async function processPatientFolder(folderPath) {
  const folderName = path.basename(folderPath);
  const parts = folderName.split('_');
  const patientNr = parts[0];
  const firstName = parts[1] || '';
  const lastName = parts[2] || '';
  const dob = parts[3] || '';
  
  const patient = await findPatient(patientNr, firstName, lastName, dob);
  if (!patient) {
    return { uploaded: 0, errors: ['Patient not found'] };
  }
  
  const results = { uploaded: 0, errors: [] };
  
  // Process Lettre folder
  const lettrePath = path.join(folderPath, '5_Documents', 'Lettre');
  if (fs.existsSync(lettrePath)) {
    const files = fs.readdirSync(lettrePath);
    
    for (const file of files) {
      const filePath = path.join(lettrePath, file);
      if (!fs.statSync(filePath).isFile()) continue;
      
      try {
        // Determine file extension
        let ext = path.extname(file).toLowerCase();
        if (!ext) {
          // Check file header to determine type
          const buffer = Buffer.alloc(5);
          const fd = fs.openSync(filePath, 'r');
          fs.readSync(fd, buffer, 0, 5, 0);
          fs.closeSync(fd);
          
          if (buffer.toString().startsWith('%PDF')) {
            ext = '.pdf';
          } else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
            ext = '.jpg';
          } else if (buffer.toString().startsWith('\x89PNG')) {
            ext = '.png';
          }
        }
        
        const fileName = file + (ext && !file.endsWith(ext) ? ext : '');
        const storagePath = `${patient.id}/lettre/${fileName}`;
        
        const publicUrl = await uploadFile(filePath, 'patient-documents', storagePath);
        
        await createDocumentRecord(
          patient.id,
          file.replace(/\.[^.]+$/, ''),
          publicUrl,
          'letter'
        );
        
        results.uploaded++;
      } catch (error) {
        results.errors.push(`${file}: ${error.message}`);
      }
    }
  }
  
  return results;
}

async function main() {
  console.log('Starting Lettre files migration...\n');
  
  const folders = fs.readdirSync(DATA_FOLDER)
    .filter(f => {
      const fp = path.join(DATA_FOLDER, f);
      return fs.statSync(fp).isDirectory() && /^\d+_/.test(f);
    });
  
  console.log(`Found ${folders.length} patient folders to process\n`);
  
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const folderPath = path.join(DATA_FOLDER, folder);
    
    try {
      const result = await processPatientFolder(folderPath);
      stats.processed++;
      stats.uploaded += result.uploaded;
      if (result.errors.length > 0) {
        stats.errors += result.errors.length;
      }
    } catch (error) {
      stats.errors++;
    }
    
    if ((i + 1) % 100 === 0) {
      console.log(`Progress: ${i + 1}/${folders.length} folders processed`);
    }
  }
  
  console.log('\n=== Migration Complete ===');
  console.log(`Folders processed: ${stats.processed}`);
  console.log(`Files uploaded: ${stats.uploaded}`);
  console.log(`Errors: ${stats.errors}`);
}

main().catch(console.error);
