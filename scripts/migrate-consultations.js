/**
 * Create consultation records from Consultations PDFs
 * Parse the consultation data from PDFs and create consultation records in the database
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const PDFParser = require('pdf2json');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const DATA_FOLDER = 'C:/Users/user/Desktop/Maison-Toa-Data';

const stats = {
  patientsProcessed: 0,
  consultationsCreated: 0,
  errors: 0
};

function extractFromPdf(filePath) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    
    pdfParser.on('pdfParser_dataError', (errData) => {
      reject(errData.parserError);
    });
    
    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      let text = '';
      if (pdfData && pdfData.Pages) {
        pdfData.Pages.forEach(page => {
          if (page.Texts) {
            page.Texts.forEach(textItem => {
              if (textItem.R) {
                textItem.R.forEach(r => {
                  try {
                    text += decodeURIComponent(r.T) + '|';
                  } catch (e) {
                    text += r.T + '|';
                  }
                });
              }
            });
          }
          text += '\n';
        });
      }
      resolve(text);
    });
    
    pdfParser.loadPDF(filePath);
  });
}

function parseConsultations(text) {
  const consultations = [];
  
  // Split by date patterns (e.g., "mer. 18.09.19 15:39" or "mar. 21.05.19 14:33")
  const datePattern = /([a-z]{3}\.\s*\d{1,2}\.\d{2}\.\d{2}\s*\d{1,2}:\d{2})/gi;
  const parts = text.split(datePattern);
  
  for (let i = 1; i < parts.length; i += 2) {
    const dateStr = parts[i];
    const content = parts[i + 1] || '';
    
    // Parse date
    const dateMatch = dateStr.match(/(\d{1,2})\.(\d{2})\.(\d{2})\s*(\d{1,2}):(\d{2})/);
    if (!dateMatch) continue;
    
    const [, day, month, year, hour, minute] = dateMatch;
    const fullYear = parseInt(year) > 50 ? 1900 + parseInt(year) : 2000 + parseInt(year);
    const date = new Date(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
    
    if (isNaN(date.getTime())) continue;
    
    // Extract mandant (provider)
    const mandantMatch = content.match(/Mandant:\s*([^|]+)/i);
    const provider = mandantMatch ? mandantMatch[1].trim() : null;
    
    // Extract category
    const categoryMatch = content.match(/C:\s*([^|]+)/i);
    const category = categoryMatch ? categoryMatch[1].trim() : null;
    
    // Extract treatment
    const treatmentMatch = content.match(/Traitement:\|([^|]+)/i);
    const treatment = treatmentMatch ? treatmentMatch[1].trim() : null;
    
    // Extract motif
    const motifMatch = content.match(/Motif de la consultation\s*:\s*([^|]*)/i);
    const motif = motifMatch ? motifMatch[1].trim() : null;
    
    consultations.push({
      date,
      provider,
      category,
      treatment,
      motif,
      raw: content.substring(0, 500)
    });
  }
  
  return consultations;
}

async function findPatient(patientNr, firstName, lastName) {
  const { data: byNotes } = await supabase
    .from('patients')
    .select('id, first_name, last_name')
    .ilike('notes', `%Patient Nr: ${patientNr}%`)
    .limit(1);
  
  if (byNotes && byNotes.length > 0) return byNotes[0];
  
  const { data: byName } = await supabase
    .from('patients')
    .select('id, first_name, last_name')
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .limit(1);
  
  if (byName && byName.length > 0) return byName[0];
  
  return null;
}

async function createConsultation(patientId, consultation, index) {
  const consultationId = `CONS-${Date.now()}-${index}`;
  
  const { error } = await supabase
    .from('consultations')
    .insert({
      patient_id: patientId,
      consultation_id: consultationId,
      title: consultation.motif || consultation.category || consultation.treatment || 'Consultation',
      record_type: 'notes',
      scheduled_at: consultation.date.toISOString(),
      doctor_name: consultation.provider || null,
      content: `${consultation.treatment || ''}\n${consultation.raw || ''}`.trim().substring(0, 2000),
      created_by_name: 'Migration Script'
    });
  
  if (error && !error.message.includes('duplicate')) {
    throw error;
  }
  
  return !error;
}

async function processPatientFolder(folderPath) {
  const folderName = path.basename(folderPath);
  const parts = folderName.split('_');
  const patientNr = parts[0];
  const firstName = parts[1] || '';
  const lastName = parts[2] || '';
  
  const patient = await findPatient(patientNr, firstName, lastName);
  if (!patient) {
    return { created: 0, error: 'Patient not found' };
  }
  
  const consultationsPath = path.join(folderPath, '2_Consultations');
  if (!fs.existsSync(consultationsPath)) {
    return { created: 0, error: 'No consultations folder' };
  }
  
  let totalCreated = 0;
  const files = fs.readdirSync(consultationsPath).filter(f => 
    f.toLowerCase().includes('consultation') && 
    (f.endsWith('.pdf') || !path.extname(f))
  );
  
  for (const file of files) {
    const filePath = path.join(consultationsPath, file);
    if (!fs.statSync(filePath).isFile()) continue;
    
    try {
      const text = await extractFromPdf(filePath);
      const consultations = parseConsultations(text);
      
      for (let i = 0; i < consultations.length; i++) {
        try {
          const created = await createConsultation(patient.id, consultations[i], i);
          if (created) totalCreated++;
        } catch (e) {
          // Skip individual consultation errors
        }
      }
    } catch (e) {
      // Skip file errors
    }
  }
  
  return { created: totalCreated };
}

async function main() {
  console.log('Starting consultations migration...\n');
  
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
      stats.patientsProcessed++;
      stats.consultationsCreated += result.created;
    } catch (error) {
      stats.errors++;
    }
    
    if ((i + 1) % 100 === 0) {
      console.log(`Progress: ${i + 1}/${folders.length} folders, ${stats.consultationsCreated} consultations created`);
    }
  }
  
  console.log('\n=== Migration Complete ===');
  console.log(`Patients processed: ${stats.patientsProcessed}`);
  console.log(`Consultations created: ${stats.consultationsCreated}`);
  console.log(`Errors: ${stats.errors}`);
}

main().catch(console.error);
