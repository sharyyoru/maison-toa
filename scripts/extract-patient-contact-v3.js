/**
 * Extract patient contact data from Consultations PDF header
 * The Consultations PDF has patient info: Name, DOB, Tel, Mobile at the top
 */

const fs = require('fs');
const path = require('path');
const PDFParser = require('pdf2json');

const DATA_FOLDER = 'C:/Users/user/Desktop/Maison-Toa-Data';

function extractFromPdf(filePath) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    
    pdfParser.on('pdfParser_dataError', (errData) => {
      reject(errData.parserError);
    });
    
    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      let text = '';
      if (pdfData && pdfData.Pages && pdfData.Pages[0]) {
        // Only get first page header
        const page = pdfData.Pages[0];
        if (page.Texts) {
          page.Texts.forEach(textItem => {
            if (textItem.R) {
              textItem.R.forEach(r => {
                try {
                  text += decodeURIComponent(r.T) + ' ';
                } catch (e) {
                  text += r.T + ' ';
                }
              });
            }
          });
        }
      }
      resolve(text);
    });
    
    pdfParser.loadPDF(filePath);
  });
}

function extractPatientContactFromConsultations(text) {
  const result = { email: null, phone: null, mobile: null };
  if (!text) return result;
  
  // Look for Tél: or Tel: pattern followed by number
  const telMatch = text.match(/T[eé]l[\.:]\s*([0-9\s.+-]+)/i);
  if (telMatch) {
    const num = telMatch[1].replace(/[\s.]/g, '').substring(0, 15);
    if (num.length >= 9 && !num.startsWith('021791')) {
      result.phone = num;
    }
  }
  
  // Look for Mobile: pattern
  const mobileMatch = text.match(/Mobile[\.:]\s*([0-9\s.+-]+)/i);
  if (mobileMatch) {
    const num = mobileMatch[1].replace(/[\s.]/g, '').substring(0, 15);
    if (num.length >= 9) {
      result.mobile = num;
    }
  }
  
  // Look for email pattern
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch && !emailMatch[0].includes('maison-toa') && !emailMatch[0].includes('aesthetics')) {
    result.email = emailMatch[0];
  }
  
  return result;
}

async function processPatientFolder(folderPath) {
  const folderName = path.basename(folderPath);
  const parts = folderName.split('_');
  const patientNr = parts[0];
  const firstName = parts[1] || '';
  const lastName = parts[2] || '';
  
  let contactInfo = { email: null, phone: null, mobile: null };
  
  // Check Consultations folder first - this has patient header info
  const consultationsPath = path.join(folderPath, '2_Consultations');
  if (fs.existsSync(consultationsPath)) {
    const files = fs.readdirSync(consultationsPath).filter(f => 
      f.toLowerCase().includes('consultation') || f.endsWith('.pdf') || !path.extname(f)
    );
    
    for (const file of files.slice(0, 1)) { // Just check first consultation file
      const filePath = path.join(consultationsPath, file);
      if (fs.statSync(filePath).isFile()) {
        try {
          const text = await extractFromPdf(filePath);
          contactInfo = extractPatientContactFromConsultations(text);
          if (contactInfo.phone || contactInfo.mobile || contactInfo.email) {
            break;
          }
        } catch (e) {
          // Skip
        }
      }
    }
  }
  
  return { patientNr, firstName, lastName, ...contactInfo };
}

async function main() {
  const folders = fs.readdirSync(DATA_FOLDER)
    .filter(f => {
      const fp = path.join(DATA_FOLDER, f);
      return fs.statSync(fp).isDirectory() && /^\d+_/.test(f);
    })
    .slice(0, 20); // Test with 20 folders
  
  console.log(`Processing ${folders.length} patient folders...`);
  console.log('Looking for patient contact info in Consultations PDFs...\n');
  
  const results = [];
  for (const folder of folders) {
    const result = await processPatientFolder(path.join(DATA_FOLDER, folder));
    results.push(result);
    
    if (result.email || result.phone || result.mobile) {
      console.log(`Patient ${result.patientNr} (${result.firstName} ${result.lastName}):`);
      if (result.email) console.log('  Email:', result.email);
      if (result.phone) console.log('  Phone:', result.phone);
      if (result.mobile) console.log('  Mobile:', result.mobile);
    }
  }
  
  const withContact = results.filter(r => r.email || r.phone || r.mobile);
  console.log(`\nFound contact info in ${withContact.length}/${results.length} patients`);
}

main().catch(console.error);
