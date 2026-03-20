/**
 * Patient Files Migration Script - PARALLEL VERSION
 * Migrates 127,511 files with parallel uploads for faster processing
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATA_FOLDER = 'C:\\Users\\user\\Desktop\\Maison-Toa-Data';

// Parallel processing settings
const CONCURRENT_UPLOADS = 10; // Number of parallel uploads
const CONCURRENT_FOLDERS = 5;  // Number of folders to process in parallel

// Stats tracking
const stats = {
  totalFolders: 0,
  processedFolders: 0,
  matchedPatients: 0,
  unmatchedPatients: 0,
  uploadedPDFs: 0,
  uploadedImages: 0,
  createdDocuments: 0,
  createdAppointments: 0,
  skippedFiles: 0,
  errors: [],
  startTime: null
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Cache for patient lookups
const patientCache = new Map();

/**
 * Pre-load all patients into cache for faster lookup
 */
async function loadPatientCache() {
  console.log('Loading patient cache...');
  let offset = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('patients')
      .select('id, first_name, last_name, dob, notes')
      .range(offset, offset + pageSize - 1);
    
    if (error || !data || data.length === 0) break;
    
    for (const patient of data) {
      // Index by name+dob
      const key1 = `${patient.first_name?.toLowerCase()}_${patient.last_name?.toLowerCase()}_${patient.dob}`;
      patientCache.set(key1, patient);
      
      // Index by patient number from notes
      if (patient.notes) {
        const match = patient.notes.match(/Patient Nr: (\d+)/);
        if (match) {
          patientCache.set(`nr_${match[1]}`, patient);
        }
      }
    }
    
    offset += pageSize;
    if (data.length < pageSize) break;
  }
  
  console.log(`Loaded ${patientCache.size} patient records into cache`);
}

/**
 * Parse folder name to extract patient info
 */
function parseFolderName(folderName) {
  const parts = folderName.split('_');
  if (parts.length < 4) return null;
  
  const patientNumber = parts[0];
  const firstName = parts[1];
  const dobPart = parts[parts.length - 1];
  const lastName = parts.slice(2, -1).join(' ');
  
  const dobMatch = dobPart.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!dobMatch) return null;
  
  const dob = `${dobMatch[3]}-${dobMatch[2]}-${dobMatch[1]}`;
  
  return { patientNumber, firstName: firstName.replace(/-/g, ' '), lastName, dob };
}

/**
 * Find patient using cache
 */
function findPatientInCache(patientInfo) {
  // Try by patient number first
  let patient = patientCache.get(`nr_${patientInfo.patientNumber}`);
  if (patient) return patient;
  
  // Try by name + dob
  const key = `${patientInfo.firstName.toLowerCase()}_${patientInfo.lastName.toLowerCase()}_${patientInfo.dob}`;
  patient = patientCache.get(key);
  if (patient) return patient;
  
  // Try fuzzy match
  const firstNamePart = patientInfo.firstName.split(' ')[0].toLowerCase();
  const lastNamePart = patientInfo.lastName.split(' ')[0].toLowerCase();
  
  for (const [k, p] of patientCache.entries()) {
    if (k.startsWith('nr_')) continue;
    if (p.first_name?.toLowerCase().includes(firstNamePart) && 
        p.last_name?.toLowerCase().includes(lastNamePart) &&
        p.dob === patientInfo.dob) {
      return p;
    }
  }
  
  return null;
}

/**
 * Get MIME type
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Upload file with retry
 */
async function uploadFileWithRetry(filePath, bucket, storagePath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(storagePath, fileBuffer, {
          contentType: getMimeType(filePath),
          upsert: true
        });
      
      if (error) throw error;
      
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      return urlData.publicUrl;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

/**
 * Process files in parallel batches
 */
async function processFilesInParallel(files, patientId, avatarUpdated) {
  const results = { pdfs: 0, images: 0, appointments: 0 };
  
  // Group files by type
  const pdfFiles = files.filter(f => f.ext === '.pdf');
  const imageFiles = files.filter(f => ['.jpg', '.jpeg', '.png'].includes(f.ext));
  const excelFiles = files.filter(f => ['.xlsx', '.xls'].includes(f.ext));
  
  // Process PDFs in parallel batches
  for (let i = 0; i < pdfFiles.length; i += CONCURRENT_UPLOADS) {
    const batch = pdfFiles.slice(i, i + CONCURRENT_UPLOADS);
    const promises = batch.map(async (file) => {
      try {
        const storagePath = `${patientId}/${file.category}/${file.filename}`;
        const publicUrl = await uploadFileWithRetry(file.path, 'patient-documents', storagePath);
        
        await supabase.from('patient_documents').insert({
          patient_id: patientId,
          title: file.filename.replace('.pdf', ''),
          file_path: publicUrl,
          status: 'final',
          created_by_name: 'Migration Script'
        });
        
        return 1;
      } catch (err) {
        stats.errors.push({ file: file.path, error: err.message });
        return 0;
      }
    });
    
    const results_batch = await Promise.all(promises);
    results.pdfs += results_batch.reduce((a, b) => a + b, 0);
  }
  
  // Process images
  for (const file of imageFiles) {
    try {
      const storagePath = `${patientId}/photos/${file.filename}`;
      const publicUrl = await uploadFileWithRetry(file.path, 'patient-photos', storagePath);
      
      if (!avatarUpdated.value && file.filename.toLowerCase().includes('photo')) {
        await supabase.from('patients').update({ avatar_url: publicUrl }).eq('id', patientId);
        avatarUpdated.value = true;
      }
      
      await supabase.from('patient_documents').insert({
        patient_id: patientId,
        title: file.filename.replace(file.ext, ''),
        file_path: publicUrl,
        status: 'final',
        created_by_name: 'Migration Script'
      });
      
      results.images++;
    } catch (err) {
      stats.errors.push({ file: file.path, error: err.message });
    }
  }
  
  // Process Excel files for appointments
  for (const file of excelFiles) {
    try {
      const workbook = XLSX.readFile(file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      
      const appointments = [];
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue;
        
        let startTime = null;
        const dateValue = row[0];
        
        if (typeof dateValue === 'number') {
          const excelDate = XLSX.SSF.parse_date_code(dateValue);
          if (excelDate) {
            startTime = new Date(excelDate.y, excelDate.m - 1, excelDate.d, excelDate.H || 9, excelDate.M || 0);
          }
        } else if (typeof dateValue === 'string' && dateValue.match(/\d/)) {
          const parsed = new Date(dateValue);
          if (!isNaN(parsed.getTime())) startTime = parsed;
        }
        
        if (!startTime || isNaN(startTime.getTime())) continue;
        
        const reason = row.slice(1).filter(c => c).join(' - ').substring(0, 500) || 'Legacy Appointment';
        
        appointments.push({
          patient_id: patientId,
          start_time: startTime.toISOString(),
          end_time: new Date(startTime.getTime() + 30 * 60000).toISOString(),
          status: 'completed',
          reason: reason,
          title: reason,
          source: 'manual',
          notes: `Imported from: ${file.filename}`
        });
      }
      
      if (appointments.length > 0) {
        const { error } = await supabase.from('appointments').insert(appointments);
        if (!error) results.appointments += appointments.length;
      }
    } catch (err) {
      stats.errors.push({ file: file.path, error: err.message });
    }
  }
  
  return results;
}

/**
 * Get all files with metadata
 */
function getAllFilesWithMeta(dirPath, files = []) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        getAllFilesWithMeta(fullPath, files);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'].includes(ext)) {
          let category = 'general';
          if (fullPath.includes('Factures annul')) category = 'invoices/cancelled';
          else if (fullPath.includes('Factures') || fullPath.includes('6_Factures')) category = 'invoices';
          else if (fullPath.includes('Consultations') || fullPath.includes('2_Consultations')) category = 'consultations';
          else if (fullPath.includes('Documents') || fullPath.includes('5_Documents')) category = 'documents';
          
          files.push({ path: fullPath, filename: entry.name, ext, category });
        }
      }
    }
  } catch (err) {
    // Skip inaccessible directories
  }
  
  return files;
}

/**
 * Process a single patient folder
 */
async function processPatientFolder(folderPath) {
  const folderName = path.basename(folderPath);
  const patientInfo = parseFolderName(folderName);
  
  if (!patientInfo) {
    stats.unmatchedPatients++;
    return null;
  }
  
  const patient = findPatientInCache(patientInfo);
  if (!patient) {
    stats.unmatchedPatients++;
    return null;
  }
  
  stats.matchedPatients++;
  
  const files = getAllFilesWithMeta(folderPath);
  if (files.length === 0) {
    stats.skippedFiles++;
    return null;
  }
  
  const avatarUpdated = { value: false };
  const results = await processFilesInParallel(files, patient.id, avatarUpdated);
  
  stats.uploadedPDFs += results.pdfs;
  stats.uploadedImages += results.images;
  stats.createdAppointments += results.appointments;
  stats.createdDocuments += results.pdfs + results.images;
  stats.processedFolders++;
  
  return results;
}

/**
 * Format time
 */
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/**
 * Main migration
 */
async function runMigration() {
  console.log('='.repeat(50));
  console.log('PARALLEL PATIENT FILES MIGRATION');
  console.log('='.repeat(50));
  console.log(`Concurrent uploads: ${CONCURRENT_UPLOADS}`);
  console.log(`Concurrent folders: ${CONCURRENT_FOLDERS}\n`);
  
  stats.startTime = Date.now();
  
  // Load patient cache
  await loadPatientCache();
  
  // Get all folders
  const entries = fs.readdirSync(DATA_FOLDER, { withFileTypes: true });
  const folders = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('wetransfer'))
    .map(e => path.join(DATA_FOLDER, e.name));
  
  stats.totalFolders = folders.length;
  console.log(`\nFound ${stats.totalFolders} patient folders\n`);
  
  // Process folders in parallel batches
  for (let i = 0; i < folders.length; i += CONCURRENT_FOLDERS) {
    const batch = folders.slice(i, i + CONCURRENT_FOLDERS);
    await Promise.all(batch.map(f => processPatientFolder(f)));
    
    // Progress update every 50 folders
    if ((i + CONCURRENT_FOLDERS) % 50 === 0 || i + CONCURRENT_FOLDERS >= folders.length) {
      const elapsed = Date.now() - stats.startTime;
      const rate = stats.processedFolders / (elapsed / 60000);
      const remaining = (stats.totalFolders - i - CONCURRENT_FOLDERS) / rate;
      
      console.log(`[${new Date().toLocaleTimeString()}] Progress: ${i + CONCURRENT_FOLDERS}/${stats.totalFolders} folders`);
      console.log(`  Docs: ${stats.createdDocuments} | Appts: ${stats.createdAppointments} | Errors: ${stats.errors.length}`);
      console.log(`  Rate: ${Math.round(rate)} folders/min | ETA: ${formatTime(remaining * 60000)}`);
    }
  }
  
  // Final report
  const totalTime = Date.now() - stats.startTime;
  console.log('\n' + '='.repeat(50));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(50));
  console.log(`Total Folders:      ${stats.totalFolders}`);
  console.log(`Matched Patients:   ${stats.matchedPatients}`);
  console.log(`Unmatched:          ${stats.unmatchedPatients}`);
  console.log(`Documents Created:  ${stats.createdDocuments}`);
  console.log(`Appointments:       ${stats.createdAppointments}`);
  console.log(`Errors:             ${stats.errors.length}`);
  console.log(`Total Time:         ${formatTime(totalTime)}`);
  
  // Save log
  fs.writeFileSync(
    path.join(__dirname, 'migration-parallel-log.json'),
    JSON.stringify({ stats, errors: stats.errors.slice(0, 100) }, null, 2)
  );
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
