/**
 * Sumex1 GeneralInvoiceRequestManager500 & GeneralInvoiceResponseManager500 API Client
 *
 * Connects to the Sumex1 REST servers on the Windows VM to:
 * - Build fully validated generalInvoiceRequest_500 XML invoices
 * - Generate standard Swiss invoice PDFs (TP/TG Rechnung)
 * - Parse generalInvoiceResponse_500 XML responses from insurers
 *
 * API Pattern (same as tardocValidatorServer100 / acfValidatorServer100):
 * - Factory:    GET  IManager/GetCreateManager  → {pIManager: handle}
 * - Methods:    POST IInterface/Method           with JSON body
 * - Properties: GET  IInterface/GetProp?pI...=handle
 * - Destruct:   PUT  IManager/PutDestructManager with JSON body
 *
 * Interfaces (Request):
 *   IGeneralInvoiceRequestManager — factory, GetXML, Print, LoadXML
 *   IGeneralInvoiceRequest        — SetRequest, SetTiers, SetInvoice, SetLaw, SetPatient, ...
 *   IAddress                      — Initialize, SetPerson/SetCompany, SetPostal, SetOnline, AddPhone
 *   IServiceExInput               — for extended tariffs (TARDOC)
 *   IGeneralInvoiceResult         — read-back after GetXML/Print
 *
 * Interfaces (Response):
 *   IGeneralInvoiceResponseManager — factory, LoadXML, Print
 *   IGeneralInvoiceResponse        — GetResponse, GetAcceptType, GetRejectType, GetPendingType, ...
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUMEX_REQUEST_BASE_URL =
  process.env.SUMEX_INVOICE_REQUEST_URL ||
  "http://34.100.230.253:8080/generalInvoiceRequestManagerServer500";

const SUMEX_RESPONSE_BASE_URL =
  process.env.SUMEX_INVOICE_RESPONSE_URL ||
  "http://34.100.230.253:8080/generalInvoiceResponseManagerServer500";

const LOG_PREFIX = "[SumexInvoice]";

// ---------------------------------------------------------------------------
// Enums — matching Sumex1 COM enumeration values
// ---------------------------------------------------------------------------

export enum LawType {
  KVG = 0,
  UVG = 1,
  MVG = 2,
  IVG = 3,
  VVG = 4,
}

export enum TiersMode {
  Garant = 0,
  Payant = 1,
  Soldant = 2,
}

export enum SexType {
  Male = 0,
  Female = 1,
}

export enum GenderType {
  Male = 0,
  Female = 1,
  Diverse = 2,
}

export enum SideType {
  None = 0,
  Left = 1,
  Right = 2,
  Both = 3,
}

export enum TreatmentType {
  Ambulatory = 0,
  Stationary = 1,
}

export enum TreatmentReason {
  Disease = 0,
  Accident = 1,
  Maternity = 2,
  Prevention = 3,
  BirthDefect = 4,
  Unknown = 5,
}

export enum DiagnosisType {
  ICD = 0,
  Cantonal = 1,
  ByContract = 2,
  FreeText = 3,
  BirthDefect = 4,
  ICPC = 5,
  DRG = 6,
}

export enum EsrType {
  QR = 5,
  QRPlus = 6,
  RedPayinSlipQR = 7,
  RedPayinSlipQRPlus = 8,
}

export enum RoleType {
  Physician = 1,
  Physiotherapist = 2,
  Chiropractor = 4,
  Ergotherapist = 8,
  Nutritionist = 16,
  Midwife = 32,
  Logotherapist = 64,
  Hospital = 128,
  RehabClinic = 160,
  PsychiatricClinic = 192,
  Pharmacist = 256,
  Dentist = 512,
  LabTechnician = 1024,
  DentalTechnician = 2048,
  OtherTechnician = 4096,
  Psychologist = 16384,
  Wholesaler = 65536,
  NursingStaff = 131072,
  Transport = 262144,
  Druggist = 524288,
  NaturopathicDoctor = 1048576,
  NaturopathicTherapist = 2097152,
  Other = 4194304,
}

export enum PlaceType {
  Practice = 1,
  Hospital = 2,
  Lab = 4,
  Association = 8,
  Company = 16,
}

export enum RequestType {
  Invoice = 0,
  Reminder = 1,
}

export enum RequestSubtype {
  Normal = 0,
  Copy = 1,
  Refund = 2,
  Storno = 3,
}

export enum PartnerType {
  Employer = 1,
  Referrer = 2,
  ServiceProvider = 3,
  PrimaryClinician = 4,
  LeadDoctor = 5,
  AssistantPhysician = 6,
  SeniorPhysician = 7,
  ChiefPhysician = 8,
  Surgeon = 9,
  Anaesthetist = 10,
  ConsultantDoctor = 11,
  Internist = 12,
  CoCare = 13,
  Radiologist = 14,
  NuclearMedicine = 15,
  Other = 16,
}

export enum YesNo {
  No = 0,
  Yes = 1,
}

export enum ModusType {
  Production = 0,
  Test = 1,
}

export enum BillingRoleType {
  Both = 0,
  MT = 1,
  TT = 2,
  None = 3,
}

export enum MedicalRoleType {
  SelfEmployed = 0,
  Employee = 1,
}

export enum DocumentType {
  Report = 0,
  Image = 1,
  Unemployability = 2,
  Questionnaire = 3,
  Notification = 4,
  Planning = 5,
  Prescription = 6,
  SalaryCession = 7,
  UndefinedDoc = 8,
}

export enum ResponseType {
  Pending = 1,
  Rejected = 2,
  Accepted = 3,
}

export enum StatusType {
  Unknown = 2,
  Ambiguous = 3,
  Received = 4,
  Frozen = 5,
  Processed = 6,
  Granted = 7,
  Canceled = 8,
  Claimed = 9,
  Reimbursed = 10,
}

/** Canton enum — maps canton abbreviations to Sumex1 integer codes */
export const CantonCode: Record<string, number> = {
  AG: 1, AI: 2, AR: 3, BE: 4, BL: 5, BS: 6, FR: 7, GE: 8, GL: 9, GR: 10,
  JU: 11, LU: 12, NE: 13, NW: 14, OW: 15, SG: 16, SH: 17, SO: 18, SZ: 19,
  TG: 20, TI: 21, UR: 22, VD: 23, VS: 24, ZG: 25, ZH: 26,
};

/** Generation attribute bit flags for GetXML / Print */
export enum GenerationAttribute {
  None = 0,
  ExcludeESRInPrint = 1,
  ExcludeCreditorInPrint = 2,
  ExcludeCreditorNameInPrint = 4,
  ExcludeDebitorInPrint = 32,
  ExcludeDebitorNameInPrint = 64,
  ExcludeAccountingInPrint = 128,
  ExcludeQRCodeInPrint = 256,
  ExcludeAmountInPrint = 512,
  ExcludeRemarksInPrint = 1024,
  IncludeGeometryInPrint = 8192,
  ExcludeQRPaymentMarkingInPrint = 16384,
  GenerateXMLWithoutDocuments = 65536,
  GenerateXMLWithoutSignature = 131072,
  GenerateXMLWithoutEncryption = 262144,
  GenerateDowngradeToV450 = 2097152,
}

// ---------------------------------------------------------------------------
// Types — Input data structures
// ---------------------------------------------------------------------------

export type InvoiceAddress = {
  // Person fields (use for patients, doctors)
  familyName?: string;
  givenName?: string;
  salutation?: string;
  title?: string;
  subaddressing?: string;
  // Company fields (use for insurers, billers)
  companyName?: string;
  department?: string;
  // Postal
  street: string;
  poBox?: string;
  zip: string;
  city: string;
  stateCode: string; // Canton abbreviation e.g. "GE"
  country?: string;
  countryCode?: string;
  // Contact
  email?: string;
  url?: string;
  phone?: string;
  phoneLocalCode?: string;
};

export type InvoiceServiceInput = {
  tariffType: string;    // "007" TARDOC, "402" drugs, "005" ACF, etc.
  code: string;
  referenceCode?: string;
  quantity: number;
  sessionNumber?: number;
  groupSize?: number;
  dateBegin: string;     // ISO date
  dateEnd?: string;      // ISO date
  providerGln: string;
  responsibleGln: string;
  side?: SideType;
  serviceName?: string;  // auto-expanded if validator installed
  unit?: number;         // tax points — auto-expanded if 0
  unitFactor?: number;   // tax point value
  externalFactor?: number;
  amount?: number;       // auto-expanded if 0
  vatRate?: number;
  remark?: string;
  sectionCode?: string;
  ignoreValidate?: YesNo;
  serviceAttributes?: number;
};

export type InvoiceServiceExInput = {
  tariffType: string;
  code: string;
  referenceCode?: string;
  quantity: number;
  sessionNumber: number;
  groupSize?: number;
  dateBegin: string;
  dateEnd?: string;
  side?: SideType;
  serviceName?: string;
  unitMT?: number;
  unitFactorMT?: number;
  externalFactorMT?: number;
  scalingFactorMT?: number;
  amountMT?: number;
  unitTT?: number;
  unitFactorTT?: number;
  externalFactorTT?: number;
  scalingFactorTT?: number;
  amountTT?: number;
  amountAsymmetric?: number;
  vatRate?: number;
  remark?: string;
  ignoreValidate?: YesNo;
  serviceAttributes?: number;
};

export type InvoiceDiagnosis = {
  type: DiagnosisType;
  code: string;
  text?: string;
};

export type InvoicePartner = {
  type: PartnerType;
  gln?: string;
  zsr?: string;
  address: InvoiceAddress;
};

/** Complete input to build an invoice via Sumex1 */
export type SumexInvoiceInput = {
  // Language
  language?: 1 | 2 | 3; // 1=DE, 2=FR, 3=IT

  // Request params
  roleType: RoleType;
  placeType: PlaceType;
  requestType?: RequestType;
  requestSubtype?: RequestSubtype;
  remark?: string;

  // Tiers mode
  tiersMode: TiersMode;
  vatNumber?: string;
  amountPrepaid?: number;

  // Invoice reference
  invoiceId: string;
  invoiceDate: string; // ISO date
  invoiceTimestamp?: number;

  // Credit reference (optional)
  creditId?: string;
  creditDate?: string;
  creditTimestamp?: number;

  // Reminder (optional)
  reminderLevel?: number;
  reminderText?: string;
  reminderDate?: string;
  reminderTimestamp?: number;
  reminderAmount?: number;

  // Law
  lawType: LawType;
  caseDate?: string;
  caseId?: string;
  insuredId?: string; // 20-digit card ID

  // ESR/QR payment
  esrType?: EsrType;
  iban: string;
  esrReference?: string;
  customerNote?: string;
  paymentPeriod?: number; // days

  // Biller
  billerGln: string;
  billerAddress: InvoiceAddress;
  billerZsr?: string;

  // Provider
  providerGln: string;
  providerGlnLocation?: string;
  providerAddress: InvoiceAddress;
  providerZsr?: string;

  // Insurance (required for TP)
  insuranceGln?: string;
  insuranceAddress?: InvoiceAddress;

  // Patient
  patientSex: SexType;
  patientGender?: GenderType;
  patientBirthdate: string; // ISO date
  patientSsn?: string;      // AVS/AHV number 756.xxxx.xxxx.xx
  patientAddress: InvoiceAddress;

  // Insured (optional, if different from patient)
  insuredAddress?: InvoiceAddress;

  // Guarantor (optional, auto-cloned from patient if omitted)
  guarantorAddress?: InvoiceAddress;

  // Debitor (optional, auto-assigned in Finalize)
  debitorAddress?: InvoiceAddress;

  // Treatment
  treatmentCanton: string; // e.g. "GE"
  treatmentType?: TreatmentType;
  treatmentReason?: TreatmentReason;
  treatmentDateBegin: string;
  treatmentDateEnd: string;
  apid?: string; // case number
  acid?: string; // accident number

  // Diagnoses
  diagnoses?: InvoiceDiagnosis[];

  // Partners (referrer, employer, etc.)
  partners?: InvoicePartner[];

  // Services (simple tariff)
  services?: InvoiceServiceInput[];

  // Services (extended tariff — TARDOC)
  servicesEx?: InvoiceServiceExInput[];

  // Package info
  softwarePackage?: string;
  softwareVersion?: number;
  softwareId?: number;
  softwareCopyright?: string;

  // Transport / processing
  transportFrom?: string;
  transportTo?: string;
  transportViaGln?: string;

  // Processing flags (per CHM: SetProcessing method)
  printPatientInvoiceOnly?: YesNo;
  printCopyToGuarantor?: YesNo;
  trustCenterGLN?: string;

  // Modus
  modus?: ModusType;
};

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

async function reqGet<T = Record<string, unknown>>(path: string): Promise<T> {
  const url = `${SUMEX_REQUEST_BASE_URL}/${path}`;
  console.log(`${LOG_PREFIX} GET ${path}`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`${LOG_PREFIX} GET ${path} FAILED: ${res.status} ${err}`);
    throw new Error(`Sumex Request GET ${path} failed: ${res.status} ${err}`);
  }
  const data = await res.json() as T;
  console.log(`${LOG_PREFIX} GET ${path} OK`);
  return data;
}

async function reqPost<T = Record<string, unknown>>(
  iface: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${SUMEX_REQUEST_BASE_URL}/${iface}/${method}`;
  console.log(`${LOG_PREFIX} POST ${iface}/${method}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      const abortCode = err.abortCode ?? "";
      const abortText = (err.pbstrAbort as string) || (err.errorText as string) || "";
      const errText = abortText || (err.errorCode as string) || `${res.status}`;
      console.error(`${LOG_PREFIX} POST ${iface}/${method} FAILED: code=${abortCode} ${errText}`);
      throw new Error(`Sumex Request POST ${iface}/${method} failed: [${abortCode}] ${errText}`);
    }
    // Read as text first then parse — avoids truncated JSON issues with large responses
    const text = await res.text();
    try {
      const data = JSON.parse(text) as T;
      console.log(`${LOG_PREFIX} POST ${iface}/${method} OK`);
      return data;
    } catch (parseErr) {
      console.error(`${LOG_PREFIX} POST ${iface}/${method} JSON parse failed: textLen=${text.length}, first200=${text.slice(0, 200)}, last200=${text.slice(-200)}`);
      throw parseErr;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function resGet<T = Record<string, unknown>>(path: string): Promise<T> {
  const url = `${SUMEX_RESPONSE_BASE_URL}/${path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Sumex Response GET ${path} failed: ${res.status} ${err}`);
  }
  return res.json() as Promise<T>;
}

async function resPost<T = Record<string, unknown>>(
  iface: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${SUMEX_RESPONSE_BASE_URL}/${iface}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const errText = (err.errorText as string) || (err.errorCode as string) || `${res.status}`;
    throw new Error(`Sumex Response POST ${iface}/${method} failed: ${errText}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Session (Manager) — Request
// ---------------------------------------------------------------------------

type RequestSession = {
  managerHandle: number;
  requestHandle: number | null;
  addressHandle: number | null;
  createdAt: number;
};

const REQ_SESSION_TTL_MS = 50 * 60 * 1000; // 50 min (server auto-cleans at 60)
let cachedReqSession: RequestSession | null = null;

function isReqSessionValid(s: RequestSession | null): s is RequestSession {
  if (!s) return false;
  return Date.now() - s.createdAt < REQ_SESSION_TTL_MS;
}

async function getAbortInfo(managerHandle: number): Promise<string> {
  try {
    const res = await reqPost<{ pbstrAbortInfo: string }>(
      "IGeneralInvoiceRequestManager",
      "GetAbortInfo",
      { pIGeneralInvoiceRequestManager: managerHandle },
    );
    return res.pbstrAbortInfo || "";
  } catch {
    return "Unknown error";
  }
}

/**
 * Create a fresh IGeneralInvoiceRequestManager instance.
 * Also creates the IGeneralInvoiceRequest and IAddress sub-interfaces.
 */
async function createRequestSession(): Promise<RequestSession> {
  // Create manager
  const factory = await reqGet<{ pIGeneralInvoiceRequestManager: number }>(
    "IGeneralInvoiceRequestManager/GetCreateGeneralInvoiceRequestManager",
  );
  const mgrHandle = factory.pIGeneralInvoiceRequestManager;

  // Create request sub-interface
  const reqIface = await reqGet<{ pIGeneralInvoiceRequest: number }>(
    `IGeneralInvoiceRequestManager/GetGeneralInvoiceRequest?pIGeneralInvoiceRequestManager=${mgrHandle}`,
  );
  const reqHandle = reqIface.pIGeneralInvoiceRequest;

  // Create address sub-interface (GET property, not POST method)
  const addrIface = await reqGet<{ pIAddress: number }>(
    `IGeneralInvoiceRequest/GetCreateAddress?pIGeneralInvoiceRequest=${reqHandle}`,
  );
  const addrHandle = addrIface.pIAddress;

  const session: RequestSession = {
    managerHandle: mgrHandle,
    requestHandle: reqHandle,
    addressHandle: addrHandle,
    createdAt: Date.now(),
  };

  cachedReqSession = session;
  return session;
}

/**
 * Destroy a request session to free server resources.
 */
async function destroyRequestSession(session: RequestSession): Promise<void> {
  // Server auto-cleans instances after 1 hour of inactivity.
  // Destruct is not available on all server versions, so this is best-effort.
  if (cachedReqSession === session) cachedReqSession = null;
}

// ---------------------------------------------------------------------------
// Address helper — configures IAddress then returns handle
// ---------------------------------------------------------------------------

async function setupAddress(
  addrHandle: number,
  addr: InvoiceAddress,
): Promise<number> {
  // Initialize (reset)
  await reqPost("IAddress", "Initialize", { pIAddress: addrHandle });

  // Person or Company
  if (addr.companyName) {
    await reqPost("IAddress", "SetCompany", {
      pIAddress: addrHandle,
      bstrCompanyName: addr.companyName,
      bstrDepartment: addr.department || "",
      bstrSubaddressing: addr.subaddressing || "",
    });
  }
  if (addr.familyName) {
    await reqPost("IAddress", "SetPerson", {
      pIAddress: addrHandle,
      bstrFamilyname: addr.familyName,
      bstrGivenname: addr.givenName || "",
      bstrSalutation: addr.salutation || "",
      bstrTitle: addr.title || "",
      bstrSubaddressing: addr.subaddressing || "",
    });
  }

  // Postal
  await reqPost("IAddress", "SetPostal", {
    pIAddress: addrHandle,
    bstrStreet: addr.street || "",
    bstrPoBox: addr.poBox || "",
    bstrZip: addr.zip || "",
    bstrCity: addr.city || "",
    bstrStateCode: addr.stateCode || "",
    bstrCountry: addr.country || "",
    bstrCountryCode: addr.countryCode || "",
  });

  // Online
  if (addr.email || addr.url) {
    await reqPost("IAddress", "SetOnline", {
      pIAddress: addrHandle,
      bstrEMail: addr.email || "",
      bstrUrl: addr.url || "",
    });
  }

  // Phone
  if (addr.phone) {
    await reqPost("IAddress", "AddPhone", {
      pIAddress: addrHandle,
      bstrNumber: addr.phone,
      bstrLocalCode: addr.phoneLocalCode || "",
      bstrInternationalCode: "",
      bstrExt: "",
    });
  }

  return addrHandle;
}

// ---------------------------------------------------------------------------
// IServiceExInput helper — initializes physician, patient, treatment context
// ---------------------------------------------------------------------------

/**
 * Initialize an IServiceExInput handle with the required static data.
 * The CHM docs state that even if a validator is not used, IServiceExInput
 * still holds data required to produce a standard-compliant XML infoset
 * (billingRole, medicalRole, provider GLN, patient data, treatment context).
 */
async function initServiceExInput(
  handle: number,
  input: SumexInvoiceInput,
): Promise<void> {
  // 1. Initialize (reset static data)
  await reqPost("IServiceExInput", "Initialize", {
    pIServiceExInput: handle,
  });

  // 2. SetPhysician — provider/responsible GLN, medical & billing role
  await reqPost("IServiceExInput", "SetPhysician", {
    pIServiceExInput: handle,
    eMedicalRole: MedicalRoleType.SelfEmployed,
    eBillingRole: BillingRoleType.Both,
    bstrProviderGLN: input.providerGln,
    bstrResponsibleGLN: input.providerGln,
    bstrMedicalSectionCode: "",
  });

  // 3. SetPatient — birthdate and sex
  await reqPost("IServiceExInput", "SetPatient", {
    pIServiceExInput: handle,
    dBirthdate: input.patientBirthdate,
    eSex: input.patientSex,
  });

  // 4. SetTreatment — canton, law, treatment type
  const cantonCode = CantonCode[input.treatmentCanton?.toUpperCase()] ?? 0;
  await reqPost("IServiceExInput", "SetTreatment", {
    pIServiceExInput: handle,
    eCanton: cantonCode,
    eLaw: input.lawType,
    eTreatmentType: input.treatmentType ?? TreatmentType.Ambulatory,
    bstrGLNSection: "",
  });

  console.log(`${LOG_PREFIX} IServiceExInput initialized: physician=${input.providerGln}, canton=${input.treatmentCanton}(${cantonCode}), law=${input.lawType}`);
}

// ---------------------------------------------------------------------------
// Build Invoice — orchestrates all Set* / Add* calls
// ---------------------------------------------------------------------------

export type SumexBuildResult = {
  success: boolean;
  xmlFilePath?: string;
  xmlContent?: string;
  pdfFilePath?: string;
  pdfContent?: Buffer;
  validationError?: number;
  usedSchema?: string;
  timestamp?: number;
  error?: string;
  abortInfo?: string;
};

/**
 * Build a complete generalInvoiceRequest_500 via the Sumex1 REST server.
 *
 * This function:
 * 1. Creates a fresh manager/request session
 * 2. Calls all Set* methods to populate invoice data
 * 3. Calls Finalize to validate
 * 4. Calls GetXML to produce the XML infoset
 * 5. Optionally calls Print to produce PDF
 * 6. Returns the XML content (and optionally PDF path)
 *
 * @param input - Complete invoice input data
 * @param options - Additional options (generatePdf, pdfPath, generationAttributes)
 */
export async function buildInvoiceRequest(
  input: SumexInvoiceInput,
  options?: {
    generatePdf?: boolean;
    pdfPath?: string;
    generationAttributes?: number;
  },
): Promise<SumexBuildResult> {
  // Always create a fresh session for each invoice build
  console.log(`${LOG_PREFIX} buildInvoiceRequest starting — invoiceId=${input.invoiceId}`);
  const session = await createRequestSession();
  const mgr = session.managerHandle;
  const req = session.requestHandle!;
  const addr = session.addressHandle!;
  console.log(`${LOG_PREFIX} Session created: mgr=${mgr}, req=${req}, addr=${addr}`);

  try {
    // --- SetPackage ---
    await reqPost("IGeneralInvoiceRequest", "SetPackage", {
      pIGeneralInvoiceRequest: req,
      bstrSoftwarePackage: input.softwarePackage || "AestheticsClinic",
      lSoftwareVersion: input.softwareVersion || 100,
      lSoftwareID: input.softwareId || 0,
      bstrSoftwareCopyright: input.softwareCopyright || "Aesthetics Clinic XT SA",
    });

    // --- SetRequest ---
    await reqPost("IGeneralInvoiceRequest", "SetRequest", {
      pIGeneralInvoiceRequest: req,
      eRoleType: input.roleType,
      ePlaceType: input.placeType,
      bstrRoleTitle: "",
      eRequestType: input.requestType ?? RequestType.Invoice,
      eRequestSubtype: input.requestSubtype ?? RequestSubtype.Normal,
      bstrRefundList: "",
      bstrRemark: input.remark || "",
    });

    // --- SetTiers ---
    await reqPost("IGeneralInvoiceRequest", "SetTiers", {
      pIGeneralInvoiceRequest: req,
      eTiersMode: input.tiersMode,
      ePatientAllowTS: YesNo.No,
      eAllowTPModification: YesNo.No,
      bstrVatNumber: input.vatNumber || "",
      dAmountPrepaid: input.amountPrepaid ?? 0,
    });

    // --- SetInvoice ---
    await reqPost("IGeneralInvoiceRequest", "SetInvoice", {
      pIGeneralInvoiceRequest: req,
      bstrRequestInvoiceID: input.invoiceId,
      dRequestInvoiceDate: input.invoiceDate,
      lRequestInvoiceTimestamp: input.invoiceTimestamp ?? 0,
    });

    // --- SetCredit (optional) ---
    if (input.creditId) {
      await reqPost("IGeneralInvoiceRequest", "SetCredit", {
        pIGeneralInvoiceRequest: req,
        bstrRequestCreditID: input.creditId,
        dRequestCreditDate: input.creditDate || input.invoiceDate,
        lRequestCreditTimestamp: input.creditTimestamp ?? 0,
      });
    }

    // --- SetReminder (optional) ---
    if (input.reminderLevel && input.reminderLevel > 0) {
      await reqPost("IGeneralInvoiceRequest", "SetReminder", {
        pIGeneralInvoiceRequest: req,
        lReminderLevel: input.reminderLevel,
        bstrReminderText: input.reminderText || `Rappel niveau ${input.reminderLevel}`,
        dRequestReminderDate: input.reminderDate || input.invoiceDate,
        lRequestReminderTimestamp: input.reminderTimestamp ?? 0,
        dAmountReminder: input.reminderAmount ?? 0,
      });
    }

    // --- SetLaw ---
    await reqPost("IGeneralInvoiceRequest", "SetLaw", {
      pIGeneralInvoiceRequest: req,
      eLawType: input.lawType,
      dCaseDate: input.caseDate || "0",
      bstrCaseID: input.caseId || "",
      bstrInsuredID: input.insuredId || "",
    });

    // --- SetEsrQR --- (creditor address + IBAN + reference)
    // Auto-generate a valid 27-digit QR reference from invoiceId if not provided
    let esrRef = input.esrReference || "";
    if (!esrRef && input.invoiceId) {
      // Convert invoiceId to a numeric hash → 26 digits + 1 check digit = 27 digits
      let numericPart = input.invoiceId.replace(/\D/g, "");
      if (numericPart.length === 0) {
        let hash = "";
        for (let i = 0; i < input.invoiceId.length; i++) {
          hash += input.invoiceId.charCodeAt(i).toString().padStart(3, "0");
        }
        numericPart = hash;
      }
      const padded = numericPart.length > 26 ? numericPart.slice(-26) : numericPart.padStart(26, "0");
      // Modulo 10 recursive check digit (standard Swiss QR reference)
      const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
      let carry = 0;
      for (const ch of padded) carry = table[(carry + parseInt(ch, 10)) % 10];
      esrRef = padded + ((10 - carry) % 10).toString();
      console.log(`${LOG_PREFIX} Auto-generated ESR reference: ${esrRef} (from invoiceId=${input.invoiceId})`);
    }
    await setupAddress(addr, input.billerAddress);
    await reqPost("IGeneralInvoiceRequest", "SetEsrQR", {
      pIGeneralInvoiceRequest: req,
      eEsrType: input.esrType ?? EsrType.QR,
      bstrIBAN: (input.iban || "").replace(/\s+/g, ""),
      bstrReferenceNumber: esrRef,
      bstrCustomerNote: input.customerNote || "",
      pICreditorAddress: addr,
      lPaymentPeriod: input.paymentPeriod ?? 30,
    });

    // --- SetBillerGLN ---
    await setupAddress(addr, input.billerAddress);
    await reqPost("IGeneralInvoiceRequest", "SetBillerGLN", {
      pIGeneralInvoiceRequest: req,
      bstrGLN: input.billerGln,
      pIAddress: addr,
    });

    // --- SetBillerZSR (optional) ---
    // Swiss ZSR format: letter + 6 digits (e.g. K460025, H123456)
    const isValidZsr = (zsr: string) => /^[A-Za-z]\d{6}$/.test(zsr);
    if (input.billerZsr && isValidZsr(input.billerZsr)) {
      await setupAddress(addr, input.billerAddress);
      await reqPost("IGeneralInvoiceRequest", "SetBillerZSR", {
        pIGeneralInvoiceRequest: req,
        bstrZSR: input.billerZsr,
        pIAddress: addr,
      });
    } else if (input.billerZsr) {
      console.warn(`${LOG_PREFIX} Skipping SetBillerZSR — invalid ZSR format: '${input.billerZsr}'`);
    }

    // --- SetProviderGLN ---
    await setupAddress(addr, input.providerAddress);
    await reqPost("IGeneralInvoiceRequest", "SetProviderGLN", {
      pIGeneralInvoiceRequest: req,
      bstrGLN: input.providerGln,
      bstrGLNLocation: input.providerGlnLocation || input.providerGln,
      pIAddress: addr,
    });

    // --- SetProviderZSR (optional) ---
    if (input.providerZsr && isValidZsr(input.providerZsr)) {
      await setupAddress(addr, input.providerAddress);
      await reqPost("IGeneralInvoiceRequest", "SetProviderZSR", {
        pIGeneralInvoiceRequest: req,
        bstrZSR: input.providerZsr,
        pIAddress: addr,
      });
    } else if (input.providerZsr) {
      console.warn(`${LOG_PREFIX} Skipping SetProviderZSR — invalid ZSR format: '${input.providerZsr}'`);
    }

    // --- SetInsurance (required for TP, optional for TG) ---
    if (input.insuranceGln && input.insuranceAddress) {
      await setupAddress(addr, input.insuranceAddress);
      await reqPost("IGeneralInvoiceRequest", "SetInsurance", {
        pIGeneralInvoiceRequest: req,
        bstrGLN: input.insuranceGln,
        pIAddress: addr,
      });
    }

    // --- SetPatient ---
    await setupAddress(addr, input.patientAddress);
    await reqPost("IGeneralInvoiceRequest", "SetPatient", {
      pIGeneralInvoiceRequest: req,
      eSexType: input.patientSex,
      eGenderType: input.patientGender ?? (input.patientSex === SexType.Male ? GenderType.Male : GenderType.Female),
      dBirthdate: input.patientBirthdate,
      bstrSSN: input.patientSsn || "",
      pIAddress: addr,
    });

    // --- SetInsured (optional) ---
    if (input.insuredAddress) {
      await setupAddress(addr, input.insuredAddress);
      await reqPost("IGeneralInvoiceRequest", "SetInsured", {
        pIGeneralInvoiceRequest: req,
        bstrSSN: input.patientSsn || "",
        pIAddress: addr,
      });
    }

    // --- SetGuarantor (optional — auto-cloned from patient if omitted) ---
    // Per CHM: "a clone of the patient's address is automatically assigned as guarantor address
    // in the Finalize method should the SetGuarantor method not be called."
    // Since our guarantor is always the patient, we let Sumex auto-clone it (no GLN needed).
    // If we ever need a separate guarantor entity, uncomment and provide their real GLN:
    // if (input.guarantorAddress) {
    //   await setupAddress(addr, input.guarantorAddress);
    //   await reqPost("IGeneralInvoiceRequest", "SetGuarantor", {
    //     pIGeneralInvoiceRequest: req,
    //     bstrGLN: input.guarantorGln || "",
    //     bstrUID: input.guarantorUid || "",
    //     pIAddress: addr,
    //   });
    // }

    // --- SetDebitor (required for schema compliance) ---
    // For TP: debtor = insurance company. For TG: debtor = patient.
    // Sumex1 does NOT auto-assign this — we must always call SetDebitor.
    {
      const isTP = input.tiersMode === TiersMode.Payant;
      const useInsuranceAsDebitor = isTP && input.insuranceGln && input.insuranceAddress;
      const debAddr = input.debitorAddress
        || (useInsuranceAsDebitor ? input.insuranceAddress! : input.patientAddress);
      const debGln = useInsuranceAsDebitor ? input.insuranceGln! : "";
      await setupAddress(addr, debAddr);
      await reqPost("IGeneralInvoiceRequest", "SetDebitor", {
        pIGeneralInvoiceRequest: req,
        bstrGLN: debGln,
        pIAddress: addr,
      });
    }

    // --- SetTreatment ---
    const cantonCode = CantonCode[input.treatmentCanton.toUpperCase()] ?? 0;
    await reqPost("IGeneralInvoiceRequest", "SetTreatment", {
      pIGeneralInvoiceRequest: req,
      bstrAPID: input.apid || "",
      bstrACID: input.acid || "",
      dDateBegin: input.treatmentDateBegin,
      dDateEnd: input.treatmentDateEnd,
      eTreatmentCanton: cantonCode,
      eTreatmentType: input.treatmentType ?? TreatmentType.Ambulatory,
      eTreatmentReason: input.treatmentReason ?? TreatmentReason.Disease,
      dGestationWeek13: "0",
      dEndOfBirth: "0",
    });

    // --- AddDiagnosis ---
    if (input.diagnoses && input.diagnoses.length > 0) {
      for (const diag of input.diagnoses) {
        await reqPost("IGeneralInvoiceRequest", "AddDiagnosis", {
          pIGeneralInvoiceRequest: req,
          eDiagnosisType: diag.type,
          bstrCode: diag.code,
          bstrText: diag.text || "",
        });
      }
    }

    // --- AddPartner (optional) ---
    if (input.partners && input.partners.length > 0) {
      for (const partner of input.partners) {
        await setupAddress(addr, partner.address);
        await reqPost("IGeneralInvoiceRequest", "AddPartner", {
          pIGeneralInvoiceRequest: req,
          ePartnerType: partner.type,
          bstrZSR: partner.zsr || "",
          bstrGLN: partner.gln || "",
          bstrReferenceID: "",
          pIAddress: addr,
        });
      }
    }

    // --- AddService / AddServiceEx (auto-route based on tariff type) ---
    // TARDOC (tariff_code=7, tariffType="007") MUST use AddServiceEx; others use AddService
    if (input.services && input.services.length > 0) {
      const simpleServices = input.services.filter(s => s.tariffType !== "007");
      const tardocServices = input.services.filter(s => s.tariffType === "007");
      console.log(`${LOG_PREFIX} Services: ${input.services.length} total, ${simpleServices.length} simple, ${tardocServices.length} TARDOC. Types: [${input.services.map(s => s.tariffType).join(",")}]`);

      // Simple tariff services (ACF 005, drugs 402, other)
      for (const svc of simpleServices) {
        const addRes = await reqPost<{ plID: number; pbStatus: boolean }>(
          "IGeneralInvoiceRequest",
          "AddService",
          {
            pIGeneralInvoiceRequest: req,
            bstrTariffType: svc.tariffType,
            bstrCode: svc.code,
            bstrReferenceCode: svc.referenceCode || "",
            dQuantity: svc.quantity,
            lSessionNumber: svc.sessionNumber ?? 1,
            lGroupSize: svc.groupSize ?? 1,
            dDateBegin: svc.dateBegin,
            dDateEnd: svc.dateEnd || "0",
            bstrProviderGLN: svc.providerGln,
            bstrResponsibleGLN: svc.responsibleGln,
            eSide: svc.side ?? SideType.None,
            bstrServiceName: svc.serviceName || "",
            dUnit: svc.unit ?? 0,
            dUnitFactor: svc.unitFactor ?? 1,
            dExternalFactor: svc.externalFactor ?? 1,
            dAmount: svc.amount ?? 0,
            dVatRate: svc.vatRate ?? 0,
            bstrRemark: svc.remark || "",
            bstrSectionCode: svc.sectionCode || "",
            eIgnoreValidate: svc.ignoreValidate ?? YesNo.Yes,
            lServiceAttributes: svc.serviceAttributes ?? 0,
          },
        );
        if (!addRes.pbStatus) {
          const abortInfo = await getAbortInfo(mgr);
          console.warn(`${LOG_PREFIX} AddService ${svc.code} rejected: ${abortInfo}`);
        }
      }

      // TARDOC services auto-promoted to AddServiceEx
      if (tardocServices.length > 0) {
        const svcInputRes = await reqGet<{ pIServiceExInput: number }>(
          `IGeneralInvoiceRequest/GetCreateServiceExInput?pIGeneralInvoiceRequest=${req}&bstrTariffType=007`,
        );
        const svcInputHandle = svcInputRes.pIServiceExInput;

        // Initialize the IServiceExInput with physician, patient, treatment data
        await initServiceExInput(svcInputHandle, input);

        for (const svc of tardocServices) {
          // Sumex validates: dAmountMT = quantity × unitMT × unitFactorMT × internalScaling × externalScaling
          const unitMT = svc.unit ?? 0;
          const unitFactorMT = svc.unitFactor ?? 1;
          const extFactorMT = svc.externalFactor ?? 1;
          const computedAmountMT = Math.round(svc.quantity * unitMT * unitFactorMT * 1 * extFactorMT * 100) / 100;
          console.log(`${LOG_PREFIX} AddServiceEx ${svc.code}: qty=${svc.quantity} unitMT=${unitMT} factor=${unitFactorMT} ext=${extFactorMT} => amountMT=${computedAmountMT} (passed amount=${svc.amount})`);

          const addRes = await reqPost<{ plID: number; pbStatus: boolean }>(
            "IGeneralInvoiceRequest",
            "AddServiceEx",
            {
              pIGeneralInvoiceRequest: req,
              pIServiceExInput: svcInputHandle,
              bstrTariffType: svc.tariffType,
              bstrCode: svc.code,
              bstrReferenceCode: svc.referenceCode || "",
              dQuantity: svc.quantity,
              lSessionNumber: svc.sessionNumber ?? 1,
              lGroupSize: svc.groupSize ?? 1,
              dDateBegin: svc.dateBegin,
              dDateEnd: svc.dateEnd || "0",
              eSide: svc.side ?? SideType.None,
              bstrServiceName: svc.serviceName || "",
              dUnitMT: unitMT,
              dUnitFactorMT: unitFactorMT,
              dUnitInternalScalingFactorMT: 1,
              dUnitExternalScalingFactorMT: extFactorMT,
              dAmountMT: computedAmountMT,
              dUnitTT: 0,
              dUnitFactorTT: 1,
              dUnitInternalScalingFactorTT: 1,
              dUnitExternalScalingFactorTT: 1,
              dAmountTT: 0,
              dAmount: computedAmountMT,
              dVatRate: svc.vatRate ?? 0,
              bstrRemark: svc.remark || "",
              eIgnoreValidate: svc.ignoreValidate ?? YesNo.Yes,
              lServiceAttributes: svc.serviceAttributes ?? 0,
            },
          );
          if (!addRes.pbStatus) {
            const abortInfo = await getAbortInfo(mgr);
            console.warn(`${LOG_PREFIX} AddServiceEx (auto) ${svc.code} rejected: ${abortInfo}`);
          }
        }
      }
    }

    // --- AddServiceEx (extended tariff services — TARDOC) ---
    if (input.servicesEx && input.servicesEx.length > 0) {
      // Create ServiceExInput interface (GET property, not POST method)
      const svcInputRes = await reqGet<{ pIServiceExInput: number }>(
        `IGeneralInvoiceRequest/GetCreateServiceExInput?pIGeneralInvoiceRequest=${req}&bstrTariffType=${encodeURIComponent(input.servicesEx[0].tariffType)}`,
      );
      const svcInputHandle = svcInputRes.pIServiceExInput;

      // Initialize the IServiceExInput with physician, patient, treatment data
      await initServiceExInput(svcInputHandle, input);

      for (const svc of input.servicesEx) {
        const addRes = await reqPost<{ plID: number; pbStatus: boolean }>(
          "IGeneralInvoiceRequest",
          "AddServiceEx",
          {
            pIGeneralInvoiceRequest: req,
            pIServiceExInput: svcInputHandle,
            bstrTariffType: svc.tariffType,
            bstrCode: svc.code,
            bstrReferenceCode: svc.referenceCode || "",
            dQuantity: svc.quantity,
            lSessionNumber: svc.sessionNumber,
            lGroupSize: svc.groupSize ?? 1,
            dDateBegin: svc.dateBegin,
            dDateEnd: svc.dateEnd || "0",
            eSide: svc.side ?? SideType.None,
            bstrServiceName: svc.serviceName || "",
            dUnitMT: svc.unitMT ?? 0,
            dUnitFactorMT: svc.unitFactorMT ?? 1,
            dUnitInternalScalingFactorMT: 1,
            dUnitExternalScalingFactorMT: svc.externalFactorMT ?? 1,
            dAmountMT: svc.amountMT ?? 0,
            dUnitTT: svc.unitTT ?? 0,
            dUnitFactorTT: svc.unitFactorTT ?? 1,
            dUnitInternalScalingFactorTT: 1,
            dUnitExternalScalingFactorTT: svc.externalFactorTT ?? 1,
            dAmountTT: svc.amountTT ?? 0,
            dAmount: svc.amountAsymmetric ?? 0,
            dVatRate: svc.vatRate ?? 0,
            bstrRemark: svc.remark || "",
            eIgnoreValidate: svc.ignoreValidate ?? YesNo.Yes,
            lServiceAttributes: svc.serviceAttributes ?? 0,
          },
        );
        if (!addRes.pbStatus) {
          const abortInfo = await getAbortInfo(mgr);
          console.warn(`AddServiceEx ${svc.code} rejected: ${abortInfo}`);
        }
      }
    }

    // --- SetProcessing (print flags — per CHM: ePrintPatientInvoiceOnly, ePrintCopyToGuarantor, bstrTrustCenterGLN) ---
    try {
      await reqPost("IGeneralInvoiceRequest", "SetProcessing", {
        pIGeneralInvoiceRequest: req,
        ePrintPatientInvoiceOnly: input.printPatientInvoiceOnly ?? YesNo.No,
        ePrintCopyToGuarantor: input.printCopyToGuarantor ?? YesNo.No,
        bstrTrustCenterGLN: input.trustCenterGLN ?? "",
      });
    } catch (procErr) {
      console.warn(`${LOG_PREFIX} SetProcessing call failed (non-fatal):`, procErr instanceof Error ? procErr.message : procErr);
    }

    // --- SetTransport (required for XML generation) ---
    await reqPost("IGeneralInvoiceRequest", "SetTransport", {
      pIGeneralInvoiceRequest: req,
      bstrFromGLN: input.transportFrom || input.billerGln,
      bstrFromPFXFile: "",
      bstrFromPFXPassword: "",
      bstrViaGLN: input.transportViaGln || "",
      bstrToGLN: input.transportTo || input.insuranceGln || "",
      bstrToBinDERFile: "",
    });

    // --- Finalize ---
    const finalRes = await reqPost<{ pdRoundDifference: number; pbStatus: boolean }>(
      "IGeneralInvoiceRequest",
      "Finalize",
      { pIGeneralInvoiceRequest: req },
    );
    console.log(`${LOG_PREFIX} Finalize result: status=${finalRes.pbStatus}, roundDiff=${finalRes.pdRoundDifference}`);
    if (!finalRes.pbStatus) {
      const abortInfo = await getAbortInfo(mgr);
      return {
        success: false,
        error: "Finalize failed",
        abortInfo,
      };
    }
    // Check for warnings even after successful Finalize
    const postFinalizeAbort = await getAbortInfo(mgr);
    if (postFinalizeAbort) {
      console.warn(`${LOG_PREFIX} Post-Finalize warnings: ${postFinalizeAbort}`);
    }

    // --- GetXML ---
    // Use raw fetch with retry for GetXML — the Sumex1 server sometimes returns
    // empty body on first attempt (especially for TARDOC/extended services).
    const genAttrs = options?.generationAttributes ?? GenerationAttribute.None;
    const getXmlBody: Record<string, unknown> = {
      pIGeneralInvoiceRequestManager: mgr,
      lGenerationAttributes: genAttrs,
      plTimestamp: 0,
    };
    let xmlRes: {
      pbstrOutputFile: string;
      plValidationError: number;
      plTimestamp: number;
      pbstrUsedSchema: string;
      pIGeneralInvoiceResult: number;
      pbStatus: boolean;
    } = null as any; // assigned in loop or throws

    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`${LOG_PREFIX} POST IGeneralInvoiceRequestManager/GetXML (attempt ${attempt})`);
      const ctrl = new AbortController();
      const tmout = setTimeout(() => ctrl.abort(), 30_000); // Reduced from 90s to 30s
      try {
        const gxRes = await fetch(
          `${SUMEX_REQUEST_BASE_URL}/IGeneralInvoiceRequestManager/GetXML`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(getXmlBody),
            cache: "no-store",
            signal: ctrl.signal,
          },
        );
        const text = await gxRes.text();
        const hdrs = Object.fromEntries(gxRes.headers.entries());
        console.log(`${LOG_PREFIX} GetXML response: status=${gxRes.status}, bodyLen=${text.length}, headers=${JSON.stringify(hdrs)}`);

        if (!gxRes.ok) {
          let errObj: Record<string, unknown> = {};
          try { errObj = JSON.parse(text); } catch {}
          const abortCode = errObj.abortCode ?? "";
          const abortText = (errObj.pbstrAbort as string) || (errObj.errorText as string) || "";
          console.error(`${LOG_PREFIX} GetXML FAILED: code=${abortCode} ${abortText}`);
          throw new Error(`Sumex Request POST IGeneralInvoiceRequestManager/GetXML failed: [${abortCode}] ${abortText}`);
        }

        if (text.length === 0) {
          if (attempt < 2) {
            console.warn(`${LOG_PREFIX} GetXML returned empty body (status=${gxRes.status}) — retrying in 1s...`);
            await new Promise(r => setTimeout(r, 1000)); // Reduced from 2s to 1s
            continue;
          }
          throw new Error(`GetXML returned HTTP ${gxRes.status} with empty body after ${attempt + 1} attempts.`);
        }

        xmlRes = JSON.parse(text);
        break;
      } finally {
        clearTimeout(tmout);
      }
    }

    if (!xmlRes!.pbStatus) {
      const abortInfo = await getAbortInfo(mgr);
      console.error(`${LOG_PREFIX} GetXML FAILED: validationError=${xmlRes!.plValidationError}, abort=${abortInfo}`);
      return {
        success: false,
        error: "GetXML failed",
        abortInfo,
        validationError: xmlRes!.plValidationError,
      };
    }
    console.log(`${LOG_PREFIX} GetXML OK: file=${xmlRes!.pbstrOutputFile}, schema=${xmlRes!.pbstrUsedSchema}, validErr=${xmlRes!.plValidationError}`);

    // Read the generated XML file content from the server.
    // The server returns a path like "/serverName/files/uuid.xml" which is
    // directly accessible as a URL relative to the base.
    let xmlContent: string | undefined;
    if (xmlRes?.pbstrOutputFile) {
      try {
        // The output file path is relative to the server root (e.g. /generalInvoiceRequestManagerServer500/files/uuid.xml)
        const baseOrigin = new URL(SUMEX_REQUEST_BASE_URL).origin;
        const fileUrl = `${baseOrigin}${xmlRes.pbstrOutputFile}`;
        const fileRes = await fetch(fileUrl, { cache: "no-store" });
        if (fileRes.ok) {
          xmlContent = await fileRes.text();
        }
      } catch {
        // File download may not be available — caller can use the file path
      }
    }

    // Log key XML elements for debugging
    if (xmlContent) {
      const hasCopyToGuarantor = xmlContent.includes('print_copy_to_guarantor');
      const hasEmail = xmlContent.includes('<invoice:online');
      const hasPhone = xmlContent.includes('<invoice:phone');
      console.log(`${LOG_PREFIX} XML generated (${xmlContent.length} chars): print_copy_to_guarantor=${hasCopyToGuarantor}, email/online=${hasEmail}, phone=${hasPhone}`);
      // Log the processing and guarantor sections for inspection
      const processingMatch = xmlContent.match(/<invoice:processing[\s\S]*?<\/invoice:processing>/);
      if (processingMatch) console.log(`${LOG_PREFIX} XML <processing>: ${processingMatch[0].substring(0, 500)}`);
      const guarantorMatch = xmlContent.match(/<invoice:guarantor[\s\S]*?<\/invoice:guarantor>/);
      if (guarantorMatch) console.log(`${LOG_PREFIX} XML <guarantor>: ${guarantorMatch[0].substring(0, 500)}`);
    }

    const result: SumexBuildResult = {
      success: true,
      xmlFilePath: xmlRes.pbstrOutputFile,
      xmlContent,
      validationError: xmlRes.plValidationError,
      usedSchema: xmlRes.pbstrUsedSchema,
      timestamp: xmlRes.plTimestamp,
    };

    // --- Print / PDF (optional) ---
    if (options?.generatePdf) {
      console.log(`${LOG_PREFIX} Print/PDF generation requested`);
      try {
        const pdfTemplate = options.pdfPath
          ? `(PDF_NOPRINT=${options.pdfPath};)`
          : "";
        const printRes = await reqPost<{
          plTimestamp: number;
          pIGeneralInvoiceResult: number;
          pbStatus: boolean;
          pbstrPDFFile: string;
        }>(
          "IGeneralInvoiceRequestManager",
          "Print",
          {
            pIGeneralInvoiceRequestManager: mgr,
            bstrPrintTemplate: pdfTemplate,
            lGenerationAttributes: genAttrs,
            ePrintPreview: YesNo.No,
            eAddressRight: YesNo.Yes,
            plTimestamp: result.timestamp ?? 0,
          },
        );
        if (printRes.pbStatus && printRes.pbstrPDFFile) {
          result.pdfFilePath = printRes.pbstrPDFFile;
          console.log(`${LOG_PREFIX} Print OK: pdfFile=${printRes.pbstrPDFFile}`);
          // Download the PDF content from the server
          try {
            const baseOrigin = new URL(SUMEX_REQUEST_BASE_URL).origin;
            const pdfUrl = `${baseOrigin}${printRes.pbstrPDFFile}`;
            console.log(`${LOG_PREFIX} Downloading PDF from ${pdfUrl}`);
            const pdfRes = await fetch(pdfUrl, { cache: "no-store" });
            if (pdfRes.ok) {
              const arrayBuf = await pdfRes.arrayBuffer();
              result.pdfContent = Buffer.from(arrayBuf);
              console.log(`${LOG_PREFIX} PDF downloaded: ${result.pdfContent.length} bytes`);
            } else {
              console.warn(`${LOG_PREFIX} PDF download failed: ${pdfRes.status}`);
            }
          } catch (dlErr) {
            console.warn(`${LOG_PREFIX} PDF download error:`, dlErr);
          }
        } else {
          const abortInfo = await getAbortInfo(mgr);
          console.warn(`${LOG_PREFIX} Print FAILED: abort=${abortInfo}`);
        }
      } catch (e) {
        console.warn(`${LOG_PREFIX} Print/PDF generation failed:`, e);
      }
    }

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    let abortInfo = "";
    try { abortInfo = await getAbortInfo(mgr); } catch { /* ignore */ }
    return {
      success: false,
      error: errMsg,
      abortInfo: abortInfo || undefined,
    };
  } finally {
    // Clean up session
    await destroyRequestSession(session);
  }
}

// ---------------------------------------------------------------------------
// Load existing XML — for editing, copying, storno
// ---------------------------------------------------------------------------

export type LoadXMLResult = {
  success: boolean;
  resultHandle?: number;
  managerHandle?: number;
  error?: string;
};

/**
 * Load an existing generalInvoiceRequest XML into the manager for
 * re-processing (copy, storno, editing).
 */
export async function loadInvoiceRequestXML(
  xmlFilePath: string,
): Promise<LoadXMLResult> {
  const factory = await reqGet<{ pIGeneralInvoiceRequestManager: number }>(
    "IGeneralInvoiceRequestManager/GetCreateGeneralInvoiceRequestManager",
  );
  const mgrHandle = factory.pIGeneralInvoiceRequestManager;

  try {
    const loadRes = await reqGet<{
      pIGeneralInvoiceRequest: number;
      pIGeneralInvoiceResult: number;
      pbStatus: boolean;
    }>(
      `IGeneralInvoiceRequestManager/LoadXML?pIGeneralInvoiceRequestManager=${mgrHandle}&bstrInputFile=${encodeURIComponent(xmlFilePath)}`,
    );

    if (!loadRes.pbStatus) {
      const abortInfo = await getAbortInfo(mgrHandle);
      return { success: false, error: `LoadXML failed: ${abortInfo}` };
    }

    return {
      success: true,
      resultHandle: loadRes.pIGeneralInvoiceResult,
      managerHandle: mgrHandle,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Module Info
// ---------------------------------------------------------------------------

export async function getRequestManagerInfo(): Promise<{
  moduleVersion: number;
  moduleVersionText: string;
}> {
  const factory = await reqGet<{ pIGeneralInvoiceRequestManager: number }>(
    "IGeneralInvoiceRequestManager/GetCreateGeneralInvoiceRequestManager",
  );
  const h = factory.pIGeneralInvoiceRequestManager;

  const [version, versionText] = await Promise.all([
    reqGet<{ plModuleVersion: number }>(
      `IGeneralInvoiceRequestManager/GetModuleVersion?pIGeneralInvoiceRequestManager=${h}`,
    ).then(r => r.plModuleVersion).catch(() => 0),
    reqGet<{ pbstrModuleVersionText: string }>(
      `IGeneralInvoiceRequestManager/GetModuleVersionText?pIGeneralInvoiceRequestManager=${h}`,
    ).then(r => r.pbstrModuleVersionText).catch(() => "unknown"),
  ]);

  // Clean up
  // Server auto-cleans instances after 1 hour of inactivity.
  return { moduleVersion: version, moduleVersionText: versionText };
}

// =========================================================================
// RESPONSE MANAGER — Parse generalInvoiceResponse_500
// =========================================================================

export type ResponseNotification = {
  code: string;
  text: string;
  isError: boolean;
  recordId: number;
  errorValue: string;
  validValue: string;
};

export type ResponseBalance = {
  amount: number;
  amountReminder: number;
  amountDue: number;
  amountPaid: number;
  amountUnpaid: number;
  amountVat: number;
  currency: string;
  vatNumber: string;
  paymentPeriod: number;
};

export type ResponseInvoiceRef = {
  requestInvoiceId: string;
  requestInvoiceDate: string;
  requestInvoiceTimestamp: number;
};

export type ParsedInvoiceResponse = {
  success: boolean;
  // Response metadata
  dataLanguage?: number;
  requestType?: RequestType;
  requestSubtype?: RequestSubtype;
  responseType?: ResponseType;
  responseTimestamp?: number;
  guid?: string;
  modusType?: ModusType;

  // Invoice reference (mirrored from request)
  invoiceRef?: ResponseInvoiceRef;

  // Biller/Provider
  billerGln?: string;
  billerZsr?: string;
  providerGln?: string;
  providerZsr?: string;
  insuranceGln?: string;

  // Accept details
  acceptExplanation?: string;
  acceptStatusIn?: StatusType;
  acceptStatusOut?: StatusType;
  acceptHasServices?: boolean;
  acceptHasBalance?: boolean;
  acceptHasReimbursement?: boolean;

  // Reject details
  rejectExplanation?: string;
  rejectStatusIn?: StatusType;
  rejectStatusOut?: StatusType;
  rejectHasError?: boolean;

  // Pending details
  pendingExplanation?: string;
  pendingStatusIn?: StatusType;
  pendingStatusOut?: StatusType;
  pendingHasMessage?: boolean;

  // Balance (for accepted responses)
  balance?: ResponseBalance;

  // Notifications
  notifications?: ResponseNotification[];

  error?: string;
};

/**
 * Parse a generalInvoiceResponse_500 XML.
 *
 * @param xmlContent - The raw XML string of the response
 * @param fileName - Optional filename hint for the Sumex server
 */
export async function parseInvoiceResponse(
  xmlContent: string,
  fileName: string = "response.xml",
): Promise<ParsedInvoiceResponse> {
  // Create manager
  const factory = await resGet<{ pIGeneralInvoiceResponseManager: number }>(
    "IGeneralInvoiceResponseManager/GetCreateGeneralInvoiceResponseManager",
  );
  const mgrHandle = factory.pIGeneralInvoiceResponseManager;

  try {
    // LoadXML — POST with octet-stream body (per CHM docs)
    const loadParams = new URLSearchParams({
      pIGeneralInvoiceResponseManager: String(mgrHandle),
      bstrInputFile: fileName,
      bstrToPFXFile: "",
      bstrToPFXPassword: "",
    });
    const loadUrl = `${SUMEX_RESPONSE_BASE_URL}/IGeneralInvoiceResponseManager/LoadXML?${loadParams}`;
    console.log(`${LOG_PREFIX} Response LoadXML POST`);

    const xmlBytes = new TextEncoder().encode(xmlContent);
    const loadFetch = await fetch(loadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(xmlBytes.length),
      },
      body: xmlBytes,
      cache: "no-store",
    });

    if (!loadFetch.ok) {
      const errBody = await loadFetch.text().catch(() => "");
      return { success: false, error: `LoadXML POST failed: ${loadFetch.status} ${errBody}` };
    }

    const loadRes = (await loadFetch.json()) as {
      pIGeneralInvoiceResponse: number;
      pbStatus: boolean;
    };

    if (!loadRes.pbStatus) {
      const abortRes = await resPost<{ pbstrAbortInfo: string }>(
        "IGeneralInvoiceResponseManager",
        "GetAbortInfo",
        { pIGeneralInvoiceResponseManager: mgrHandle },
      ).catch(() => ({ pbstrAbortInfo: "Unknown error" }));
      return { success: false, error: `LoadXML failed: ${abortRes.pbstrAbortInfo}` };
    }

    const respHandle = loadRes.pIGeneralInvoiceResponse;

    // GetResponse
    const respData = await resPost<{
      peDataLanguage: number;
      peRequestType: number;
      peRequestSubtype: number;
      peResponseType: number;
      plResponseTimestamp: number;
      pbstrGUID: string;
      peModusType: number;
      pbStatus: boolean;
    }>(
      "IGeneralInvoiceResponse",
      "GetResponse",
      { pIGeneralInvoiceResponse: respHandle },
    );

    const result: ParsedInvoiceResponse = {
      success: true,
      dataLanguage: respData.peDataLanguage,
      requestType: respData.peRequestType as RequestType,
      requestSubtype: respData.peRequestSubtype as RequestSubtype,
      responseType: respData.peResponseType as ResponseType,
      responseTimestamp: respData.plResponseTimestamp,
      guid: respData.pbstrGUID,
      modusType: respData.peModusType as ModusType,
    };

    // GetInvoice
    try {
      const inv = await resPost<{
        pbstrRequestInvoiceID: string;
        pdRequestInvoiceDate: string;
        plRequestInvoiceTimestamp: number;
        pbStatus: boolean;
      }>(
        "IGeneralInvoiceResponse",
        "GetInvoice",
        { pIGeneralInvoiceResponse: respHandle },
      );
      if (inv.pbStatus) {
        result.invoiceRef = {
          requestInvoiceId: inv.pbstrRequestInvoiceID,
          requestInvoiceDate: inv.pdRequestInvoiceDate,
          requestInvoiceTimestamp: inv.plRequestInvoiceTimestamp,
        };
      }
    } catch { /* optional */ }

    // GetBillerGLN, GetProviderGLN, GetInsurance
    try {
      const biller = await resPost<{ pbstrGLN: string; pbStatus: boolean }>(
        "IGeneralInvoiceResponse", "GetBillerGLN", { pIGeneralInvoiceResponse: respHandle },
      );
      if (biller.pbStatus) result.billerGln = biller.pbstrGLN;
    } catch { /* optional */ }

    try {
      const billerZsr = await resPost<{ pbstrZSR: string; pbStatus: boolean }>(
        "IGeneralInvoiceResponse", "GetBillerZSR", { pIGeneralInvoiceResponse: respHandle },
      );
      if (billerZsr.pbStatus) result.billerZsr = billerZsr.pbstrZSR;
    } catch { /* optional */ }

    try {
      const provider = await resPost<{ pbstrGLN: string; pbStatus: boolean }>(
        "IGeneralInvoiceResponse", "GetProviderGLN", { pIGeneralInvoiceResponse: respHandle },
      );
      if (provider.pbStatus) result.providerGln = provider.pbstrGLN;
    } catch { /* optional */ }

    try {
      const ins = await resPost<{ pbstrGLN: string; pbStatus: boolean }>(
        "IGeneralInvoiceResponse", "GetInsurance", { pIGeneralInvoiceResponse: respHandle },
      );
      if (ins.pbStatus) result.insuranceGln = ins.pbstrGLN;
    } catch { /* optional */ }

    // Response type specific data
    const rType = result.responseType;

    if (rType === ResponseType.Accepted) {
      try {
        const accept = await resPost<{
          pbstrExplanation: string;
          peStatusIn: number;
          peStatusOut: number;
          peHasServices: number;
          peHasBalance: number;
          peHasReimbursement: number;
          peHasDocuments: number;
          pbStatus: boolean;
        }>(
          "IGeneralInvoiceResponse",
          "GetAcceptType",
          { pIGeneralInvoiceResponse: respHandle },
        );
        if (accept.pbStatus) {
          result.acceptExplanation = accept.pbstrExplanation;
          result.acceptStatusIn = accept.peStatusIn as StatusType;
          result.acceptStatusOut = accept.peStatusOut as StatusType;
          result.acceptHasServices = accept.peHasServices === YesNo.Yes;
          result.acceptHasBalance = accept.peHasBalance === YesNo.Yes;
          result.acceptHasReimbursement = accept.peHasReimbursement === YesNo.Yes;
        }
      } catch { /* optional */ }

      // GetBalance
      try {
        const bal = await resPost<{
          pdAmount: number;
          pdAmountReminder: number;
          pdAmountDue: number;
          pdAmountPaid: number;
          pdAmountUnpaid: number;
          pdAmountVat: number;
          pbstrCurrency: string;
          pbstrVatNumber: string;
          plPaymentPeriod: number;
          pbStatus: boolean;
        }>(
          "IGeneralInvoiceResponse",
          "GetBalance",
          { pIGeneralInvoiceResponse: respHandle },
        );
        if (bal.pbStatus) {
          result.balance = {
            amount: bal.pdAmount,
            amountReminder: bal.pdAmountReminder,
            amountDue: bal.pdAmountDue,
            amountPaid: bal.pdAmountPaid,
            amountUnpaid: bal.pdAmountUnpaid,
            amountVat: bal.pdAmountVat,
            currency: bal.pbstrCurrency,
            vatNumber: bal.pbstrVatNumber,
            paymentPeriod: bal.plPaymentPeriod,
          };
        }
      } catch { /* optional */ }
    }

    if (rType === ResponseType.Rejected) {
      try {
        const reject = await resPost<{
          pbstrExplanation: string;
          peStatusIn: number;
          peStatusOut: number;
          peHasError: number;
          peHasDocuments: number;
          pbStatus: boolean;
        }>(
          "IGeneralInvoiceResponse",
          "GetRejectType",
          { pIGeneralInvoiceResponse: respHandle },
        );
        if (reject.pbStatus) {
          result.rejectExplanation = reject.pbstrExplanation;
          result.rejectStatusIn = reject.peStatusIn as StatusType;
          result.rejectStatusOut = reject.peStatusOut as StatusType;
          result.rejectHasError = reject.peHasError === YesNo.Yes;
        }
      } catch { /* optional */ }
    }

    if (rType === ResponseType.Pending) {
      try {
        const pending = await resPost<{
          pbstrExplanation: string;
          peStatusIn: number;
          peStatusOut: number;
          peHasMessage: number;
          peHasDocuments: number;
          pbStatus: boolean;
        }>(
          "IGeneralInvoiceResponse",
          "GetPendingType",
          { pIGeneralInvoiceResponse: respHandle },
        );
        if (pending.pbStatus) {
          result.pendingExplanation = pending.pbstrExplanation;
          result.pendingStatusIn = pending.peStatusIn as StatusType;
          result.pendingStatusOut = pending.peStatusOut as StatusType;
          result.pendingHasMessage = pending.peHasMessage === YesNo.Yes;
        }
      } catch { /* optional */ }
    }

    // Notifications
    const notifications: ResponseNotification[] = [];
    try {
      const first = await resPost<{
        pbstrCode: string;
        pbstrText: string;
        peIsAnError: number;
        plRecordID: number;
        pbstrErrorValue: string;
        pbstrValidValue: string;
        pbStatus: boolean;
      }>(
        "IGeneralInvoiceResponse",
        "GetFirstNotification",
        { pIGeneralInvoiceResponse: respHandle },
      );
      if (first.pbStatus) {
        notifications.push({
          code: first.pbstrCode,
          text: first.pbstrText,
          isError: first.peIsAnError === YesNo.Yes,
          recordId: first.plRecordID,
          errorValue: first.pbstrErrorValue,
          validValue: first.pbstrValidValue,
        });

        let hasMore = true;
        while (hasMore) {
          try {
            const next = await resPost<{
              pbstrCode: string;
              pbstrText: string;
              peIsAnError: number;
              plRecordID: number;
              pbstrErrorValue: string;
              pbstrValidValue: string;
              pbStatus: boolean;
            }>(
              "IGeneralInvoiceResponse",
              "GetNextNotification",
              { pIGeneralInvoiceResponse: respHandle },
            );
            if (next.pbStatus) {
              notifications.push({
                code: next.pbstrCode,
                text: next.pbstrText,
                isError: next.peIsAnError === YesNo.Yes,
                recordId: next.plRecordID,
                errorValue: next.pbstrErrorValue,
                validValue: next.pbstrValidValue,
              });
            } else {
              hasMore = false;
            }
          } catch {
            hasMore = false;
          }
        }
      }
    } catch { /* no notifications */ }

    if (notifications.length > 0) {
      result.notifications = notifications;
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    // Server auto-cleans instances after 1 hour of inactivity.
  }
}

/**
 * Print/render a generalInvoiceResponse_500 XML as PDF via the Sumex1 response server.
 *
 * Per CHM docs, LoadXML is a **POST** with:
 *   - Query params: pIGeneralInvoiceResponseManager, bstrInputFile, bstrToPFXFile, bstrToPFXPassword
 *   - Body: application/octet-stream — the raw XML file content
 *   - Returns: {pIGeneralInvoiceResponse: long, pbStatus: bool}
 *
 * Print is POST with JSON body, returns {pbStatus, pbstrPDFFile}.
 *
 * @param xmlContent - The raw XML string of the response
 * @param fileName - Optional filename hint for the Sumex server
 * @returns PDF content as Buffer, or error
 */
export async function printInvoiceResponse(
  xmlContent: string,
  fileName: string = "response.xml",
): Promise<{ success: boolean; pdfContent?: Buffer; pdfFilePath?: string; error?: string }> {
  const factory = await resGet<{ pIGeneralInvoiceResponseManager: number }>(
    "IGeneralInvoiceResponseManager/GetCreateGeneralInvoiceResponseManager",
  );
  const mgrHandle = factory.pIGeneralInvoiceResponseManager;

  try {
    // LoadXML — POST with octet-stream body containing the XML content
    const loadParams = new URLSearchParams({
      pIGeneralInvoiceResponseManager: String(mgrHandle),
      bstrInputFile: fileName,
      bstrToPFXFile: "",
      bstrToPFXPassword: "",
    });
    const loadUrl = `${SUMEX_RESPONSE_BASE_URL}/IGeneralInvoiceResponseManager/LoadXML?${loadParams}`;
    console.log(`${LOG_PREFIX} Response LoadXML POST to ${loadUrl}`);

    const xmlBytes = new TextEncoder().encode(xmlContent);
    const loadFetch = await fetch(loadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(xmlBytes.length),
      },
      body: xmlBytes,
      cache: "no-store",
    });

    if (!loadFetch.ok) {
      const errBody = await loadFetch.text().catch(() => "");
      return { success: false, error: `LoadXML POST failed: ${loadFetch.status} ${errBody}` };
    }

    const loadRes = (await loadFetch.json()) as {
      pIGeneralInvoiceResponse: number;
      pbStatus: boolean;
    };

    if (!loadRes.pbStatus) {
      const abortRes = await resPost<{ pbstrAbortInfo: string }>(
        "IGeneralInvoiceResponseManager",
        "GetAbortInfo",
        { pIGeneralInvoiceResponseManager: mgrHandle },
      ).catch(() => ({ pbstrAbortInfo: "Unknown error" }));
      return { success: false, error: `LoadXML failed: ${abortRes.pbstrAbortInfo}` };
    }

    console.log(`${LOG_PREFIX} Response loaded, handle=${loadRes.pIGeneralInvoiceResponse}`);

    // Print — POST with JSON body, returns PDF file path
    const printRes = await resPost<{
      pbStatus: boolean;
      pbstrPDFFile: string;
    }>(
      "IGeneralInvoiceResponseManager",
      "Print",
      {
        pIGeneralInvoiceResponseManager: mgrHandle,
        bstrPrintTemplate: "",
        lGenerationAttributes: 0,
        ePrintPreview: 0, // enNo
      },
    );

    if (!printRes.pbStatus || !printRes.pbstrPDFFile) {
      const abortRes = await resPost<{ pbstrAbortInfo: string }>(
        "IGeneralInvoiceResponseManager",
        "GetAbortInfo",
        { pIGeneralInvoiceResponseManager: mgrHandle },
      ).catch(() => ({ pbstrAbortInfo: "Unknown error" }));
      return { success: false, error: `Print failed: ${abortRes.pbstrAbortInfo}` };
    }

    // Download the PDF content from the server
    const baseOrigin = new URL(SUMEX_RESPONSE_BASE_URL).origin;
    const pdfUrl = `${baseOrigin}${printRes.pbstrPDFFile}`;
    console.log(`${LOG_PREFIX} Response PDF: ${pdfUrl}`);
    const pdfRes = await fetch(pdfUrl, { cache: "no-store" });
    if (!pdfRes.ok) {
      return { success: false, error: `PDF download failed: ${pdfRes.status}` };
    }
    const arrayBuf = await pdfRes.arrayBuffer();
    return {
      success: true,
      pdfContent: Buffer.from(arrayBuf),
      pdfFilePath: printRes.pbstrPDFFile,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get response manager module info.
 */
export async function getResponseManagerInfo(): Promise<{
  moduleVersion: number;
  moduleVersionText: string;
}> {
  const factory = await resGet<{ pIGeneralInvoiceResponseManager: number }>(
    "IGeneralInvoiceResponseManager/GetCreateGeneralInvoiceResponseManager",
  );
  const h = factory.pIGeneralInvoiceResponseManager;

  const [version, versionText] = await Promise.all([
    resGet<{ plModuleVersion: number }>(
      `IGeneralInvoiceResponseManager/GetModuleVersion?pIGeneralInvoiceResponseManager=${h}`,
    ).then(r => r.plModuleVersion).catch(() => 0),
    resGet<{ pbstrModuleVersionText: string }>(
      `IGeneralInvoiceResponseManager/GetModuleVersionText?pIGeneralInvoiceResponseManager=${h}`,
    ).then(r => r.pbstrModuleVersionText).catch(() => "unknown"),
  ]);

  // Server auto-cleans instances after 1 hour of inactivity.
  return { moduleVersion: version, moduleVersionText: versionText };
}

// ---------------------------------------------------------------------------
// Helpers — map app data to SumexInvoiceInput
// ---------------------------------------------------------------------------

/** Map a Swiss law type string to the Sumex enum */
export function mapLawType(law: string): LawType {
  switch (law.toUpperCase()) {
    case "KVG": return LawType.KVG;
    case "UVG": return LawType.UVG;
    case "MVG": return LawType.MVG;
    case "IVG": return LawType.IVG;
    case "VVG": return LawType.VVG;
    default: return LawType.KVG;
  }
}

/** Map a billing type string to the Sumex TiersMode */
export function mapTiersMode(billing: string): TiersMode {
  switch (billing.toUpperCase()) {
    case "TG": return TiersMode.Garant;
    case "TP": return TiersMode.Payant;
    case "TS": return TiersMode.Soldant;
    default: return TiersMode.Garant;
  }
}

/** Map sex string to Sumex SexType */
export function mapSex(sex: string): SexType {
  return sex?.toLowerCase() === "female" ? SexType.Female : SexType.Male;
}
