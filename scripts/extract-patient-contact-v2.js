/**
 * Extract patient contact data from PDF files using pdf2json
 */

const fs = require('fs');
const path = require('path');
const PDFParser = require('pdf2json');

const DATA_FOLDER = 'C:/Users/user/Desktop/Maison-Toa-Data';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+41|0041|0)\s*(?:\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}|\d{1,2}[\s.-]?\d{3}[\s.-]?\d{4})/g;

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
                  text += decodeURIComponent(r.T) + ' ';
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

function extractContactInfo(text) {
  const result = { emails: [], phones: [] };
  if (!text) return result;
  
  const emails = text.match(EMAIL_REGEX) || [];
  result.emails = [...new Set(emails.filter(e => 
    !e.includes('@old') && 
    !e.includes('example') &&
    !e.includes('aesthetics-clinic') &&
    !e.includes('maison-toa')
  ))];
  
  const phones = text.match(PHONE_REGEX) || [];
  result.phones = [...new Set(phones.map(p => p.replace(/\s/g, '')))];
  
  return result;
}

async function processPatientFolder(folderPath) {
  const folderName = path.basename(folderPath);
  const parts = folderName.split('_');
  const patientNr = parts[0];
  
  const contactInfo = { emails: [], phones: [] };
  
  // Check Lettre folder
  const lettrePath = path.join(folderPath, '5_Documents', 'Lettre');
  if (fs.existsSync(lettrePath)) {
    const files = fs.readdirSync(lettrePath);
    for (const file of files) {
      const filePath = path.join(lettrePath, file);
      if (fs.statSync(filePath).isFile()) {
        try {
          const text = await extractFromPdf(filePath);
          const info = extractContactInfo(text);
          contactInfo.emails.push(...info.emails);
          contactInfo.phones.push(...info.phones);
        } catch (e) {
          // Skip problematic files
        }
      }
    }
  }
  
  // Check Factures folder - just first invoice
  const facturesPath = path.join(folderPath, '6_Factures', 'Factures');
  if (fs.existsSync(facturesPath)) {
    const files = fs.readdirSync(facturesPath).filter(f => f.endsWith('.pdf')).slice(0, 1);
    for (const file of files) {
      try {
        const text = await extractFromPdf(path.join(facturesPath, file));
        const info = extractContactInfo(text);
        contactInfo.emails.push(...info.emails);
        contactInfo.phones.push(...info.phones);
      } catch (e) {
        // Skip
      }
    }
  }
  
  contactInfo.emails = [...new Set(contactInfo.emails)];
  contactInfo.phones = [...new Set(contactInfo.phones)];
  
  return { patientNr, ...contactInfo };
}

async function main() {
  const folders = fs.readdirSync(DATA_FOLDER)
    .filter(f => {
      const fp = path.join(DATA_FOLDER, f);
      return fs.statSync(fp).isDirectory() && /^\d+_/.test(f);
    })
    .slice(0, 10); // Test with 10 folders
  
  console.log(`Processing ${folders.length} patient folders...`);
  
  let foundCount = 0;
  for (const folder of folders) {
    const result = await processPatientFolder(path.join(DATA_FOLDER, folder));
    
    if (result.emails.length || result.phones.length) {
      foundCount++;
      console.log(`\nPatient ${result.patientNr}:`);
      if (result.emails.length) console.log('  Emails:', result.emails.join(', '));
      if (result.phones.length) console.log('  Phones:', result.phones.join(', '));
    }
  }
  
  console.log(`\nFound contact info in ${foundCount}/${folders.length} folders`);
}

main().catch(console.error);
