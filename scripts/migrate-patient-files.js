/**
 * Patient Files Migration Script
 * Migrates 127,511 files from local folders to Supabase Storage
 * - PDFs → patient-documents bucket + patient_documents table
 * - Images → patient-photos bucket + avatar_url field
 * - Excel → appointments table (parsed)
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

// Batch sizes for processing
const BATCH_SIZE = 50;
const PROGRESS_LOG_INTERVAL = 100;

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
  errors: [],
  startTime: null
};

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Parse folder name to extract patient info
 * Format: [ID]_[FirstName]_[LastName]_[DOB]
 * Example: 10000_Maya_Maarfi_07-04-2000
 */
function parseFolderName(folderName) {
  const parts = folderName.split('_');
  if (parts.length < 4) return null;
  
  const patientNumber = parts[0];
  const firstName = parts[1];
  // Last name might have multiple parts, DOB is always last
  const dobPart = parts[parts.length - 1];
  const lastName = parts.slice(2, -1).join(' ');
  
  // Parse DOB from DD-MM-YYYY to YYYY-MM-DD
  const dobMatch = dobPart.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!dobMatch) return null;
  
  const dob = `${dobMatch[3]}-${dobMatch[2]}-${dobMatch[1]}`;
  
  return {
    patientNumber,
    firstName: firstName.replace(/-/g, ' '),
    lastName,
    dob,
    originalName: folderName
  };
}

/**
 * Find patient in database by name and DOB
 */
async function findPatient(patientInfo) {
  // Try exact match first
  let { data, error } = await supabase
    .from('patients')
    .select('id, first_name, last_name, dob, notes')
    .ilike('first_name', patientInfo.firstName)
    .ilike('last_name', patientInfo.lastName)
    .eq('dob', patientInfo.dob)
    .limit(1);
  
  if (data && data.length > 0) return data[0];
  
  // Try matching by patient number in notes
  ({ data, error } = await supabase
    .from('patients')
    .select('id, first_name, last_name, dob, notes')
    .ilike('notes', `%Patient Nr: ${patientInfo.patientNumber}%`)
    .limit(1));
  
  if (data && data.length > 0) return data[0];
  
  // Try fuzzy match on name only
  ({ data, error } = await supabase
    .from('patients')
    .select('id, first_name, last_name, dob, notes')
    .ilike('first_name', `%${patientInfo.firstName.split(' ')[0]}%`)
    .ilike('last_name', `%${patientInfo.lastName.split(' ')[0]}%`)
    .limit(5));
  
  if (data && data.length > 0) {
    // Check if any match the DOB
    const dobMatch = data.find(p => p.dob === patientInfo.dob);
    if (dobMatch) return dobMatch;
    // Return first match if no exact DOB match
    return data[0];
  }
  
  return null;
}

/**
 * Get document type based on filename
 */
function getDocumentType(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('invoice') || lower.includes('facture')) return 'invoice';
  if (lower.includes('consultation')) return 'consultation';
  if (lower.includes('analyse') || lower.includes('analysis')) return 'lab_result';
  if (lower.includes('photo')) return 'photo';
  if (lower.includes('confirmation') || lower.includes('prise_en_charge')) return 'insurance';
  if (lower.includes('reclaim') || lower.includes('receipt')) return 'receipt';
  if (lower.includes('fiche_patient') || lower.includes('patient_form')) return 'patient_form';
  if (lower.includes('note')) return 'notes';
  if (lower.includes('dunning')) return 'dunning';
  return 'other';
}

/**
 * Get document category for storage path
 */
function getDocumentCategory(filename, folderPath) {
  if (folderPath.includes('Factures annulées') || folderPath.includes('Factures annulees')) {
    return 'invoices/cancelled';
  }
  if (folderPath.includes('6_Factures') || folderPath.includes('Factures')) {
    return 'invoices';
  }
  if (folderPath.includes('2_Consultations')) {
    return 'consultations';
  }
  if (folderPath.includes('5_Documents')) {
    return 'documents';
  }
  return 'general';
}

/**
 * Upload a file to Supabase storage
 */
async function uploadFile(filePath, bucket, storagePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, {
        contentType: getMimeType(filePath),
        upsert: true
      });
    
    if (error) {
      throw error;
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath);
    
    return urlData.publicUrl;
  } catch (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Create a document record in the database
 */
async function createDocumentRecord(patientId, title, filePath, docType) {
  const { data, error } = await supabase
    .from('patient_documents')
    .insert({
      patient_id: patientId,
      title: title,
      file_path: filePath,
      status: 'final',
      created_by_name: 'Migration Script'
    })
    .select()
    .single();
  
  if (error) {
    throw error;
  }
  
  return data;
}

/**
 * Parse Excel appointment file and create appointments
 */
async function parseAndCreateAppointments(filePath, patientId) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    let appointmentsCreated = 0;
    
    // Skip header row if present
    const startRow = data[0] && (
      data[0][0]?.toString().toLowerCase().includes('date') ||
      data[0][0]?.toString().toLowerCase().includes('rdv')
    ) ? 1 : 0;
    
    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      // Try to parse date from first column
      let startTime = null;
      const dateValue = row[0];
      
      if (dateValue) {
        // Handle Excel serial date
        if (typeof dateValue === 'number') {
          const excelDate = XLSX.SSF.parse_date_code(dateValue);
          if (excelDate) {
            startTime = new Date(excelDate.y, excelDate.m - 1, excelDate.d, excelDate.H || 9, excelDate.M || 0);
          }
        } else if (typeof dateValue === 'string') {
          // Try to parse date string
          const parsed = new Date(dateValue);
          if (!isNaN(parsed.getTime())) {
            startTime = parsed;
          }
        }
      }
      
      if (!startTime || isNaN(startTime.getTime())) continue;
      
      // Get reason/notes from other columns
      const reason = row.slice(1).filter(c => c).join(' - ').substring(0, 500);
      
      // Create appointment
      const { error } = await supabase
        .from('appointments')
        .insert({
          patient_id: patientId,
          start_time: startTime.toISOString(),
          end_time: new Date(startTime.getTime() + 30 * 60000).toISOString(), // 30 min default
          status: 'completed',
          reason: reason || 'Imported from legacy system',
          title: reason || 'Legacy Appointment',
          source: 'manual',
          notes: `Imported from: ${path.basename(filePath)}`
        });
      
      if (!error) {
        appointmentsCreated++;
      }
    }
    
    return appointmentsCreated;
  } catch (error) {
    console.error(`Error parsing Excel ${filePath}: ${error.message}`);
    return 0;
  }
}

/**
 * Process all files in a patient folder
 */
async function processPatientFolder(folderPath, patient) {
  const results = { pdfs: 0, images: 0, appointments: 0, errors: [] };
  
  // Get all files recursively
  const files = getAllFiles(folderPath);
  
  for (const filePath of files) {
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const relativePath = path.relative(folderPath, filePath);
    
    try {
      if (ext === '.pdf') {
        // Upload PDF to storage
        const category = getDocumentCategory(filename, filePath);
        const storagePath = `${patient.id}/${category}/${filename}`;
        
        const publicUrl = await uploadFile(filePath, 'patient-documents', storagePath);
        
        // Create document record
        await createDocumentRecord(
          patient.id,
          filename.replace('.pdf', ''),
          publicUrl,
          getDocumentType(filename)
        );
        
        results.pdfs++;
        stats.uploadedPDFs++;
        stats.createdDocuments++;
        
      } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        // Upload image to patient-photos bucket
        const storagePath = `${patient.id}/photos/${filename}`;
        const publicUrl = await uploadFile(filePath, 'patient-photos', storagePath);
        
        // Update patient avatar if this looks like a profile photo
        if (filename.toLowerCase().includes('photo') && !patient.avatarUpdated) {
          await supabase
            .from('patients')
            .update({ avatar_url: publicUrl })
            .eq('id', patient.id);
          patient.avatarUpdated = true;
        }
        
        // Also create a document record for tracking
        await createDocumentRecord(
          patient.id,
          filename.replace(ext, ''),
          publicUrl,
          'photo'
        );
        
        results.images++;
        stats.uploadedImages++;
        
      } else if (['.xlsx', '.xls'].includes(ext)) {
        // Parse Excel for appointments
        const appointmentsCreated = await parseAndCreateAppointments(filePath, patient.id);
        results.appointments += appointmentsCreated;
        stats.createdAppointments += appointmentsCreated;
      }
      
    } catch (error) {
      results.errors.push(`${filename}: ${error.message}`);
      stats.errors.push({ file: filePath, error: error.message });
    }
  }
  
  return results;
}

/**
 * Get all files in a directory recursively
 */
function getAllFiles(dirPath, files = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Get all patient folders
 */
function getPatientFolders() {
  const entries = fs.readdirSync(DATA_FOLDER, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('wetransfer'))
    .map(e => path.join(DATA_FOLDER, e.name));
}

/**
 * Format elapsed time
 */
function formatElapsed(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Estimate remaining time
 */
function estimateRemaining(processed, total, elapsedMs) {
  if (processed === 0) return 'calculating...';
  const msPerItem = elapsedMs / processed;
  const remaining = (total - processed) * msPerItem;
  return formatElapsed(remaining);
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('========================================');
  console.log('PATIENT FILES MIGRATION');
  console.log('========================================\n');
  
  stats.startTime = Date.now();
  
  // Get all patient folders
  const folders = getPatientFolders();
  stats.totalFolders = folders.length;
  
  console.log(`Found ${stats.totalFolders} patient folders to process\n`);
  console.log('Starting migration...\n');
  
  // Process unmatched patients log
  const unmatchedLog = [];
  
  for (let i = 0; i < folders.length; i++) {
    const folderPath = folders[i];
    const folderName = path.basename(folderPath);
    
    // Parse folder name
    const patientInfo = parseFolderName(folderName);
    if (!patientInfo) {
      console.log(`[SKIP] Could not parse folder: ${folderName}`);
      stats.unmatchedPatients++;
      unmatchedLog.push({ folder: folderName, reason: 'Could not parse name' });
      continue;
    }
    
    // Find patient in database
    const patient = await findPatient(patientInfo);
    if (!patient) {
      stats.unmatchedPatients++;
      unmatchedLog.push({ 
        folder: folderName, 
        reason: 'No matching patient in database',
        searched: `${patientInfo.firstName} ${patientInfo.lastName} (${patientInfo.dob})`
      });
      
      // Log every 100 unmatched
      if (stats.unmatchedPatients % 100 === 0) {
        console.log(`[WARN] ${stats.unmatchedPatients} unmatched patients so far...`);
      }
      continue;
    }
    
    stats.matchedPatients++;
    
    // Process the folder
    const results = await processPatientFolder(folderPath, patient);
    stats.processedFolders++;
    
    // Progress log
    if (stats.processedFolders % PROGRESS_LOG_INTERVAL === 0 || i === folders.length - 1) {
      const elapsed = Date.now() - stats.startTime;
      const remaining = estimateRemaining(stats.processedFolders, stats.matchedPatients, elapsed);
      
      console.log(`\n[PROGRESS] ${stats.processedFolders}/${stats.matchedPatients} folders processed`);
      console.log(`  PDFs: ${stats.uploadedPDFs} | Images: ${stats.uploadedImages} | Appointments: ${stats.createdAppointments}`);
      console.log(`  Elapsed: ${formatElapsed(elapsed)} | Est. Remaining: ${remaining}`);
      console.log(`  Errors: ${stats.errors.length}`);
    }
  }
  
  // Final report
  const totalElapsed = Date.now() - stats.startTime;
  
  console.log('\n========================================');
  console.log('MIGRATION COMPLETE');
  console.log('========================================\n');
  
  console.log('SUMMARY:');
  console.log(`  Total Folders:        ${stats.totalFolders}`);
  console.log(`  Matched Patients:     ${stats.matchedPatients}`);
  console.log(`  Unmatched Patients:   ${stats.unmatchedPatients}`);
  console.log(`  Processed Folders:    ${stats.processedFolders}`);
  console.log(`  Uploaded PDFs:        ${stats.uploadedPDFs}`);
  console.log(`  Uploaded Images:      ${stats.uploadedImages}`);
  console.log(`  Created Documents:    ${stats.createdDocuments}`);
  console.log(`  Created Appointments: ${stats.createdAppointments}`);
  console.log(`  Errors:               ${stats.errors.length}`);
  console.log(`  Total Time:           ${formatElapsed(totalElapsed)}`);
  
  // Save detailed logs
  const logPath = path.join(__dirname, 'migration-log.json');
  fs.writeFileSync(logPath, JSON.stringify({
    stats,
    unmatchedPatients: unmatchedLog,
    errors: stats.errors
  }, null, 2));
  
  console.log(`\nDetailed log saved to: ${logPath}`);
}

// Check for required dependencies
async function checkDependencies() {
  try {
    require('xlsx');
    return true;
  } catch (e) {
    console.log('Installing required dependency: xlsx');
    const { execSync } = require('child_process');
    execSync('npm install xlsx', { stdio: 'inherit' });
    return true;
  }
}

// Run
checkDependencies()
  .then(() => runMigration())
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
