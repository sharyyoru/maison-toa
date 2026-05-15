require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DATA_FOLDER = 'C:\\Users\\user\\Desktop\\Maison-Toa-Data';
const BUCKET_NAME = 'patient-docs';

// Files to look for in the 2_Consultations folder
const TARGET_FILES = ['notes.pdf', 'ap.pdf', 'af.pdf'];
const CONSULTATION_PATTERN = /^consultation/i;

async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);
  
  if (!bucketExists) {
    console.log(`Creating bucket: ${BUCKET_NAME}`);
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: 52428800 // 50MB
    });
    if (error) {
      console.error('Error creating bucket:', error.message);
      return false;
    }
  }
  return true;
}

function parseFolderName(folderName) {
  // Pattern: 10000_Maya_Maarfi_07-04-2000
  const parts = folderName.split('_');
  if (parts.length < 4) return null;
  
  const patientId = parts[0];
  const firstName = parts[1];
  const lastName = parts.slice(2, -1).join('_'); // Handle multi-part last names
  const dob = parts[parts.length - 1];
  
  return { patientId, firstName, lastName, dob };
}

async function uploadFile(localPath, remotePath) {
  const fileBuffer = fs.readFileSync(localPath);
  const contentType = localPath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
  
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(remotePath, fileBuffer, {
      contentType,
      upsert: true
    });
  
  if (error && !error.message.includes('already exists')) {
    throw error;
  }
  
  return true;
}

async function processPatientFolder(folderPath, folderName) {
  const info = parseFolderName(folderName);
  if (!info) return { uploaded: 0 };
  
  // Create Axenita-compatible folder name
  const axenitaFolder = `axenita-${info.patientId}_${info.firstName}_${info.lastName}_${info.dob}`;
  
  // Check for 2_Consultations subfolder
  const consultationsPath = path.join(folderPath, '2_Consultations');
  if (!fs.existsSync(consultationsPath)) {
    return { uploaded: 0 };
  }
  
  let uploaded = 0;
  const files = fs.readdirSync(consultationsPath);
  
  for (const file of files) {
    const fileLower = file.toLowerCase();
    const filePath = path.join(consultationsPath, file);
    
    // Skip if not a file
    if (!fs.statSync(filePath).isFile()) continue;
    
    // Check if it's a target file (notes.pdf, ap.pdf, af.pdf) or consultation*.pdf
    const isTargetFile = TARGET_FILES.includes(fileLower) || 
                         (CONSULTATION_PATTERN.test(fileLower) && fileLower.endsWith('.pdf'));
    
    if (isTargetFile) {
      try {
        const remotePath = `${axenitaFolder}/${file}`;
        await uploadFile(filePath, remotePath);
        uploaded++;
      } catch (err) {
        console.error(`Error uploading ${file}:`, err.message);
      }
    }
  }
  
  return { uploaded, axenitaFolder };
}

async function main() {
  console.log('Starting Axenita docs migration...');
  console.log('Source:', DATA_FOLDER);
  console.log('Bucket:', BUCKET_NAME);
  
  // Ensure bucket exists
  if (!await ensureBucketExists()) {
    console.error('Failed to ensure bucket exists');
    return;
  }
  
  // Get all patient folders
  const folders = fs.readdirSync(DATA_FOLDER).filter(f => {
    const fullPath = path.join(DATA_FOLDER, f);
    return fs.statSync(fullPath).isDirectory() && /^\d+_/.test(f);
  });
  
  console.log(`Found ${folders.length} patient folders to process\n`);
  
  let totalUploaded = 0;
  let foldersWithDocs = 0;
  
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const folderPath = path.join(DATA_FOLDER, folder);
    
    const result = await processPatientFolder(folderPath, folder);
    
    if (result.uploaded > 0) {
      totalUploaded += result.uploaded;
      foldersWithDocs++;
      console.log(`[${i + 1}/${folders.length}] ${folder}: ${result.uploaded} files uploaded -> ${result.axenitaFolder}`);
    }
    
    if ((i + 1) % 500 === 0) {
      console.log(`Progress: ${i + 1}/${folders.length} folders processed, ${totalUploaded} files uploaded`);
    }
  }
  
  console.log('\n=== Migration Complete ===');
  console.log(`Total folders processed: ${folders.length}`);
  console.log(`Folders with Axenita docs: ${foldersWithDocs}`);
  console.log(`Total files uploaded: ${totalUploaded}`);
}

main().catch(console.error);
