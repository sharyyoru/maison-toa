require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { inflateRawSync, inflateSync } = require('zlib');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// PDF text extraction helpers
function extractTextFromPdfContent(content) {
  const textMatches = [];
  const btEtRegex = /BT[\s\S]*?ET/g;
  const blocks = content.match(btEtRegex) || [];
  
  for (const block of blocks) {
    const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g) || [];
    for (const tj of tjMatches) {
      const text = tj.match(/\(([^)]*)\)/)?.[1] || "";
      if (text && text.length > 0) textMatches.push(text);
    }
    
    const tjArrayMatches = block.match(/\[([^\]]*)\]\s*TJ/gi) || [];
    for (const tjArray of tjArrayMatches) {
      const innerTexts = tjArray.match(/\(([^)]*)\)/g) || [];
      for (const innerText of innerTexts) {
        const text = innerText.slice(1, -1);
        if (text && text.length > 0) textMatches.push(text);
      }
    }
  }
  
  return textMatches;
}

function decodePdfString(str) {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\(.)/g, "$1");
}

async function extractPdfText(buffer) {
  try {
    const allText = [];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    const pdfContent = buffer.toString("binary");
    
    while ((match = streamRegex.exec(pdfContent)) !== null) {
      const streamData = match[1];
      const beforeStream = pdfContent.substring(Math.max(0, match.index - 500), match.index);
      const isFlateEncoded = /\/Filter\s*\/FlateDecode/i.test(beforeStream) || 
                             /\/Filter\s*\[\s*\/FlateDecode\s*\]/i.test(beforeStream);
      
      try {
        let decompressed;
        
        if (isFlateEncoded) {
          const streamBuffer = Buffer.from(streamData, "binary");
          try {
            decompressed = inflateRawSync(streamBuffer).toString("latin1");
          } catch {
            try {
              decompressed = inflateSync(streamBuffer).toString("latin1");
            } catch {
              continue;
            }
          }
        } else {
          decompressed = streamData;
        }
        
        const texts = extractTextFromPdfContent(decompressed);
        for (const text of texts) {
          const decoded = decodePdfString(text);
          if (decoded.trim().length > 0) {
            allText.push(decoded);
          }
        }
      } catch {
        continue;
      }
    }
    
    if (allText.length > 0) {
      return allText.join(" ").replace(/\s+/g, " ").trim();
    }
    
    return "[PDF content]";
  } catch (err) {
    return "[PDF content - unable to extract text]";
  }
}

async function downloadAndExtract(bucket, filePath) {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !data) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    return await extractPdfText(buffer);
  } catch {
    return null;
  }
}

// Migrate from patient-documents bucket (UUID-based folders)
async function migratePatientDocuments() {
  console.log('=== Migrating from patient-documents bucket ===');
  
  // Get all patients
  const { data: patients, error } = await supabase
    .from('patients')
    .select('id, first_name, last_name');
  
  if (error || !patients) {
    console.error('Failed to get patients:', error?.message);
    return 0;
  }
  
  console.log(`Checking ${patients.length} patients for medical records...`);
  
  let migrated = 0;
  let checked = 0;
  
  for (const patient of patients) {
    checked++;
    
    // Check if patient has consultations folder
    const { data: files } = await supabase.storage
      .from('patient-documents')
      .list(`${patient.id}/consultations`, { limit: 50 });
    
    if (!files || files.length === 0) continue;
    
    // Look for AP.pdf, AF.pdf, Notes.pdf
    let apContent = '';
    let afContent = '';
    let notesContent = '';
    let apPath = null;
    let afPath = null;
    let notesPath = null;
    
    for (const file of files) {
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.pdf')) continue;
      
      const filePath = `${patient.id}/consultations/${file.name}`;
      const text = await downloadAndExtract('patient-documents', filePath);
      
      if (!text) continue;
      
      if (fileName === 'ap.pdf') {
        apContent = text;
        apPath = filePath;
      } else if (fileName === 'af.pdf') {
        afContent = text;
        afPath = filePath;
      } else if (fileName === 'notes.pdf') {
        notesContent = text;
        notesPath = filePath;
      } else if (fileName.startsWith('consultations')) {
        notesContent += (notesContent ? '\n\n---\n\n' : '') + text;
        if (!notesPath) notesPath = filePath;
      }
    }
    
    // Only upsert if we found any content
    if (apContent || afContent || notesContent) {
      const { error: upsertError } = await supabase
        .from('medical_records')
        .upsert({
          patient_id: patient.id,
          ap_content: apContent.substring(0, 50000),
          af_content: afContent.substring(0, 50000),
          notes_content: notesContent.substring(0, 50000),
          ap_file_path: apPath ? `patient-documents/${apPath}` : null,
          af_file_path: afPath ? `patient-documents/${afPath}` : null,
          notes_file_path: notesPath ? `patient-documents/${notesPath}` : null,
          source_folder: `patient-documents/${patient.id}`,
          imported_from_storage: true,
          last_edited_by_name: 'Migration Script'
        }, { onConflict: 'patient_id' });
      
      if (!upsertError) {
        migrated++;
        console.log(`  [${checked}/${patients.length}] ${patient.first_name} ${patient.last_name}: migrated`);
      }
    }
    
    if (checked % 100 === 0) {
      console.log(`Progress: ${checked}/${patients.length} checked, ${migrated} migrated`);
    }
  }
  
  console.log(`patient-documents: ${migrated} records migrated\n`);
  return migrated;
}

// Migrate Nicole Ferrari specifically (for immediate fix)
async function migrateNicoleFerrari() {
  const patientId = '94516264-925c-48ef-b1a0-773c9fb8d48a';
  console.log('=== Migrating Nicole Ferrari specifically ===');
  
  const { data: files } = await supabase.storage
    .from('patient-documents')
    .list(`${patientId}/consultations`, { limit: 50 });
  
  if (!files) {
    console.log('No files found');
    return;
  }
  
  console.log('Files found:', files.map(f => f.name));
  
  let apContent = '';
  let notesContent = '';
  let apPath = null;
  let notesPath = null;
  
  for (const file of files) {
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.pdf')) continue;
    
    const filePath = `${patientId}/consultations/${file.name}`;
    console.log(`Processing: ${file.name}`);
    
    const text = await downloadAndExtract('patient-documents', filePath);
    console.log(`  Extracted ${text?.length || 0} chars`);
    
    if (!text) continue;
    
    if (fileName === 'ap.pdf') {
      apContent = text;
      apPath = filePath;
    } else if (fileName === 'notes.pdf') {
      notesContent = text;
      notesPath = filePath;
    } else if (fileName.startsWith('consultations')) {
      notesContent += (notesContent ? '\n\n---\n\n' : '') + text;
      if (!notesPath) notesPath = filePath;
    }
  }
  
  console.log(`AP content length: ${apContent.length}`);
  console.log(`Notes content length: ${notesContent.length}`);
  
  const { error } = await supabase
    .from('medical_records')
    .upsert({
      patient_id: patientId,
      ap_content: apContent.substring(0, 50000),
      af_content: '',
      notes_content: notesContent.substring(0, 50000),
      ap_file_path: apPath ? `patient-documents/${apPath}` : null,
      notes_file_path: notesPath ? `patient-documents/${notesPath}` : null,
      source_folder: `patient-documents/${patientId}`,
      imported_from_storage: true,
      last_edited_by_name: 'Migration Script'
    }, { onConflict: 'patient_id' });
  
  if (error) {
    console.log('Upsert error:', error.message);
  } else {
    console.log('Nicole Ferrari migrated successfully!');
  }
}

async function main() {
  // First, migrate Nicole Ferrari immediately
  await migrateNicoleFerrari();
  
  console.log('\n');
  
  // Then run full migration for all patients
  const total = await migratePatientDocuments();
  
  // Final count
  const { count } = await supabase
    .from('medical_records')
    .select('id', { count: 'exact', head: true });
  
  console.log('=== COMPLETE ===');
  console.log(`Total medical records in DB: ${count}`);
}

main().catch(console.error);
