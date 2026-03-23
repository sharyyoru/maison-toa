/**
 * Extract patient contact data (email, phone, address) from PDF files in Lettre and Factures folders
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const DATA_FOLDER = 'C:/Users/user/Desktop/Maison-Toa-Data';

// Regex patterns for extracting contact info
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+41|0041|0)\s*(?:\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}|\d{1,2}[\s.-]?\d{3}[\s.-]?\d{4})/g;
const MOBILE_REGEX = /(?:Mobile|Portable|Tél|Tel|Téléphone|Natel)[\s:]*([0-9\s.+-]+)/gi;

async function extractFromPdf(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.error(`Error parsing ${filePath}: ${error.message}`);
    return null;
  }
}

function extractContactInfo(text) {
  const result = { emails: [], phones: [], address: null };
  
  if (!text) return result;
  
  // Extract emails
  const emails = text.match(EMAIL_REGEX) || [];
  result.emails = [...new Set(emails.filter(e => !e.includes('@old') && !e.includes('example')))];
  
  // Extract phones
  const phones = text.match(PHONE_REGEX) || [];
  const mobileMatches = text.match(MOBILE_REGEX) || [];
  
  const allPhones = [...phones];
  mobileMatches.forEach(m => {
    const num = m.replace(/[^\d+]/g, '');
    if (num.length >= 9) allPhones.push(num);
  });
  
  result.phones = [...new Set(allPhones.map(p => p.replace(/\s/g, '')))];
  
  // Try to extract address (lines with postal codes)
  const addressMatch = text.match(/\d{4}\s+[A-Za-zÀ-ÿ\s-]+/);
  if (addressMatch) {
    result.address = addressMatch[0].trim();
  }
  
  return result;
}

async function processPatientFolder(folderPath) {
  const folderName = path.basename(folderPath);
  const parts = folderName.split('_');
  const patientNr = parts[0];
  
  const contactInfo = { emails: [], phones: [], files: [] };
  
  // Check Lettre folder
  const lettrePath = path.join(folderPath, '5_Documents', 'Lettre');
  if (fs.existsSync(lettrePath)) {
    const files = fs.readdirSync(lettrePath);
    for (const file of files) {
      const filePath = path.join(lettrePath, file);
      if (fs.statSync(filePath).isFile()) {
        const text = await extractFromPdf(filePath);
        const info = extractContactInfo(text);
        contactInfo.emails.push(...info.emails);
        contactInfo.phones.push(...info.phones);
        if (info.emails.length || info.phones.length) {
          contactInfo.files.push({ file, ...info });
        }
      }
    }
  }
  
  // Check Factures folder
  const facturesPath = path.join(folderPath, '6_Factures');
  if (fs.existsSync(facturesPath)) {
    const processDir = async (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await processDir(fullPath);
        } else if (entry.name.endsWith('.pdf')) {
          const text = await extractFromPdf(fullPath);
          const info = extractContactInfo(text);
          contactInfo.emails.push(...info.emails);
          contactInfo.phones.push(...info.phones);
        }
      }
    };
    await processDir(facturesPath);
  }
  
  // Deduplicate
  contactInfo.emails = [...new Set(contactInfo.emails)];
  contactInfo.phones = [...new Set(contactInfo.phones)];
  
  return { patientNr, ...contactInfo };
}

async function main() {
  // Test with first few patient folders
  const folders = fs.readdirSync(DATA_FOLDER)
    .filter(f => fs.statSync(path.join(DATA_FOLDER, f)).isDirectory() && /^\d+_/.test(f))
    .slice(0, 5);
  
  console.log(`Processing ${folders.length} patient folders...`);
  
  for (const folder of folders) {
    const folderPath = path.join(DATA_FOLDER, folder);
    const result = await processPatientFolder(folderPath);
    
    if (result.emails.length || result.phones.length) {
      console.log(`\nPatient ${result.patientNr}:`);
      if (result.emails.length) console.log('  Emails:', result.emails.join(', '));
      if (result.phones.length) console.log('  Phones:', result.phones.join(', '));
    }
  }
}

main().catch(console.error);
