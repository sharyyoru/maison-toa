/**
 * TARDOC - Swiss Medical Tariff System
 * 
 * TARDOC replaces TARMED from January 1, 2026 for outpatient medical services in Switzerland.
 * This module provides tariff codes, tax point calculations, and Swiss billing compliance.
 * 
 * Structure:
 * - Main chapters (11 total, e.g., T = Chest area)
 * - Thematic chapters (74 total, e.g., TG = Lungs, Airways)
 * - Subchapters (323 total, e.g., TG.05 = Lung function)
 * - Individual tariff headings (e.g., TG.05.0030 = Small spirometry)
 */

// Swiss Canton codes for tax point value variations
export type SwissCanton =
  | "AG" | "AI" | "AR" | "BE" | "BL" | "BS" | "FR" | "GE" | "GL" | "GR"
  | "JU" | "LU" | "NE" | "NW" | "OW" | "SG" | "SH" | "SO" | "SZ" | "TG"
  | "TI" | "UR" | "VD" | "VS" | "ZG" | "ZH";

// Tax point values by canton (CHF per tax point) - 2026 values
export const CANTON_TAX_POINT_VALUES: Record<SwissCanton, number> = {
  AG: 0.89,
  AI: 0.86,
  AR: 0.86,
  BE: 0.89,
  BL: 0.91,
  BS: 0.96,
  FR: 0.88,
  GE: 0.96, // Geneva - highest
  GL: 0.86,
  GR: 0.86,
  JU: 0.86,
  LU: 0.89,
  NE: 0.89,
  NW: 0.86,
  OW: 0.86,
  SG: 0.86,
  SH: 0.86,
  SO: 0.89,
  SZ: 0.86,
  TG: 0.86,
  TI: 0.90,
  UR: 0.86,
  VD: 0.93,
  VS: 0.86,
  ZG: 0.93,
  ZH: 0.93,
};

// Default canton for the clinic (Geneva)
export const DEFAULT_CANTON: SwissCanton = "GE";

// Cost neutrality factor for TARMED to TARDOC transition
export const COST_NEUTRALITY_FACTOR = 0.95;

// TARDOC Main Chapter codes
export type TardocMainChapter =
  | "A" // General services
  | "B" // Head and neck
  | "C" // Eye
  | "D" // Ear, nose, throat
  | "E" // Cardiovascular system
  | "F" // Digestive system
  | "G" // Urogenital system
  | "H" // Musculoskeletal system
  | "I" // Nervous system
  | "K" // Skin
  | "T"; // Chest area

// TARDOC tariff item structure
export type TardocTariffItem = {
  code: string;
  mainChapter: TardocMainChapter;
  chapter: string;
  subchapter: string;
  description: string;
  descriptionFr: string;
  descriptionDe: string;
  taxPoints: number;
  technicalTaxPoints: number;
  medicalTaxPoints: number;
  duration: number; // in minutes
  validFrom: string;
  validTo: string | null;
  requiresQualification: string | null;
  isActive: boolean;
};

// Medicine with TARDOC reference
export type TardocMedicine = {
  id: string;
  name: string;
  nameFr: string;
  nameDe: string;
  atcCode: string; // Anatomical Therapeutic Chemical code
  swissmedicNumber: string | null;
  tardocCode: string | null;
  pharmacode: string | null;
  gtin: string | null;
  unitType: "tablet" | "capsule" | "injection" | "cream" | "solution" | "patch" | "other";
  unitSize: string;
  priceExFactory: number;
  pricePublic: number;
  reimbursementCategory: "A" | "B" | "C" | "D" | null; // Swiss reimbursement categories
  isNarcotic: boolean;
  requiresPrescription: boolean;
  isActive: boolean;
};

// Invoice line item with TARDOC compliance
export type TardocInvoiceLine = {
  id: string;
  tardocCode: string;
  description: string;
  quantity: number;
  taxPoints: number;
  taxPointValue: number;
  costNeutralityFactor: number;
  unitPrice: number; // Calculated: taxPoints * taxPointValue * costNeutralityFactor
  totalPrice: number;
  vatRate: number;
  vatAmount: number;
  serviceDate: string;
  providerId: string;
  providerGln: string; // Global Location Number
};

// Swiss-compliant invoice structure
export type TardocInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  
  // Provider (clinic) information
  providerId: string;
  providerName: string;
  providerGln: string;
  providerZsr: string; // Zahlstellenregister number
  providerAddress: {
    street: string;
    postalCode: string;
    city: string;
    canton: SwissCanton;
  };
  
  // Patient/guarantor information
  patientId: string;
  patientName: string;
  patientDob: string;
  patientAvs: string; // AHV/AVS number (Swiss social security)
  patientAddress: {
    street: string;
    postalCode: string;
    city: string;
  };
  
  // Insurance information (if applicable)
  insurerId: string | null;
  insurerName: string | null;
  insurerGln: string | null;
  policyNumber: string | null;
  caseNumber: string | null;
  
  // Billing details
  billingType: "TG" | "TP" | "KV"; // Tiers Garant, Tiers Payant, Krankenversicherung
  treatmentType: "ambulatory" | "semi_stationary" | "stationary";
  treatmentReason: string;
  diagnosisCodes: string[]; // ICD-10 codes
  
  // Financial
  canton: SwissCanton;
  taxPointValue: number;
  costNeutralityFactor: number;
  lines: TardocInvoiceLine[];
  subtotal: number;
  vatTotal: number;
  total: number;
  currency: "CHF";
  
  // Payment
  paymentTermDays: number;
  iban: string;
  qrReference: string;
  
  // Status
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

// TARDOC tariff items for aesthetic/plastic surgery clinic
// Based on TARDOC chapter structure for relevant medical specialties
export const TARDOC_TARIFF_ITEMS: TardocTariffItem[] = [
  // General consultations (Chapter A)
  {
    code: "AA.01.0010",
    mainChapter: "A",
    chapter: "AA",
    subchapter: "AA.01",
    description: "First consultation, comprehensive",
    descriptionFr: "Première consultation, complète",
    descriptionDe: "Erstkonsultation, umfassend",
    taxPoints: 48.5,
    technicalTaxPoints: 15.2,
    medicalTaxPoints: 33.3,
    duration: 30,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: null,
    isActive: true,
  },
  {
    code: "AA.01.0020",
    mainChapter: "A",
    chapter: "AA",
    subchapter: "AA.01",
    description: "Follow-up consultation, standard",
    descriptionFr: "Consultation de suivi, standard",
    descriptionDe: "Folgekonsultation, Standard",
    taxPoints: 32.5,
    technicalTaxPoints: 10.5,
    medicalTaxPoints: 22.0,
    duration: 20,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: null,
    isActive: true,
  },
  {
    code: "AA.01.0030",
    mainChapter: "A",
    chapter: "AA",
    subchapter: "AA.01",
    description: "Brief consultation",
    descriptionFr: "Consultation brève",
    descriptionDe: "Kurzkonsultation",
    taxPoints: 16.25,
    technicalTaxPoints: 5.25,
    medicalTaxPoints: 11.0,
    duration: 10,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: null,
    isActive: true,
  },
  
  // Skin procedures (Chapter K)
  {
    code: "KA.01.0010",
    mainChapter: "K",
    chapter: "KA",
    subchapter: "KA.01",
    description: "Botulinum toxin injection, per region",
    descriptionFr: "Injection de toxine botulique, par région",
    descriptionDe: "Botulinumtoxin-Injektion, pro Region",
    taxPoints: 45.0,
    technicalTaxPoints: 12.5,
    medicalTaxPoints: 32.5,
    duration: 15,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KA.01.0020",
    mainChapter: "K",
    chapter: "KA",
    subchapter: "KA.01",
    description: "Dermal filler injection, per syringe",
    descriptionFr: "Injection de comblement dermique, par seringue",
    descriptionDe: "Dermalfiller-Injektion, pro Spritze",
    taxPoints: 52.0,
    technicalTaxPoints: 15.0,
    medicalTaxPoints: 37.0,
    duration: 20,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KA.02.0010",
    mainChapter: "K",
    chapter: "KA",
    subchapter: "KA.02",
    description: "Chemical peel, superficial",
    descriptionFr: "Peeling chimique, superficiel",
    descriptionDe: "Chemisches Peeling, oberflächlich",
    taxPoints: 38.0,
    technicalTaxPoints: 12.0,
    medicalTaxPoints: 26.0,
    duration: 25,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: null,
    isActive: true,
  },
  {
    code: "KA.02.0020",
    mainChapter: "K",
    chapter: "KA",
    subchapter: "KA.02",
    description: "Chemical peel, medium depth",
    descriptionFr: "Peeling chimique, profondeur moyenne",
    descriptionDe: "Chemisches Peeling, mittlere Tiefe",
    taxPoints: 65.0,
    technicalTaxPoints: 20.0,
    medicalTaxPoints: 45.0,
    duration: 40,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Dermatology",
    isActive: true,
  },
  {
    code: "KA.03.0010",
    mainChapter: "K",
    chapter: "KA",
    subchapter: "KA.03",
    description: "Laser skin resurfacing, per session",
    descriptionFr: "Resurfaçage cutané au laser, par séance",
    descriptionDe: "Laser-Hauterneuerung, pro Sitzung",
    taxPoints: 85.0,
    technicalTaxPoints: 35.0,
    medicalTaxPoints: 50.0,
    duration: 45,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KA.04.0010",
    mainChapter: "K",
    chapter: "KA",
    subchapter: "KA.04",
    description: "Microneedling treatment",
    descriptionFr: "Traitement par microneedling",
    descriptionDe: "Microneedling-Behandlung",
    taxPoints: 42.0,
    technicalTaxPoints: 15.0,
    medicalTaxPoints: 27.0,
    duration: 30,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: null,
    isActive: true,
  },
  
  // Surgical procedures (Chapter K - Skin surgery)
  {
    code: "KS.01.0010",
    mainChapter: "K",
    chapter: "KS",
    subchapter: "KS.01",
    description: "Blepharoplasty, upper eyelid, unilateral",
    descriptionFr: "Blépharoplastie, paupière supérieure, unilatérale",
    descriptionDe: "Blepharoplastik, Oberlid, einseitig",
    taxPoints: 180.0,
    technicalTaxPoints: 60.0,
    medicalTaxPoints: 120.0,
    duration: 60,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KS.01.0020",
    mainChapter: "K",
    chapter: "KS",
    subchapter: "KS.01",
    description: "Blepharoplasty, lower eyelid, unilateral",
    descriptionFr: "Blépharoplastie, paupière inférieure, unilatérale",
    descriptionDe: "Blepharoplastik, Unterlid, einseitig",
    taxPoints: 195.0,
    technicalTaxPoints: 65.0,
    medicalTaxPoints: 130.0,
    duration: 75,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KS.02.0010",
    mainChapter: "K",
    chapter: "KS",
    subchapter: "KS.02",
    description: "Facelift, partial (SMAS)",
    descriptionFr: "Lifting facial, partiel (SMAS)",
    descriptionDe: "Facelift, partiell (SMAS)",
    taxPoints: 450.0,
    technicalTaxPoints: 150.0,
    medicalTaxPoints: 300.0,
    duration: 180,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KS.02.0020",
    mainChapter: "K",
    chapter: "KS",
    subchapter: "KS.02",
    description: "Facelift, complete",
    descriptionFr: "Lifting facial, complet",
    descriptionDe: "Facelift, komplett",
    taxPoints: 650.0,
    technicalTaxPoints: 200.0,
    medicalTaxPoints: 450.0,
    duration: 240,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KS.03.0010",
    mainChapter: "K",
    chapter: "KS",
    subchapter: "KS.03",
    description: "Rhinoplasty, cosmetic",
    descriptionFr: "Rhinoplastie, esthétique",
    descriptionDe: "Rhinoplastik, kosmetisch",
    taxPoints: 520.0,
    technicalTaxPoints: 170.0,
    medicalTaxPoints: 350.0,
    duration: 180,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KS.04.0010",
    mainChapter: "K",
    chapter: "KS",
    subchapter: "KS.04",
    description: "Liposuction, per region",
    descriptionFr: "Liposuccion, par région",
    descriptionDe: "Liposuktion, pro Region",
    taxPoints: 280.0,
    technicalTaxPoints: 90.0,
    medicalTaxPoints: 190.0,
    duration: 90,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KS.05.0010",
    mainChapter: "K",
    chapter: "KS",
    subchapter: "KS.05",
    description: "Breast augmentation with implants",
    descriptionFr: "Augmentation mammaire avec implants",
    descriptionDe: "Brustvergrösserung mit Implantaten",
    taxPoints: 480.0,
    technicalTaxPoints: 150.0,
    medicalTaxPoints: 330.0,
    duration: 120,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KS.05.0020",
    mainChapter: "K",
    chapter: "KS",
    subchapter: "KS.05",
    description: "Breast reduction",
    descriptionFr: "Réduction mammaire",
    descriptionDe: "Brustreduktion",
    taxPoints: 550.0,
    technicalTaxPoints: 180.0,
    medicalTaxPoints: 370.0,
    duration: 180,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KS.05.0030",
    mainChapter: "K",
    chapter: "KS",
    subchapter: "KS.05",
    description: "Breast lift (mastopexy)",
    descriptionFr: "Lifting des seins (mastopexie)",
    descriptionDe: "Bruststraffung (Mastopexie)",
    taxPoints: 420.0,
    technicalTaxPoints: 140.0,
    medicalTaxPoints: 280.0,
    duration: 150,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  {
    code: "KS.06.0010",
    mainChapter: "K",
    chapter: "KS",
    subchapter: "KS.06",
    description: "Abdominoplasty",
    descriptionFr: "Abdominoplastie",
    descriptionDe: "Abdominoplastik",
    taxPoints: 580.0,
    technicalTaxPoints: 190.0,
    medicalTaxPoints: 390.0,
    duration: 210,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: "FMH Plastic Surgery",
    isActive: true,
  },
  
  // Post-operative care
  {
    code: "AA.05.0010",
    mainChapter: "A",
    chapter: "AA",
    subchapter: "AA.05",
    description: "Post-operative wound care, simple",
    descriptionFr: "Soins de plaie post-opératoire, simple",
    descriptionDe: "Postoperative Wundversorgung, einfach",
    taxPoints: 18.0,
    technicalTaxPoints: 8.0,
    medicalTaxPoints: 10.0,
    duration: 15,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: null,
    isActive: true,
  },
  {
    code: "AA.05.0020",
    mainChapter: "A",
    chapter: "AA",
    subchapter: "AA.05",
    description: "Suture removal",
    descriptionFr: "Ablation des sutures",
    descriptionDe: "Nahtentfernung",
    taxPoints: 12.5,
    technicalTaxPoints: 5.5,
    medicalTaxPoints: 7.0,
    duration: 10,
    validFrom: "2026-01-01",
    validTo: null,
    requiresQualification: null,
    isActive: true,
  },
];

// Medicines commonly used in aesthetic clinics with Swiss references
export const TARDOC_MEDICINES: TardocMedicine[] = [
  {
    id: "med-botox-50",
    name: "Botox (Botulinum Toxin Type A) 50 Units",
    nameFr: "Botox (Toxine Botulique Type A) 50 Unités",
    nameDe: "Botox (Botulinumtoxin Typ A) 50 Einheiten",
    atcCode: "M03AX01",
    swissmedicNumber: "55344",
    tardocCode: "KA.01.0010",
    pharmacode: "2384567",
    gtin: "7680553440011",
    unitType: "injection",
    unitSize: "50 units",
    priceExFactory: 185.50,
    pricePublic: 245.00,
    reimbursementCategory: null,
    isNarcotic: false,
    requiresPrescription: true,
    isActive: true,
  },
  {
    id: "med-botox-100",
    name: "Botox (Botulinum Toxin Type A) 100 Units",
    nameFr: "Botox (Toxine Botulique Type A) 100 Unités",
    nameDe: "Botox (Botulinumtoxin Typ A) 100 Einheiten",
    atcCode: "M03AX01",
    swissmedicNumber: "55345",
    tardocCode: "KA.01.0010",
    pharmacode: "2384568",
    gtin: "7680553450010",
    unitType: "injection",
    unitSize: "100 units",
    priceExFactory: 350.00,
    pricePublic: 465.00,
    reimbursementCategory: null,
    isNarcotic: false,
    requiresPrescription: true,
    isActive: true,
  },
  {
    id: "med-juvederm-ultra",
    name: "Juvederm Ultra 3 (1ml)",
    nameFr: "Juvederm Ultra 3 (1ml)",
    nameDe: "Juvederm Ultra 3 (1ml)",
    atcCode: "V04CX",
    swissmedicNumber: "62145",
    tardocCode: "KA.01.0020",
    pharmacode: "3456789",
    gtin: "7680621450012",
    unitType: "injection",
    unitSize: "1ml syringe",
    priceExFactory: 180.00,
    pricePublic: 285.00,
    reimbursementCategory: null,
    isNarcotic: false,
    requiresPrescription: true,
    isActive: true,
  },
  {
    id: "med-juvederm-voluma",
    name: "Juvederm Voluma (2ml)",
    nameFr: "Juvederm Voluma (2ml)",
    nameDe: "Juvederm Voluma (2ml)",
    atcCode: "V04CX",
    swissmedicNumber: "62146",
    tardocCode: "KA.01.0020",
    pharmacode: "3456790",
    gtin: "7680621460011",
    unitType: "injection",
    unitSize: "2ml syringe",
    priceExFactory: 320.00,
    pricePublic: 485.00,
    reimbursementCategory: null,
    isNarcotic: false,
    requiresPrescription: true,
    isActive: true,
  },
  {
    id: "med-restylane",
    name: "Restylane (1ml)",
    nameFr: "Restylane (1ml)",
    nameDe: "Restylane (1ml)",
    atcCode: "V04CX",
    swissmedicNumber: "58234",
    tardocCode: "KA.01.0020",
    pharmacode: "2567891",
    gtin: "7680582340015",
    unitType: "injection",
    unitSize: "1ml syringe",
    priceExFactory: 165.00,
    pricePublic: 265.00,
    reimbursementCategory: null,
    isNarcotic: false,
    requiresPrescription: true,
    isActive: true,
  },
  {
    id: "med-lidocaine-1",
    name: "Lidocaine 1% (20ml)",
    nameFr: "Lidocaïne 1% (20ml)",
    nameDe: "Lidocain 1% (20ml)",
    atcCode: "N01BB02",
    swissmedicNumber: "12345",
    tardocCode: null,
    pharmacode: "1234567",
    gtin: "7680123450018",
    unitType: "solution",
    unitSize: "20ml",
    priceExFactory: 8.50,
    pricePublic: 12.50,
    reimbursementCategory: "B",
    isNarcotic: false,
    requiresPrescription: true,
    isActive: true,
  },
  {
    id: "med-lidocaine-2",
    name: "Lidocaine 2% with Epinephrine (20ml)",
    nameFr: "Lidocaïne 2% avec Épinéphrine (20ml)",
    nameDe: "Lidocain 2% mit Epinephrin (20ml)",
    atcCode: "N01BB52",
    swissmedicNumber: "12346",
    tardocCode: null,
    pharmacode: "1234568",
    gtin: "7680123460017",
    unitType: "solution",
    unitSize: "20ml",
    priceExFactory: 12.50,
    pricePublic: 18.50,
    reimbursementCategory: "B",
    isNarcotic: false,
    requiresPrescription: true,
    isActive: true,
  },
  {
    id: "med-arnica-cream",
    name: "Arnica Montana Cream (50g)",
    nameFr: "Crème Arnica Montana (50g)",
    nameDe: "Arnika Montana Creme (50g)",
    atcCode: "D11AX",
    swissmedicNumber: "45678",
    tardocCode: null,
    pharmacode: "4567890",
    gtin: "7680456780019",
    unitType: "cream",
    unitSize: "50g tube",
    priceExFactory: 8.00,
    pricePublic: 14.50,
    reimbursementCategory: "D",
    isNarcotic: false,
    requiresPrescription: false,
    isActive: true,
  },
  {
    id: "med-vitamin-k-cream",
    name: "Vitamin K Cream (30g)",
    nameFr: "Crème Vitamine K (30g)",
    nameDe: "Vitamin K Creme (30g)",
    atcCode: "D11AX",
    swissmedicNumber: "45679",
    tardocCode: null,
    pharmacode: "4567891",
    gtin: "7680456790018",
    unitType: "cream",
    unitSize: "30g tube",
    priceExFactory: 22.00,
    pricePublic: 35.00,
    reimbursementCategory: null,
    isNarcotic: false,
    requiresPrescription: false,
    isActive: true,
  },
  {
    id: "med-antibiotic-prophylaxis",
    name: "Augmentin 625mg (20 tablets)",
    nameFr: "Augmentin 625mg (20 comprimés)",
    nameDe: "Augmentin 625mg (20 Tabletten)",
    atcCode: "J01CR02",
    swissmedicNumber: "34567",
    tardocCode: null,
    pharmacode: "3456781",
    gtin: "7680345670016",
    unitType: "tablet",
    unitSize: "625mg x 20",
    priceExFactory: 18.50,
    pricePublic: 28.50,
    reimbursementCategory: "A",
    isNarcotic: false,
    requiresPrescription: true,
    isActive: true,
  },
  {
    id: "med-pain-relief",
    name: "Dafalgan 1g (16 tablets)",
    nameFr: "Dafalgan 1g (16 comprimés)",
    nameDe: "Dafalgan 1g (16 Tabletten)",
    atcCode: "N02BE01",
    swissmedicNumber: "23456",
    tardocCode: null,
    pharmacode: "2345678",
    gtin: "7680234560014",
    unitType: "tablet",
    unitSize: "1g x 16",
    priceExFactory: 4.50,
    pricePublic: 7.90,
    reimbursementCategory: "D",
    isNarcotic: false,
    requiresPrescription: false,
    isActive: true,
  },
  {
    id: "med-compression-garment",
    name: "Post-surgical Compression Garment",
    nameFr: "Vêtement de compression post-chirurgical",
    nameDe: "Postoperatives Kompressionskleidungsstück",
    atcCode: "V07AB",
    swissmedicNumber: null,
    tardocCode: null,
    pharmacode: "5678901",
    gtin: null,
    unitType: "other",
    unitSize: "1 piece",
    priceExFactory: 85.00,
    pricePublic: 145.00,
    reimbursementCategory: null,
    isNarcotic: false,
    requiresPrescription: false,
    isActive: true,
  },
];

// ============================================================================
// ACF — Ambulatory Case Flatrates (Forfaits ambulatoires)
// ============================================================================

/**
 * ACF tariff type code used in invoice line items.
 * Stored as numeric 5 in DB (tariff_code column is number | null).
 * Display as "005" (zero-padded) on PDF and XML output.
 * Data is served live from the Sumex1 acfValidatorServer100.
 */
export const ACF_TARIFF_CODE = 5;
export const ACF_TARIFF_TYPE_DISPLAY = "005";

// Helper functions

/**
 * Calculate the CHF price from tax points
 */
export function calculateTardocPrice(
  taxPoints: number,
  canton: SwissCanton = DEFAULT_CANTON,
  applyNeutralityFactor: boolean = true
): number {
  const taxPointValue = CANTON_TAX_POINT_VALUES[canton];
  const factor = applyNeutralityFactor ? COST_NEUTRALITY_FACTOR : 1;
  return Math.round(taxPoints * taxPointValue * factor * 100) / 100;
}

/**
 * Get a TARDOC tariff item by code
 */
export function getTardocTariffItem(code: string): TardocTariffItem | null {
  return TARDOC_TARIFF_ITEMS.find(item => item.code === code) || null;
}

/**
 * Get TARDOC tariff items by main chapter
 */
export function getTardocTariffsByChapter(mainChapter: TardocMainChapter): TardocTariffItem[] {
  return TARDOC_TARIFF_ITEMS.filter(item => item.mainChapter === mainChapter && item.isActive);
}

/**
 * Search TARDOC tariff items
 */
export function searchTardocTariffs(query: string): TardocTariffItem[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return TARDOC_TARIFF_ITEMS.filter(item => item.isActive);
  
  return TARDOC_TARIFF_ITEMS.filter(item => 
    item.isActive && (
      item.code.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery) ||
      item.descriptionFr.toLowerCase().includes(normalizedQuery) ||
      item.descriptionDe.toLowerCase().includes(normalizedQuery)
    )
  );
}

/**
 * Get a medicine by ID
 */
export function getTardocMedicine(id: string): TardocMedicine | null {
  return TARDOC_MEDICINES.find(med => med.id === id) || null;
}

/**
 * Search medicines
 */
export function searchTardocMedicines(query: string): TardocMedicine[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return TARDOC_MEDICINES.filter(med => med.isActive);
  
  return TARDOC_MEDICINES.filter(med => 
    med.isActive && (
      med.name.toLowerCase().includes(normalizedQuery) ||
      med.nameFr.toLowerCase().includes(normalizedQuery) ||
      med.nameDe.toLowerCase().includes(normalizedQuery) ||
      med.atcCode.toLowerCase().includes(normalizedQuery) ||
      (med.pharmacode && med.pharmacode.includes(normalizedQuery))
    )
  );
}

/**
 * Create a TARDOC-compliant invoice line
 */
export function createTardocInvoiceLine(
  tariffCode: string,
  quantity: number,
  serviceDate: string,
  providerId: string,
  providerGln: string,
  canton: SwissCanton = DEFAULT_CANTON
): TardocInvoiceLine | null {
  const tariffItem = getTardocTariffItem(tariffCode);
  if (!tariffItem) return null;
  
  const taxPointValue = CANTON_TAX_POINT_VALUES[canton];
  const unitPrice = calculateTardocPrice(tariffItem.taxPoints, canton);
  const totalPrice = Math.round(unitPrice * quantity * 100) / 100;
  
  // Swiss VAT rate for medical services (exempt or reduced)
  const vatRate = 0; // Medical services are VAT exempt in Switzerland
  const vatAmount = 0;
  
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    tardocCode: tariffCode,
    description: tariffItem.description,
    quantity,
    taxPoints: tariffItem.taxPoints,
    taxPointValue,
    costNeutralityFactor: COST_NEUTRALITY_FACTOR,
    unitPrice,
    totalPrice,
    vatRate,
    vatAmount,
    serviceDate,
    providerId,
    providerGln,
  };
}

/**
 * Sumex1.net TARDOC consultation codes (valid from 01.01.2026)
 * Based on https://sumex1.net/ standard
 * Note: TARMED was replaced by TARDOC as of 01.01.2026
 */
export const SUMEX_TARDOC_CODES = {
  // Base consultation code - first 5 minutes
  BASE_CONSULTATION: {
    code: "AA 00.0010",
    description: "Consultation de base, les 5 premières minutes",
    descriptionFr: "Consultation de base, les 5 premières minutes",
    priceChf: 18.43,
    durationMinutes: 5,
  },
  // Per-minute code - each additional minute after base
  PER_MINUTE: {
    code: "AA 00.0020",
    description: "Consultation, par minute supplémentaire",
    descriptionFr: "Consultation, par minute supplémentaire",
    priceChf: 3.687,
    durationMinutes: 1,
  },
};

/**
 * Calculate TARDOC consultation price based on duration using Sumex codes
 * Valid from 01.01.2026 (TARDOC replaced TARMED)
 * @param durationMinutes Total consultation duration in minutes
 * @returns Object with line items and total price
 */
export function calculateSumexTardocPrice(durationMinutes: number): {
  lines: Array<{
    code: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  totalPrice: number;
} {
  const lines: Array<{
    code: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }> = [];

  // Base consultation - first 5 minutes (always charged)
  const baseCode = SUMEX_TARDOC_CODES.BASE_CONSULTATION;
  lines.push({
    code: baseCode.code,
    description: baseCode.descriptionFr,
    quantity: 1,
    unitPrice: baseCode.priceChf,
    total: baseCode.priceChf,
  });

  // Additional minutes after the first 5
  const additionalMinutes = Math.max(0, durationMinutes - 5);
  if (additionalMinutes > 0) {
    const perMinuteCode = SUMEX_TARDOC_CODES.PER_MINUTE;
    const additionalTotal = Math.round(additionalMinutes * perMinuteCode.priceChf * 100) / 100;
    lines.push({
      code: perMinuteCode.code,
      description: perMinuteCode.descriptionFr,
      quantity: additionalMinutes,
      unitPrice: perMinuteCode.priceChf,
      total: additionalTotal,
    });
  }

  const totalPrice = lines.reduce((sum, line) => sum + line.total, 0);

  return {
    lines,
    totalPrice: Math.round(totalPrice * 100) / 100,
  };
}

/**
 * Format a Swiss reference number (BESR/QR reference)
 */
export function formatSwissReference(reference: string): string {
  // Remove any spaces and format in groups of 5
  const cleaned = reference.replace(/\s/g, '');
  const groups = cleaned.match(/.{1,5}/g) || [];
  return groups.join(' ');
}

/**
 * Validate a Swiss IBAN
 */
export function isValidSwissIban(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  if (!cleaned.startsWith('CH') && !cleaned.startsWith('LI')) return false;
  if (cleaned.length !== 21) return false;
  
  // Basic format check
  const regex = /^(CH|LI)\d{2}\d{5}[A-Z0-9]{12}$/;
  return regex.test(cleaned);
}

/**
 * Format Swiss currency
 */
export function formatChf(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Get canton name
 */
export function getCantonName(canton: SwissCanton, language: 'en' | 'fr' | 'de' = 'en'): string {
  const names: Record<SwissCanton, { en: string; fr: string; de: string }> = {
    AG: { en: 'Aargau', fr: 'Argovie', de: 'Aargau' },
    AI: { en: 'Appenzell Innerrhoden', fr: 'Appenzell Rhodes-Intérieures', de: 'Appenzell Innerrhoden' },
    AR: { en: 'Appenzell Ausserrhoden', fr: 'Appenzell Rhodes-Extérieures', de: 'Appenzell Ausserrhoden' },
    BE: { en: 'Bern', fr: 'Berne', de: 'Bern' },
    BL: { en: 'Basel-Landschaft', fr: 'Bâle-Campagne', de: 'Basel-Landschaft' },
    BS: { en: 'Basel-Stadt', fr: 'Bâle-Ville', de: 'Basel-Stadt' },
    FR: { en: 'Fribourg', fr: 'Fribourg', de: 'Freiburg' },
    GE: { en: 'Geneva', fr: 'Genève', de: 'Genf' },
    GL: { en: 'Glarus', fr: 'Glaris', de: 'Glarus' },
    GR: { en: 'Graubünden', fr: 'Grisons', de: 'Graubünden' },
    JU: { en: 'Jura', fr: 'Jura', de: 'Jura' },
    LU: { en: 'Lucerne', fr: 'Lucerne', de: 'Luzern' },
    NE: { en: 'Neuchâtel', fr: 'Neuchâtel', de: 'Neuenburg' },
    NW: { en: 'Nidwalden', fr: 'Nidwald', de: 'Nidwalden' },
    OW: { en: 'Obwalden', fr: 'Obwald', de: 'Obwalden' },
    SG: { en: 'St. Gallen', fr: 'Saint-Gall', de: 'St. Gallen' },
    SH: { en: 'Schaffhausen', fr: 'Schaffhouse', de: 'Schaffhausen' },
    SO: { en: 'Solothurn', fr: 'Soleure', de: 'Solothurn' },
    SZ: { en: 'Schwyz', fr: 'Schwytz', de: 'Schwyz' },
    TG: { en: 'Thurgau', fr: 'Thurgovie', de: 'Thurgau' },
    TI: { en: 'Ticino', fr: 'Tessin', de: 'Tessin' },
    UR: { en: 'Uri', fr: 'Uri', de: 'Uri' },
    VD: { en: 'Vaud', fr: 'Vaud', de: 'Waadt' },
    VS: { en: 'Valais', fr: 'Valais', de: 'Wallis' },
    ZG: { en: 'Zug', fr: 'Zoug', de: 'Zug' },
    ZH: { en: 'Zürich', fr: 'Zurich', de: 'Zürich' },
  };
  
  return names[canton][language];
}
