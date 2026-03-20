/**
 * MediData Integration for Swiss Healthcare Billing
 * 
 * This module provides functionality for:
 * - Generating Sumex-compliant XML invoices (generalInvoiceRequest 4.50)
 * - Sending invoices via MediData API
 * - Tracking invoice statuses from insurance responses
 * 
 * Based on:
 * - Sumex1.net XML standards
 * - Forum Datenaustausch generalInvoiceRequest 4.50/5.00
 * - MediData ELA (Elektronische Leistungsabrechnung) API
 */

import { calculateSumexTardocPrice, SUMEX_TARDOC_CODES, type SwissCanton, CANTON_TAX_POINT_VALUES } from './tardoc';

// Law types for Swiss healthcare billing
export type SwissLawType = 'KVG' | 'UVG' | 'IVG' | 'MVG' | 'VVG';

// Billing types
export type BillingType = 'TG' | 'TP'; // Tiers Garant or Tiers Payant

// Invoice status tracking
export type MediDataInvoiceStatus =
  | 'draft'           // Invoice created, not sent
  | 'pending'         // Sent to MediData, awaiting confirmation
  | 'transmitted'     // Confirmed received by MediData
  | 'delivered'       // Delivered to insurer
  | 'accepted'        // Accepted by insurer
  | 'partially_paid'  // Partial payment received
  | 'paid'            // Fully paid
  | 'rejected'        // Rejected by insurer
  | 'disputed'        // Under dispute
  | 'reminder_1'      // First reminder sent
  | 'reminder_2'      // Second reminder sent
  | 'reminder_3'      // Third reminder sent
  | 'collection'      // Sent to collection
  | 'cancelled';      // Cancelled/voided

// Status display configuration
export const INVOICE_STATUS_CONFIG: Record<MediDataInvoiceStatus, {
  label: string;
  labelFr: string;
  color: string;
  bgColor: string;
  icon: string;
}> = {
  draft: { label: 'Draft', labelFr: 'Brouillon', color: 'text-slate-600', bgColor: 'bg-slate-100', icon: '📝' },
  pending: { label: 'Pending', labelFr: 'En attente', color: 'text-amber-600', bgColor: 'bg-amber-100', icon: '⏳' },
  transmitted: { label: 'Transmitted', labelFr: 'Transmis', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: '📤' },
  delivered: { label: 'Delivered', labelFr: 'Livré', color: 'text-indigo-600', bgColor: 'bg-indigo-100', icon: '📬' },
  accepted: { label: 'Accepted', labelFr: 'Accepté', color: 'text-emerald-600', bgColor: 'bg-emerald-100', icon: '✅' },
  partially_paid: { label: 'Partially Paid', labelFr: 'Partiellement payé', color: 'text-cyan-600', bgColor: 'bg-cyan-100', icon: '💰' },
  paid: { label: 'Paid', labelFr: 'Payé', color: 'text-green-600', bgColor: 'bg-green-100', icon: '✓' },
  rejected: { label: 'Rejected', labelFr: 'Rejeté', color: 'text-red-600', bgColor: 'bg-red-100', icon: '❌' },
  disputed: { label: 'Disputed', labelFr: 'Contesté', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: '⚠️' },
  reminder_1: { label: '1st Reminder', labelFr: '1er rappel', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: '📧' },
  reminder_2: { label: '2nd Reminder', labelFr: '2e rappel', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: '📧' },
  reminder_3: { label: '3rd Reminder', labelFr: '3e rappel', color: 'text-red-600', bgColor: 'bg-red-100', icon: '📧' },
  collection: { label: 'Collection', labelFr: 'Recouvrement', color: 'text-red-700', bgColor: 'bg-red-200', icon: '⚖️' },
  cancelled: { label: 'Cancelled', labelFr: 'Annulé', color: 'text-gray-500', bgColor: 'bg-gray-100', icon: '🚫' },
};

// Swiss insurer data structure
export type SwissInsurer = {
  id: string;
  gln: string;
  bagNumber: string | null;
  name: string;
  nameFr: string | null;
  lawTypes: SwissLawType[]; // Changed from lawType to lawTypes array
  receiverGln?: string | null; // GLN for invoice transmission if different from main GLN
  tpAllowed?: boolean; // Whether Tiers Payant is allowed
  address: {
    street: string | null;
    postalCode: string | null;
    city: string | null;
    canton: string | null;
  };
};

// Patient data for invoice
export type InvoicePatient = {
  id: string;
  firstName: string;
  lastName: string;
  dob: string | null;
  gender: 'male' | 'female' | 'other' | null;
  avsNumber: string | null; // AHV/AVS number
  address: {
    street: string | null;
    postalCode: string | null;
    city: string | null;
  };
  insurance: {
    insurerId: string | null;
    insurerGln: string | null;
    receiverGln?: string | null; // Added receiver GLN for routing
    insurerName: string | null;
    policyNumber: string | null;
    cardNumber: string | null;
    lawType: SwissLawType;
    billingType: BillingType;
    caseNumber: string | null;
  } | null;
};

// Provider (doctor) data
export type InvoiceProvider = {
  id: string;
  name: string;
  gln: string;
  zsr: string;
  specialty: string | null;
};

// Clinic data
export type InvoiceClinic = {
  name: string;
  gln: string;
  zsr: string;
  address: {
    street: string;
    postalCode: string;
    city: string;
    canton: SwissCanton;
  };
  iban: string;
  vatNumber: string | null;
};

// Service line for invoice
export type InvoiceServiceLine = {
  code: string;
  tariffType: string; // '007' for TARDOC, '005' for ACF, '402' for drugs/GTIN
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  date: string;
  providerId: string;
  providerGln: string;
  // ACF-specific (optional)
  externalFactor?: number; // dExternalFactor multiplier (default 1.0)
  sideType?: number; // 0=none, 1=left, 2=right, 3=bilateral
  sessionNumber?: number; // lSessionNumber (default 1)
  refCode?: string; // ICD-10 reference code
};

// Complete invoice request data
export type MediDataInvoiceRequest = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  treatmentStart: string;
  treatmentEnd: string;
  treatmentReason: string;
  diagnosisCodes: string[]; // ICD-10 codes

  billingType: BillingType;
  lawType: SwissLawType;
  canton: SwissCanton;

  patient: InvoicePatient;
  provider: InvoiceProvider;
  clinic: InvoiceClinic;

  services: InvoiceServiceLine[];

  subtotal: number;
  vatAmount: number;
  total: number;

  reminderLevel?: number; // 0 = invoice, 1-3 = reminder levels
};

/**
 * Generate a Sumex-compliant XML invoice (generalInvoiceRequest 4.50)
 */
export function generateSumexXml(request: MediDataInvoiceRequest): string {
  const now = new Date();
  const requestTimestamp = now.toISOString();
  const requestId = `INV-${request.invoiceNumber}-${Date.now()}`;

  // Determine role based on billing type
  const billingRole = request.billingType === 'TP' ? 'payant' : 'garant';

  // Format dates
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toISOString().split('T')[0];
  };

  // Build service records XML
  const servicesXml = request.services.map((service, index) => {
    const extFactor = service.externalFactor ?? 1;
    const svcAttrs = service.sideType ?? 0;
    const session = service.sessionNumber ?? 1;
    const refCode = service.refCode || '';
    return `
      <record_tarmed
        record_id="${index + 1}"
        tariff_type="${service.tariffType}"
        code="${escapeXml(service.code)}"
        quantity="${service.quantity}"
        date_begin="${formatDate(service.date)}"
        provider_id="${escapeXml(service.providerGln)}"
        responsible_id="${escapeXml(service.providerGln)}"
        unit="${service.unitPrice.toFixed(2)}"
        unit_factor="1.00"
        ${extFactor !== 1 ? `external_factor="${extFactor.toFixed(2)}"` : ''}
        ${svcAttrs > 0 ? `service_attributes="${svcAttrs}"` : ''}
        ${session > 1 ? `session="${session}"` : ''}
        ${refCode ? `ref_code="${escapeXml(refCode)}"` : ''}
        amount="${service.total.toFixed(2)}"
        validate="1"
        obligation="1"
      >
        <text>${escapeXml(service.description)}</text>
      </record_tarmed>`;
  }).join('\n');

  // Determine recipient GLN (use receiver GLN if available, otherwise insurer GLN)
  const recipientGln = request.patient.insurance?.receiverGln || request.patient.insurance?.insurerGln || '';

  // Build the XML document
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<request xmlns="http://www.forum-datenaustausch.ch/invoice"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.forum-datenaustausch.ch/invoice generalInvoiceRequest_450.xsd"
  language="fr"
  modus="production"
  validation_status="0">
  
  <processing>
    <transport from="${escapeXml(request.clinic.gln)}" to="${escapeXml(recipientGln)}">
      <via via="${escapeXml(request.clinic.gln)}" sequence_id="1"/>
    </transport>
  </processing>
  
  <payload type="invoice" copy="0" storno="0">
    <invoice request_timestamp="${requestTimestamp}" request_date="${formatDate(request.invoiceDate)}" request_id="${requestId}">
      <body role="${billingRole}" place="practice" request_date="${formatDate(request.invoiceDate)}" request_id="${requestId}">
        
        <prolog>
          <package name="AestheticsClinic" version="1.0.0" id="0"/>
        </prolog>
        
        <remark>${request.reminderLevel && request.reminderLevel > 0 ? `Reminder ${request.reminderLevel}` : 'Invoice'}</remark>
        
        <${billingRole}>
          <biller ean_party="${escapeXml(request.clinic.gln)}" zsr="${escapeXml(request.clinic.zsr)}">
            <company>
              <companyname>${escapeXml(request.clinic.name)}</companyname>
              <postal>
                <street>${escapeXml(request.clinic.address.street)}</street>
                <zip>${escapeXml(request.clinic.address.postalCode)}</zip>
                <city>${escapeXml(request.clinic.address.city)}</city>
              </postal>
            </company>
          </biller>
          
          <provider ean_party="${escapeXml(request.provider.gln)}" zsr="${escapeXml(request.provider.zsr)}">
            <company>
              <companyname>${escapeXml(request.provider.name)}</companyname>
              <postal>
                <street>${escapeXml(request.clinic.address.street)}</street>
                <zip>${escapeXml(request.clinic.address.postalCode)}</zip>
                <city>${escapeXml(request.clinic.address.city)}</city>
              </postal>
            </company>
          </provider>
          
          <insurance ean_party="${escapeXml(request.patient.insurance?.insurerGln || '')}">
            <company>
              <companyname>${escapeXml(request.patient.insurance?.insurerName || '')}</companyname>
            </company>
          </insurance>
          
          <patient gender="${request.patient.gender || 'unknown'}" birthdate="${request.patient.dob || ''}">
            <person>
              <familyname>${escapeXml(request.patient.lastName)}</familyname>
              <givenname>${escapeXml(request.patient.firstName)}</givenname>
              <postal>
                <street>${escapeXml(request.patient.address.street || '')}</street>
                <zip>${escapeXml(request.patient.address.postalCode || '')}</zip>
                <city>${escapeXml(request.patient.address.city || '')}</city>
              </postal>
            </person>
            ${request.patient.avsNumber ? `<ssn>${escapeXml(request.patient.avsNumber)}</ssn>` : ''}
            ${request.patient.insurance?.cardNumber ? `<card card_id="${escapeXml(request.patient.insurance.cardNumber)}"/>` : ''}
          </patient>
          
          ${billingRole === 'garant' ? `
          <guarantor>
            <person>
              <familyname>${escapeXml(request.patient.lastName)}</familyname>
              <givenname>${escapeXml(request.patient.firstName)}</givenname>
              <postal>
                <street>${escapeXml(request.patient.address.street || '')}</street>
                <zip>${escapeXml(request.patient.address.postalCode || '')}</zip>
                <city>${escapeXml(request.patient.address.city || '')}</city>
              </postal>
            </person>
          </guarantor>
          ` : ''}
          
          <referrer ean_party="${escapeXml(request.provider.gln)}" zsr="${escapeXml(request.provider.zsr)}">
            <company>
              <companyname>${escapeXml(request.provider.name)}</companyname>
            </company>
          </referrer>
          
        </${billingRole}>
        
        <${request.lawType.toLowerCase()}>
          <treatment date_begin="${formatDate(request.treatmentStart)}" date_end="${formatDate(request.treatmentEnd)}" canton="${request.canton}" reason="${request.treatmentReason}">
            ${request.diagnosisCodes.map(code => `<diagnosis type="ICD" code="${escapeXml(code)}"/>`).join('\n            ')}
          </treatment>
        </${request.lawType.toLowerCase()}>
        
        <services>
          ${servicesXml}
        </services>
        
        <balance currency="CHF" amount="${request.subtotal.toFixed(2)}" amount_obligations="${request.subtotal.toFixed(2)}" amount_due="${request.total.toFixed(2)}" amount_prepaid="0.00">
          <vat vat_number="${escapeXml(request.clinic.vatNumber || '')}">
            <vat_rate vat_rate="0.00" amount="${request.subtotal.toFixed(2)}" vat="0.00"/>
          </vat>
        </balance>
        
        <esr9 participant_number="01-${request.clinic.zsr.replace(/[^0-9]/g, '').slice(0, 6)}-0" type="16or27" reference_number="${generateEsrReference(request.invoiceNumber)}" coding_line="" bank_account="${escapeXml(request.clinic.iban)}"/>
        
      </body>
    </invoice>
  </payload>
</request>`;

  return xml;
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate ESR reference number for Swiss payment slips
 */
function generateEsrReference(invoiceNumber: string): string {
  // Remove non-numeric characters and pad to 26 digits
  const numericPart = invoiceNumber.replace(/[^0-9]/g, '').slice(0, 20);
  const padded = numericPart.padStart(26, '0');

  // Calculate check digit using modulo 10 recursive
  let carry = 0;
  const checkTable = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  for (const char of padded) {
    carry = checkTable[(carry + parseInt(char)) % 10];
  }
  const checkDigit = (10 - carry) % 10;

  return padded + checkDigit;
}

/**
 * Format ESR reference for display (groups of 5 digits)
 */
export function formatEsrReference(reference: string): string {
  const cleaned = reference.replace(/\s/g, '');
  const groups = cleaned.match(/.{1,5}/g) || [];
  return groups.join(' ');
}

/**
 * Create MediData upload info JSON
 */
export function createMediDataUploadInfo(request: MediDataInvoiceRequest): object {
  return {
    type: 'invoice',
    invoiceNumber: request.invoiceNumber,
    invoiceDate: request.invoiceDate,
    billingType: request.billingType,
    lawType: request.lawType,
    patientId: request.patient.id,
    insurerGln: request.patient.insurance?.insurerGln || null,
    amount: request.total,
    currency: 'CHF',
  };
}

/**
 * Generate invoice from consultation duration (TARDOC)
 * Valid from 01.01.2026 - TARDOC replaced TARMED
 */
export function generateTardocServicesFromDuration(
  durationMinutes: number,
  serviceDate: string,
  providerGln: string
): InvoiceServiceLine[] {
  const result = calculateSumexTardocPrice(durationMinutes);

  return result.lines.map(line => ({
    code: line.code,
    tariffType: '007', // TARDOC tariff type
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    total: line.total,
    date: serviceDate,
    providerId: providerGln,
    providerGln: providerGln,
  }));
}

/**
 * Validate Swiss AVS/AHV number format
 */
export function isValidAvsNumber(avs: string): boolean {
  // Format: 756.XXXX.XXXX.XX (13 digits with check)
  const cleaned = avs.replace(/[.\s-]/g, '');
  if (cleaned.length !== 13) return false;
  if (!cleaned.startsWith('756')) return false;

  // Validate check digit using EAN-13 algorithm
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(cleaned[i]);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return parseInt(cleaned[12]) === checkDigit;
}

/**
 * Format AVS number for display
 */
export function formatAvsNumber(avs: string): string {
  const cleaned = avs.replace(/[.\s-]/g, '');
  if (cleaned.length !== 13) return avs;
  return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 7)}.${cleaned.slice(7, 11)}.${cleaned.slice(11)}`;
}

/**
 * Validate Swiss GLN (Global Location Number)
 */
export function isValidGln(gln: string): boolean {
  const cleaned = gln.replace(/\s/g, '');
  if (cleaned.length !== 13) return false;
  if (!/^\d+$/.test(cleaned)) return false;

  // Validate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(cleaned[i]);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return parseInt(cleaned[12]) === checkDigit;
}

/**
 * Get law type display label
 */
export function getLawTypeLabel(lawType: SwissLawType, language: 'en' | 'fr' | 'de' = 'fr'): string {
  const labels: Record<SwissLawType, { en: string; fr: string; de: string }> = {
    KVG: { en: 'Health Insurance', fr: 'Assurance maladie', de: 'Krankenversicherung' },
    UVG: { en: 'Accident Insurance', fr: 'Assurance accident', de: 'Unfallversicherung' },
    IVG: { en: 'Disability Insurance', fr: 'Assurance invalidité', de: 'Invalidenversicherung' },
    MVG: { en: 'Military Insurance', fr: 'Assurance militaire', de: 'Militärversicherung' },
    VVG: { en: 'Private Insurance', fr: 'Assurance privée', de: 'Privatversicherung' },
  };
  return labels[lawType][language];
}

/**
 * Get billing type display label
 */
export function getBillingTypeLabel(billingType: BillingType, language: 'en' | 'fr' | 'de' = 'fr'): string {
  const labels: Record<BillingType, { en: string; fr: string; de: string }> = {
    TG: { en: 'Tiers Garant (Patient pays)', fr: 'Tiers Garant (Patient paie)', de: 'Tiers Garant (Patient zahlt)' },
    TP: { en: 'Tiers Payant (Insurer pays)', fr: 'Tiers Payant (Assurance paie)', de: 'Tiers Payant (Versicherung zahlt)' },
  };
  return labels[billingType][language];
}

// Common Swiss health insurers - now with multiple law types per insurer
export const COMMON_SWISS_INSURERS: Partial<SwissInsurer>[] = [
  { gln: '7601003000016', name: 'CSS Versicherung', nameFr: 'CSS Assurance', lawTypes: ['KVG', 'UVG', 'VVG'] },
  { gln: '7601003000023', name: 'Helsana', nameFr: 'Helsana', lawTypes: ['KVG', 'UVG', 'VVG'] },
  { gln: '7601003000030', name: 'Swica', nameFr: 'Swica', lawTypes: ['KVG', 'UVG', 'VVG'] },
  { gln: '7601003000047', name: 'Sanitas', nameFr: 'Sanitas', lawTypes: ['KVG', 'UVG', 'VVG'] },
  { gln: '7601003000054', name: 'Concordia', nameFr: 'Concordia', lawTypes: ['KVG', 'UVG', 'VVG'] },
  { gln: '7601003000061', name: 'Groupe Mutuel', nameFr: 'Groupe Mutuel', lawTypes: ['KVG', 'UVG', 'IVG', 'VVG'] },
  { gln: '7601003000078', name: 'Visana', nameFr: 'Visana', lawTypes: ['KVG', 'UVG', 'VVG'] },
  { gln: '7601003000085', name: 'Assura', nameFr: 'Assura', lawTypes: ['KVG', 'VVG'] },
  { gln: '7601003000092', name: 'KPT', nameFr: 'CPT', lawTypes: ['KVG', 'VVG'] },
  { gln: '7601003000108', name: 'Atupri', nameFr: 'Atupri', lawTypes: ['KVG', 'VVG'] },
];
