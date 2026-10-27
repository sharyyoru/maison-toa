/**
 * Native generalInvoiceRequest_500 XML generator.
 *
 * Produces the same XML the Sumex1 GeneralInvoiceRequestManager500 server used
 * to emit, without needing the external REST server. Verified against real
 * production output stored in medidata_submissions.xml_content.
 *
 * Trade-off vs the Sumex toolkit: no certified schema validation and no
 * official print template — the app already generates patient PDFs locally as
 * fallback, and TarDoc/ACF validation degrade gracefully when the server is
 * unreachable.
 */

import {
  BillingRoleType,
  CantonCode,
  DiagnosisType,
  GenderType,
  LawType,
  MedicalRoleType,
  ModusType,
  PlaceType,
  RequestSubtype,
  RequestType,
  RoleType,
  SexType,
  SideType,
  TiersMode,
  TreatmentReason,
  TreatmentType,
  type InvoiceAddress,
  type InvoiceServiceExInput,
  type InvoiceServiceInput,
  type SumexInvoiceInput,
} from "./sumexInvoice";

// ---------------------------------------------------------------------------
// Enum -> XML attribute string mappings (per generalInvoiceRequest_500.xsd)
// ---------------------------------------------------------------------------

const ROLE_MAP: Record<number, string> = {
  [RoleType.Physician]: "physician",
  [RoleType.Physiotherapist]: "physiotherapist",
  [RoleType.Chiropractor]: "chiropractor",
  [RoleType.Ergotherapist]: "ergotherapist",
  [RoleType.Nutritionist]: "nutritionist",
  [RoleType.Midwife]: "midwife",
  [RoleType.Logotherapist]: "logotherapist",
  [RoleType.Hospital]: "hospital",
  [RoleType.RehabClinic]: "rehab_clinic",
  [RoleType.PsychiatricClinic]: "psychiatric_clinic",
  [RoleType.Pharmacist]: "pharmacist",
  [RoleType.Dentist]: "dentist",
  [RoleType.LabTechnician]: "lab_technician",
  [RoleType.DentalTechnician]: "dental_technician",
  [RoleType.OtherTechnician]: "other_technician",
  [RoleType.Psychologist]: "psychologist",
  [RoleType.Wholesaler]: "wholesaler",
  [RoleType.NursingStaff]: "nursing_staff",
  [RoleType.Transport]: "transport",
  [RoleType.Druggist]: "druggist",
  [RoleType.NaturopathicDoctor]: "naturopathic_doctor",
  [RoleType.NaturopathicTherapist]: "naturopathic_therapist",
  [RoleType.Other]: "other",
};

const PLACE_MAP: Record<number, string> = {
  [PlaceType.Practice]: "practice",
  [PlaceType.Hospital]: "hospital",
  [PlaceType.Lab]: "lab",
  [PlaceType.Association]: "association",
  [PlaceType.Company]: "company",
};

const LAW_MAP: Record<number, string> = {
  [LawType.KVG]: "KVG",
  [LawType.UVG]: "UVG",
  [LawType.MVG]: "MVG",
  [LawType.IVG]: "IVG",
  [LawType.VVG]: "VVG",
};

const REASON_MAP: Record<number, string> = {
  [TreatmentReason.Disease]: "disease",
  [TreatmentReason.Accident]: "accident",
  [TreatmentReason.Maternity]: "maternity",
  [TreatmentReason.Prevention]: "prevention",
  [TreatmentReason.BirthDefect]: "birth_defect",
  [TreatmentReason.Unknown]: "unknown",
};

const TREATMENT_TYPE_MAP: Record<number, string> = {
  [TreatmentType.Ambulatory]: "ambulatory",
  [TreatmentType.Stationary]: "stationary",
};

const SIDE_MAP: Record<number, string> = {
  [SideType.None]: "none",
  [SideType.Left]: "left",
  [SideType.Right]: "right",
  [SideType.Both]: "both",
};

const BILLING_ROLE_MAP: Record<number, string> = {
  [BillingRoleType.Both]: "both",
  [BillingRoleType.MT]: "mt",
  [BillingRoleType.TT]: "tt",
  [BillingRoleType.None]: "none",
};

const MEDICAL_ROLE_MAP: Record<number, string> = {
  [MedicalRoleType.SelfEmployed]: "self_employed",
  [MedicalRoleType.Employee]: "employee",
};

const DIAGNOSIS_MAP: Record<number, string> = {
  [DiagnosisType.ICD]: "ICD",
  [DiagnosisType.Cantonal]: "cantonal",
  [DiagnosisType.ByContract]: "by_contract",
  [DiagnosisType.FreeText]: "freetext",
  [DiagnosisType.BirthDefect]: "birthdefect",
  [DiagnosisType.ICPC]: "ICPC",
  [DiagnosisType.DRG]: "DRG",
};

const REQUEST_TYPE_MAP: Record<number, string> = {
  [RequestType.Invoice]: "invoice",
  [RequestType.Reminder]: "reminder",
};

const SUBTYPE_MAP: Record<number, string> = {
  [RequestSubtype.Normal]: "normal",
  [RequestSubtype.Copy]: "copy",
  [RequestSubtype.Refund]: "refund",
  [RequestSubtype.Storno]: "storno",
};

const CANTON_NAME: Record<string, string> = Object.fromEntries(
  Object.keys(CantonCode).map((k) => [k, k]),
);

const PARTNER_TYPE_MAP: Record<number, string> = {
  1: "employer",
  2: "referrer",
  3: "service_provider",
  4: "primary_clinician",
  5: "lead_doctor",
  6: "assistant_physician",
  7: "senior_physician",
  8: "chief_physician",
  9: "surgeon",
  10: "anaesthetist",
  11: "consultant_doctor",
  12: "internist",
  13: "co_care",
  14: "radiologist",
  15: "nuclear_medicine",
  16: "other",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(value: string | number | null | undefined): string {
  // Control characters are stripped before escaping. A CSV import with Windows
  // line endings left a trailing CR on 205 of 772 `services.code` values and
  // 4,725 `invoice_line_items.code` values, e.g. "2130\r". Written raw into an
  // attribute, XML attribute-value normalisation turns that CR into a space,
  // so the insurer receives the tariff code "2130 " instead of "2130". Doing
  // this here covers every value in the document rather than relying on each
  // call site, and on the data staying clean.
  const s = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r/g, "")
    .trim();
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Round to the Swiss 0.05 rappen grid — matches the manager's amount_due. */
function round5(n: number): string {
  return (Math.round(n * 20) / 20).toFixed(2);
}

/** "2026-10-08" or ISO datetime -> "2026-10-08" */
function toDate(v: string): string {
  if (!v) return "";
  return v.length > 10 ? v.slice(0, 10) : v;
}

/** Ensure a datetime value ("2026-10-08" -> "2026-10-08T00:00:00"). */
function toDateTime(v: string): string {
  if (!v) return "";
  return v.includes("T") ? v : `${v}T00:00:00`;
}

function unixSeconds(v: string): number {
  const t = Date.parse(v);
  return Number.isNaN(t) ? Math.floor(Date.now() / 1000) : Math.floor(t / 1000);
}

function guid32(): string {
  const chars = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

function sexAttr(sex: SexType | undefined): string {
  return sex === SexType.Male ? "male" : "female";
}

function genderAttr(gender: GenderType | undefined, sex: SexType): string {
  if (gender === GenderType.Diverse) return "other";
  if (gender === GenderType.Male) return "male";
  if (gender === GenderType.Female) return "female";
  return sexAttr(sex);
}

// ---------------------------------------------------------------------------
// Address serialization
// ---------------------------------------------------------------------------

function postalXml(addr: InvoiceAddress): string {
  const street = (addr.street || "").trim();
  // Split trailing house number out of the street (e.g. "chemin Rieu 18").
  const m = street.match(/^(.*?)[\s,]+(\d+[a-zA-Z\-/]*)$/);
  const streetName = m ? m[1].trim() : street;
  const houseNo = m ? m[2] : "";
  return (
    `<invoice:postal>` +
    (street
      ? `<invoice:street street_name="${esc(streetName)}"${houseNo ? ` house_no="${esc(houseNo)}"` : ""}>${esc(street)}</invoice:street>`
      : "") +
    `<invoice:zip${addr.stateCode ? ` state_code="${esc(addr.stateCode)}"` : ""}>${esc(addr.zip)}</invoice:zip>` +
    `<invoice:city>${esc(addr.city)}</invoice:city>` +
    `</invoice:postal>`
  );
}

function contactXml(addr: InvoiceAddress): string {
  let s = "";
  if (addr.phone) {
    s += `<invoice:telecom><invoice:phone>${esc(addr.phone)}</invoice:phone></invoice:telecom>`;
  }
  if (addr.email) {
    s += `<invoice:online><invoice:email>${esc(addr.email)}</invoice:email></invoice:online>`;
  }
  return s;
}

/** Person or company address block — matches the manager's output. */
function addressXml(addr: InvoiceAddress): string {
  if (addr.companyName) {
    return (
      `<invoice:company>` +
      `<invoice:companyname>${esc(addr.companyName)}</invoice:companyname>` +
      (addr.department ? `<invoice:department>${esc(addr.department)}</invoice:department>` : "") +
      postalXml(addr) +
      contactXml(addr) +
      `</invoice:company>`
    );
  }
  return (
    `<invoice:person${addr.salutation ? ` salutation="${esc(addr.salutation)}"` : ""}${addr.title ? ` title="${esc(addr.title)}"` : ""}>` +
    `<invoice:familyname>${esc(addr.familyName || "")}</invoice:familyname>` +
    `<invoice:givenname>${esc(addr.givenName || " ")}</invoice:givenname>` +
    (addr.subaddressing ? `<invoice:subaddressing>${esc(addr.subaddressing)}</invoice:subaddressing>` : "") +
    postalXml(addr) +
    contactXml(addr) +
    `</invoice:person>`
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

type RenderedService = { xml: string; amount: number; vatAmount: number; vatRate: number };

function renderSimpleService(svc: InvoiceServiceInput, recordId: number, input: SumexInvoiceInput): RenderedService {
  const unit = svc.unit ?? 0;
  const unitFactor = svc.unitFactor ?? 1;
  const extFactor = svc.externalFactor ?? 1;
  const amount = svc.amount ?? Math.round(svc.quantity * unit * unitFactor * extFactor * 100) / 100;
  const vatRate = svc.vatRate ?? 0;
  const vatAmount = Math.round(amount * (vatRate / 100) * 100) / 100;
  const xml =
    `<invoice:service record_id="${recordId}" tariff_type="${esc(svc.tariffType)}" code="${esc(svc.code)}"` +
    (svc.referenceCode ? ` reference_code="${esc(svc.referenceCode)}"` : "") +
    ` quantity="${svc.quantity}" session="${svc.sessionNumber ?? 1}"` +
    ` date_begin="${toDateTime(svc.dateBegin)}"` +
    (svc.dateEnd ? ` date_end="${toDateTime(svc.dateEnd)}"` : "") +
    ` provider_id="${esc(svc.providerGln)}" responsible_id="${esc(svc.responsibleGln)}"` +
    ` billing_role="${BILLING_ROLE_MAP[BillingRoleType.Both]}"` +
    ` medical_role="${MEDICAL_ROLE_MAP[MedicalRoleType.SelfEmployed]}"` +
    ` body_location="${SIDE_MAP[svc.side ?? SideType.None]}"` +
    ` unit="${unit}" unit_factor="${unitFactor}" scale_factor="${extFactor}"` +
    ` amount="${fmt2(amount)}"` +
    (vatRate ? ` vat_rate="${vatRate}"` : "") +
    ` service_attributes="${svc.serviceAttributes ?? 0}"` +
    ` name="${esc(svc.serviceName || `${svc.code}`)}"` +
    (svc.remark ? ` remark="${esc(svc.remark)}"` : "") +
    `/>`;
  return { xml, amount, vatAmount, vatRate };
}

function renderExService(svc: InvoiceServiceInput, recordId: number): RenderedService {
  const unitMT = svc.unit ?? 0;
  const unitFactorMT = svc.unitFactor ?? 1;
  const extMT = svc.externalFactor ?? 1;
  const amountMT = Math.round(svc.quantity * unitMT * unitFactorMT * extMT * 100) / 100;
  const unitTT = svc.unitTT ?? 0;
  const unitFactorTT = svc.unitFactorTT ?? 1;
  const extTT = svc.externalFactorTT ?? 1;
  const amountTT = Math.round(svc.quantity * unitTT * unitFactorTT * extTT * 100) / 100;
  const amount = svc.amount ?? Math.round((amountMT + amountTT) * 100) / 100;
  const vatRate = svc.vatRate ?? 0;
  const vatAmount = Math.round(amount * (vatRate / 100) * 100) / 100;
  const xml =
    `<invoice:service_ex record_id="${recordId}" tariff_type="${esc(svc.tariffType)}" code="${esc(svc.code)}"` +
    (svc.referenceCode ? ` reference_code="${esc(svc.referenceCode)}"` : "") +
    ` quantity="${svc.quantity}" session="${svc.sessionNumber ?? 1}"` +
    ` date_begin="${toDateTime(svc.dateBegin)}"` +
    (svc.dateEnd ? ` date_end="${toDateTime(svc.dateEnd)}"` : "") +
    ` provider_id="${esc(svc.providerGln)}" responsible_id="${esc(svc.responsibleGln)}"` +
    ` billing_role="${BILLING_ROLE_MAP[BillingRoleType.Both]}"` +
    ` medical_role="${MEDICAL_ROLE_MAP[MedicalRoleType.SelfEmployed]}"` +
    ` body_location="${SIDE_MAP[svc.side ?? SideType.None]}"` +
    ` unit_mt="${unitMT}" unit_factor_mt="${unitFactorMT}" scale_factor_mt="${extMT}" amount_mt="${fmt2(amountMT)}"` +
    ` unit_tt="${unitTT}" unit_factor_tt="${unitFactorTT}" scale_factor_tt="${extTT}" amount_tt="${fmt2(amountTT)}"` +
    ` amount="${fmt2(amount)}"` +
    (vatRate ? ` vat_rate="${vatRate}"` : "") +
    ` service_attributes="${svc.serviceAttributes ?? 0}"` +
    ` name="${esc(svc.serviceName || svc.code)}"` +
    (svc.remark ? ` remark="${esc(svc.remark)}"` : "") +
    `/>`;
  return { xml, amount, vatAmount, vatRate };
}

function renderExInputService(svc: InvoiceServiceExInput, recordId: number): RenderedService {
  const amountMT = svc.amountMT ?? 0;
  const amountTT = svc.amountTT ?? 0;
  const amount = svc.amountAsymmetric ?? Math.round((amountMT + amountTT) * 100) / 100;
  const vatRate = svc.vatRate ?? 0;
  const vatAmount = Math.round(amount * (vatRate / 100) * 100) / 100;
  const xml =
    `<invoice:service_ex record_id="${recordId}" tariff_type="${esc(svc.tariffType)}" code="${esc(svc.code)}"` +
    (svc.referenceCode ? ` reference_code="${esc(svc.referenceCode)}"` : "") +
    ` quantity="${svc.quantity}" session="${svc.sessionNumber}"` +
    ` date_begin="${toDateTime(svc.dateBegin)}"` +
    (svc.dateEnd ? ` date_end="${toDateTime(svc.dateEnd)}"` : "") +
    ` provider_id="" responsible_id=""` +
    ` billing_role="${BILLING_ROLE_MAP[BillingRoleType.Both]}"` +
    ` medical_role="${MEDICAL_ROLE_MAP[MedicalRoleType.SelfEmployed]}"` +
    ` body_location="${SIDE_MAP[svc.side ?? SideType.None]}"` +
    ` unit_mt="${svc.unitMT ?? 0}" unit_factor_mt="${svc.unitFactorMT ?? 1}" scale_factor_mt="${svc.externalFactorMT ?? 1}" amount_mt="${fmt2(amountMT)}"` +
    ` unit_tt="${svc.unitTT ?? 0}" unit_factor_tt="${svc.unitFactorTT ?? 1}" scale_factor_tt="${svc.externalFactorTT ?? 1}" amount_tt="${fmt2(amountTT)}"` +
    ` amount="${fmt2(amount)}"` +
    (vatRate ? ` vat_rate="${vatRate}"` : "") +
    ` service_attributes="${svc.serviceAttributes ?? 0}"` +
    ` name="${esc(svc.serviceName || svc.code)}"` +
    (svc.remark ? ` remark="${esc(svc.remark)}"` : "") +
    `/>`;
  return { xml, amount, vatAmount, vatRate };
}

// ---------------------------------------------------------------------------
// ESR/QR reference — same algorithm the server path used
// ---------------------------------------------------------------------------

export function generateEsrReference(invoiceId: string): string {
  let numericPart = invoiceId.replace(/\D/g, "");
  if (numericPart.length === 0) {
    let hash = "";
    for (let i = 0; i < invoiceId.length; i++) {
      hash += invoiceId.charCodeAt(i).toString().padStart(3, "0");
    }
    numericPart = hash;
  }
  const padded = numericPart.length > 26 ? numericPart.slice(-26) : numericPart.padStart(26, "0");
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const ch of padded) carry = table[(carry + parseInt(ch, 10)) % 10];
  return padded + ((10 - carry) % 10).toString();
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export type NativeInvoiceXmlResult = {
  xmlContent: string;
  timestamp: number;
  guid: string;
  totalAmount: number;
  servicesCount: number;
};

export function generateInvoiceXml(input: SumexInvoiceInput): NativeInvoiceXmlResult {
  const isTP = input.tiersMode === TiersMode.Payant;
  const lang = { 1: "de", 2: "fr", 3: "it" }[input.language ?? 2] || "fr";
  const modus = input.modus === ModusType.Test ? "test" : "production";
  const guid = guid32();
  const timestamp = input.invoiceTimestamp && input.invoiceTimestamp > 0
    ? input.invoiceTimestamp
    : unixSeconds(input.invoiceDate);

  // --- Services ---
  const rendered: RenderedService[] = [];
  let recordId = 1;
  for (const svc of input.services || []) {
    const isExtended = svc.tariffType === "007" || svc.tariffType === "001";
    rendered.push(isExtended ? renderExService(svc, recordId) : renderSimpleService(svc, recordId, input));
    recordId++;
  }
  for (const svc of input.servicesEx || []) {
    rendered.push(renderExInputService(svc, recordId));
    recordId++;
  }
  const totalAmount = Math.round(rendered.reduce((sum, r) => sum + r.amount, 0) * 100) / 100;
  const vatTotal = Math.round(rendered.reduce((sum, r) => sum + r.vatAmount, 0) * 100) / 100;
  const prepaid = input.amountPrepaid ?? 0;
  const amountDue = Math.round((totalAmount - prepaid) * 100) / 100;

  // --- Tiers block ---
  const tiersTag =
    input.tiersMode === TiersMode.Payant
      ? "tiers_payant"
      : input.tiersMode === TiersMode.Soldant
        ? "tiers_soldant"
        : "tiers_garant";

  const billers =
    `<invoice:billers>` +
    `<invoice:biller_gln gln="${esc(input.billerGln)}">${addressXml(input.billerAddress)}</invoice:biller_gln>` +
    (input.billerZsr
      ? `<invoice:biller_zsr zsr="${esc(input.billerZsr)}">${addressXml(input.billerAddress)}</invoice:biller_zsr>`
      : "") +
    `</invoice:billers>`;

  const useInsuranceAsDebitor = isTP && input.insuranceGln && input.insuranceAddress;
  const debAddr = input.debitorAddress || (useInsuranceAsDebitor ? input.insuranceAddress! : input.patientAddress);
  const debGln = useInsuranceAsDebitor ? input.insuranceGln! : "";
  const debitor = `<invoice:debitor${debGln ? ` gln="${esc(debGln)}"` : ""}>${addressXml(debAddr)}</invoice:debitor>`;

  const providers =
    `<invoice:providers>` +
    `<invoice:provider_gln gln="${esc(input.providerGln)}" gln_location="${esc(input.providerGlnLocation || input.providerGln)}">${addressXml(input.providerAddress)}</invoice:provider_gln>` +
    (input.providerZsr
      ? `<invoice:provider_zsr zsr="${esc(input.providerZsr)}">${addressXml(input.providerAddress)}</invoice:provider_zsr>`
      : "") +
    `</invoice:providers>`;

  const insurance = input.insuranceGln && input.insuranceAddress
    ? `<invoice:insurance gln="${esc(input.insuranceGln)}">${addressXml(input.insuranceAddress)}</invoice:insurance>`
    : "";

  const guarantorAddr = input.guarantorAddress || input.patientAddress;
  const patientSex = input.patientSex;
  const patient =
    `<invoice:patient gender="${genderAttr(input.patientGender, patientSex)}" sex="${sexAttr(patientSex)}"` +
    ` birthdate="${toDate(input.patientBirthdate)}"` +
    (input.patientSsn ? ` ssn="${esc(input.patientSsn)}"` : "") +
    `>${addressXml(input.patientAddress)}</invoice:patient>`;
  const insured = input.insuredAddress
    ? `<invoice:insured${input.patientSsn ? ` ssn="${esc(input.patientSsn)}"` : ""}>${addressXml(input.insuredAddress)}</invoice:insured>`
    : "";
  const guarantor = `<invoice:guarantor>${addressXml(guarantorAddr)}</invoice:guarantor>`;

  const partners =
    input.partners && input.partners.length > 0
      ? `<invoice:partners>` +
        input.partners
          .map(
            (p) =>
              `<invoice:partner type="${PARTNER_TYPE_MAP[p.type] || "other"}"${p.gln ? ` gln="${esc(p.gln)}"` : ""}${p.zsr ? ` zsr="${esc(p.zsr)}"` : ""}>${addressXml(p.address)}</invoice:partner>`,
          )
          .join("") +
        `</invoice:partners>`
      : "";

  const balance =
    `<invoice:balance currency="CHF" amount="${fmt2(totalAmount)}"` +
    (prepaid > 0 ? ` amount_prepaid="${fmt2(prepaid)}"` : "") +
    ` amount_due="${round5(amountDue)}">` +
    `<invoice:vat vat="${fmt2(vatTotal)}"><invoice:vat_rate vat="${fmt2(vatTotal)}" vat_rate="0" amount="${fmt2(totalAmount)}"/></invoice:vat>` +
    `</invoice:balance>`;

  const tiersXml =
    `<invoice:${tiersTag} allowModification="0">` +
    billers + debitor + providers + insurance + patient + insured + guarantor + partners + balance +
    `</invoice:${tiersTag}>`;

  // --- esrQR ---
  const esrRef = input.esrReference || generateEsrReference(input.invoiceId);
  const esrXml = input.iban
    ? `<invoice:esrQR iban="${esc(input.iban.replace(/\s+/g, ""))}" subtype="esrQR" reference_number="${esc(esrRef)}" payment_period="P${input.paymentPeriod ?? 30}D">` +
      `<invoice:creditor>${addressXml(input.billerAddress)}</invoice:creditor>` +
      `</invoice:esrQR>`
    : "";

  // --- Law ---
  const lawXml = `<invoice:law type="${LAW_MAP[input.lawType] || "VVG"}"` +
    (input.caseDate ? ` case_date="${toDate(input.caseDate)}"` : "") +
    (input.caseId ? ` case_id="${esc(input.caseId)}"` : "") +
    (input.insuredId ? ` insured_id="${esc(input.insuredId)}"` : "") +
    `/>`;

  // --- Treatment ---
  // treatmentCanton drives the tariff/tax-point context on the claim, so it is
  // not safe to invent a default here. Fail with a message that names the
  // problem instead of throwing "Cannot read properties of undefined", which
  // is what an unguarded dereference produced.
  if (!input.treatmentCanton) {
    throw new Error(
      "treatmentCanton is required to generate invoice XML (it determines the tariff context). "
      + `Invoice ${input.invoiceId}: set the treatment canton on the invoice or the billing entity.`,
    );
  }
  const canton = CANTON_NAME[input.treatmentCanton.toUpperCase()] || input.treatmentCanton.toUpperCase();
  const treatmentXml =
    `<invoice:treatment date_begin="${toDate(input.treatmentDateBegin)}" date_end="${toDate(input.treatmentDateEnd || input.treatmentDateBegin)}"` +
    ` canton="${esc(canton)}" reason="${REASON_MAP[input.treatmentReason ?? TreatmentReason.Disease]}"` +
    (input.treatmentType !== undefined && input.treatmentType !== TreatmentType.Ambulatory
      ? ` type="${TREATMENT_TYPE_MAP[input.treatmentType]}"` : "") +
    (input.apid ? ` apid="${esc(input.apid)}"` : "") +
    (input.acid ? ` acid="${esc(input.acid)}"` : "") +
    `/>`;

  // --- Diagnoses ---
  const diagnosisXml = (input.diagnoses || [])
    .map(
      (d) =>
        `<invoice:diagnosis type="${DIAGNOSIS_MAP[d.type] || "freetext"}"${d.code ? ` code="${esc(d.code)}"` : ""}${d.text ? ` value="${esc(d.text)}"` : ""}/>`,
    )
    .join("");

  // --- Services ---
  const servicesXml =
    rendered.length > 0
      ? `<invoice:services>${rendered.map((r) => r.xml).join("")}</invoice:services>`
      : `<invoice:services/>`;

  // --- Credit / reminder ---
  const creditXml = input.creditId
    ? `<invoice:credit request_timestamp="${input.creditTimestamp ?? timestamp}" request_date="${toDateTime(input.creditDate || input.invoiceDate)}" request_id="${esc(input.creditId)}"/>`
    : "";
  const reminderXml = input.reminderLevel && input.reminderLevel > 0
    ? `<invoice:reminder request_timestamp="${input.reminderTimestamp ?? timestamp}" request_date="${toDateTime(input.reminderDate || input.invoiceDate)}" request_id="${esc(input.invoiceId)}" reminder_level="${input.reminderLevel}" reminder_text="${esc(input.reminderText || `Rappel niveau ${input.reminderLevel}`)}"${input.reminderAmount ? ` amount="${fmt2(input.reminderAmount)}"` : ""}/>`
    : "";

  const requestType = REQUEST_TYPE_MAP[input.requestType ?? RequestType.Invoice];
  const invoiceRefXml = input.requestType === RequestType.Reminder
    ? reminderXml || `<invoice:reminder request_timestamp="${timestamp}" request_date="${toDateTime(input.invoiceDate)}" request_id="${esc(input.invoiceId)}" reminder_level="${input.reminderLevel ?? 1}"/>`
    : `<invoice:invoice request_timestamp="${timestamp}" request_date="${toDateTime(input.invoiceDate)}" request_id="${esc(input.invoiceId)}"/>`;

  // --- Transport / processing ---
  const transportFrom = input.transportFrom || input.billerGln;
  const transportTo = input.transportTo || input.insuranceGln || "";
  const viaXml = input.transportViaGln
    ? `<invoice:via via="${esc(input.transportViaGln)}" sequence_id="1"/>`
    : "";
  const processing =
    `<invoice:processing${(input.printCopyToGuarantor ?? 0) ? ` print_copy_to_guarantor="1"` : ""}>` +
    `<invoice:transport from="${esc(transportFrom)}" to="${esc(transportTo)}">${viaXml}</invoice:transport>` +
    `</invoice:processing>`;

  const remarkXml = input.remark ? `<invoice:remark>${esc(input.remark)}</invoice:remark>` : "";

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>` +
    `<invoice:request xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xenc="http://www.w3.org/2001/04/xmlenc#" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:invoice="http://www.forum-datenaustausch.ch/invoice" xsi:schemaLocation="http://www.forum-datenaustausch.ch/invoice generalInvoiceRequest_500.xsd" xmlns="http://www.forum-datenaustausch.ch/invoice" language="${lang}" modus="${modus}" guid="${guid}" validation_status="0">` +
    processing +
    `<invoice:payload request_type="${requestType}" request_subtype="${SUBTYPE_MAP[input.requestSubtype ?? RequestSubtype.Normal]}">` +
    invoiceRefXml +
    creditXml +
    `<invoice:body role="${ROLE_MAP[input.roleType] || "physician"}" place="${PLACE_MAP[input.placeType] || "practice"}">` +
    `<invoice:prolog>` +
    `<invoice:package name="${esc(input.softwarePackage || "AestheticsClinic")}" copyright="${esc(input.softwareCopyright || "Aesthetics Clinic XT SA")}" version="${input.softwareVersion || 100}"/>` +
    `<invoice:generator name="AestheticsClinic Native XML" copyright="Aesthetics Clinic XT SA" version="100"/>` +
    `</invoice:prolog>` +
    tiersXml +
    esrXml +
    lawXml +
    treatmentXml +
    diagnosisXml +
    servicesXml +
    remarkXml +
    `</invoice:body>` +
    `</invoice:payload>` +
    `</invoice:request>`;

  return { xmlContent: xml, timestamp, guid, totalAmount, servicesCount: rendered.length };
}

// ---------------------------------------------------------------------------
// Native generalInvoiceResponse_500 parser
// ---------------------------------------------------------------------------

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

function firstTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<invoice:${tag}\\b[^>]*>`));
  return m ? m[0] : undefined;
}

function textOf(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<invoice:${tag}[^>]*>([\\s\\S]*?)</invoice:${tag}>`));
  return m ? m[1].trim() : undefined;
}

export type NativeParsedResponse = {
  responseType?: "accepted" | "rejected" | "pending";
  responseTimestamp?: number;
  guid?: string;
  invoiceId?: string;
  invoiceDate?: string;
  billerGln?: string;
  providerGln?: string;
  insuranceGln?: string;
  explanation?: string;
  statusIn?: string;
  statusOut?: string;
  balance?: {
    amount?: number;
    amountDue?: number;
    amountPaid?: number;
    currency?: string;
  };
  notifications: Array<{ code?: string; text?: string; isError: boolean }>;
};

/**
 * Parse a generalInvoiceResponse_500 XML string without the Sumex server.
 * Covers the fields the app actually consumes: response type, invoice ref,
 * GLNs, explanation, balance and error notifications.
 */
export function parseInvoiceResponseXml(xml: string): NativeParsedResponse {
  const result: NativeParsedResponse = { notifications: [] };

  const responseTag = firstTag(xml, "response");
  if (responseTag) result.guid = attr(responseTag, "guid");

  const payloadTag = firstTag(xml, "payload");
  if (payloadTag) {
    const ts = attr(payloadTag, "response_timestamp");
    if (ts) result.responseTimestamp = Number(ts);
  }

  const invoiceTag = firstTag(xml, "invoice");
  if (invoiceTag) {
    result.invoiceId = attr(invoiceTag, "request_id");
    result.invoiceDate = attr(invoiceTag, "request_date");
  }

  const billerTag = firstTag(xml, "biller_gln");
  if (billerTag) result.billerGln = attr(billerTag, "gln");
  const providerTag = firstTag(xml, "provider_gln");
  if (providerTag) result.providerGln = attr(providerTag, "gln");
  const insuranceTag = firstTag(xml, "insurance");
  if (insuranceTag) result.insuranceGln = attr(insuranceTag, "gln");

  for (const type of ["accepted", "rejected", "pending"] as const) {
    const tag = firstTag(xml, type);
    if (tag) {
      result.responseType = type;
      result.statusIn = attr(tag, "status_in");
      result.statusOut = attr(tag, "status_out");
      result.explanation = textOf(xml, "explanation");
      break;
    }
  }

  const balanceTag = firstTag(xml, "balance");
  if (balanceTag) {
    const num = (n: string) => {
      const v = attr(balanceTag, n);
      return v !== undefined ? Number(v) : undefined;
    };
    result.balance = {
      amount: num("amount"),
      amountDue: num("amount_due"),
      amountPaid: num("amount_paid"),
      currency: attr(balanceTag, "currency"),
    };
  }

  // Error/notification elements appear in a few shapes across insurers.
  //
  // Real responses use the SELF-CLOSING form, several times in a row:
  //   <invoice:error code="000125" text="Double calcul …"/>
  //   <invoice:error record_id="2" code="000412" text="… déjà compensée …"/>
  //
  // Self-closing and paired forms must therefore be handled separately. A
  // single pattern ending in `(?:</invoice:error>|$)` cannot do it: with no
  // closing tag the lazy group runs all the way to `$`, so the first match
  // swallows the rest of the document, only ONE error is ever reported, and its
  // `text` becomes the entire remaining payload.
  const notifRe = /<(?:\w+:)?(error|notification)\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?>/g;
  let nm: RegExpExecArray | null;
  while ((nm = notifRe.exec(xml)) !== null) {
    const kind = nm[1];
    const attrs = nm[2] || "";
    const selfClosing = Boolean(nm[3]);

    let inner: string | undefined;
    if (!selfClosing) {
      // Paired form: take everything up to the matching close tag.
      const close = new RegExp(`</(?:\\w+:)?${kind}>`, "g");
      close.lastIndex = notifRe.lastIndex;
      const found = close.exec(xml);
      if (found) {
        inner = xml.slice(notifRe.lastIndex, found.index);
        notifRe.lastIndex = close.lastIndex;
      }
    }

    const attrBag = `<x ${attrs}>`;
    const text =
      attr(attrBag, "text")
      ?? (inner ? (textOf(inner, "text") || inner.replace(/<[^>]+>/g, "").trim() || undefined) : undefined);
    const isErrorAttr = attr(attrBag, "is_error");

    result.notifications.push({
      code: attr(attrBag, "code"),
      text,
      isError: kind === "error" || isErrorAttr === "1" || isErrorAttr === "true",
    });
  }

  return result;
}
