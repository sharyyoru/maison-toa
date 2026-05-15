require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { inflateRawSync, inflateSync } = require('zlib');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET_NAME = 'patient-docs';

// Extract text from PDF
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
            const inflated = inflateRawSync(streamBuffer);
            decompressed = inflated.toString("latin1");
          } catch {
            try {
              const inflated = inflateSync(streamBuffer);
              decompressed = inflated.toString("latin1");
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
    console.error("PDF extraction error:", err.message);
    return "[PDF content - unable to extract text]";
  }
}

// Parse folder name: axenita-10000_Maya_Maarfi_07-04-2000
function parseFolderName(folderName) {
  const match = folderName.match(/^axenita-(\d+)_([^_]+)_([^_]+(?:_[^_]+)*)_(\d{2}-\d{2}-\d{4})$/);
  if (match) {
    return {
      patientId: match[1],
      firstName: match[2],
      lastName: match[3].replace(/_/g, ' '),
      dob: match[4]
    };
  }
  return null;
}

async function findPatientId(firstName, lastName) {
  // Try exact match first
  const { data, error } = await supabase
    .from('patients')
    .select('id')
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .limit(1);
  
  if (data && data.length > 0) {
    return data[0].id;
  }
  
  // Try partial match
  const { data: partial } = await supabase
    .from('patients')
    .select('id')
    .ilike('first_name', `%${firstName}%`)
    .ilike('last_name', `%${lastName}%`)
    .limit(1);
  
  if (partial && partial.length > 0) {
    return partial[0].id;
  }
  
  return null;
}

async function migrateFolder(folderName) {
  const info = parseFolderName(folderName);
  if (!info) return { success: false, reason: 'invalid folder name' };
  
  // Find patient
  const patientId = await findPatientId(info.firstName, info.lastName);
  if (!patientId) {
    return { success: false, reason: 'patient not found' };
  }
  
  // Get files in folder
  const { data: files, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(folderName, { limit: 100 });
  
  if (error || !files) {
    return { success: false, reason: 'failed to list files' };
  }
  
  let apContent = '';
  let afContent = '';
  let notesContent = '';
  let apPath = null;
  let afPath = null;
  let notesPath = null;
  
  for (const file of files) {
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.pdf')) continue;
    
    const filePath = `${folderName}/${file.name}`;
    
    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(BUCKET_NAME)
        .download(filePath);
      
      if (downloadError || !fileData) continue;
      
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const text = await extractPdfText(buffer);
      
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
        // Add to notes content
        notesContent += (notesContent ? '\n\n---\n\n' : '') + text;
        if (!notesPath) notesPath = filePath;
      }
    } catch (err) {
      console.error(`Error processing ${filePath}:`, err.message);
    }
  }
  
  // Upsert to database
  const { error: upsertError } = await supabase
    .from('medical_records')
    .upsert({
      patient_id: patientId,
      ap_content: apContent.substring(0, 50000), // Limit size
      af_content: afContent.substring(0, 50000),
      notes_content: notesContent.substring(0, 50000),
      ap_file_path: apPath,
      af_file_path: afPath,
      notes_file_path: notesPath,
      source_folder: folderName,
      imported_from_storage: true,
      last_edited_by_name: 'Migration Script'
    }, {
      onConflict: 'patient_id'
    });
  
  if (upsertError) {
    return { success: false, reason: upsertError.message };
  }
  
  return { success: true, patientId };
}

async function main() {
  console.log('Starting Axenita to DB migration...');
  console.log('Source bucket:', BUCKET_NAME);
  console.log('');
  
  // Get all folders
  const { data: folders, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list('', { limit: 1000 });
  
  if (error) {
    console.error('Failed to list folders:', error.message);
    return;
  }
  
  const axenitaFolders = folders.filter(f => f.name.startsWith('axenita-'));
  console.log(`Found ${axenitaFolders.length} Axenita folders to process\n`);
  
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < axenitaFolders.length; i++) {
    const folder = axenitaFolders[i];
    const result = await migrateFolder(folder.name);
    
    if (result.success) {
      success++;
      if ((i + 1) % 50 === 0) {
        console.log(`Progress: ${i + 1}/${axenitaFolders.length} - ${success} migrated`);
      }
    } else {
      failed++;
      // console.log(`[${i + 1}] ${folder.name}: ${result.reason}`);
    }
  }
  
  console.log('\n=== Migration Complete ===');
  console.log(`Total folders: ${axenitaFolders.length}`);
  console.log(`Successfully migrated: ${success}`);
  console.log(`Failed: ${failed}`);
  
  // Count records
  const { count } = await supabase
    .from('medical_records')
    .select('id', { count: 'exact', head: true });
  
  console.log(`Total medical records in DB: ${count}`);
}

main().catch(console.error);
