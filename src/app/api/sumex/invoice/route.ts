import { NextRequest, NextResponse } from "next/server";
import {
  buildInvoiceRequest,
  parseInvoiceResponse,
  getRequestManagerInfo,
  getResponseManagerInfo,
  mapLawType,
  mapTiersMode,
  mapSex,
  LawType,
  TiersMode,
  SexType,
  RoleType,
  PlaceType,
  RequestType,
  RequestSubtype,
  DiagnosisType,
  EsrType,
  YesNo,
  GenerationAttribute,
  type SumexInvoiceInput,
  type InvoiceServiceInput,
  type InvoiceDiagnosis,
} from "@/lib/sumexInvoice";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/sumex/invoice?action=info|requestInfo|responseInfo
 *
 * Returns module version info from the Sumex1 servers.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "info";

  try {
    switch (action) {
      case "requestInfo": {
        const info = await getRequestManagerInfo();
        return NextResponse.json({ success: true, ...info });
      }
      case "responseInfo": {
        const info = await getResponseManagerInfo();
        return NextResponse.json({ success: true, ...info });
      }
      case "info":
      default: {
        const [reqInfo, resInfo] = await Promise.all([
          getRequestManagerInfo().catch((e) => ({
            moduleVersion: 0,
            moduleVersionText: `Error: ${e.message}`,
          })),
          getResponseManagerInfo().catch((e) => ({
            moduleVersion: 0,
            moduleVersionText: `Error: ${e.message}`,
          })),
        ]);
        return NextResponse.json({
          success: true,
          request: reqInfo,
          response: resInfo,
        });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/sumex/invoice
 *
 * Actions:
 * - buildFromConsultation: Build XML from a consultation ID (fetches data from DB)
 * - buildFromInput: Build XML from raw SumexInvoiceInput
 * - parseResponse: Parse a generalInvoiceResponse XML
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;

    switch (action) {
      case "buildFromConsultation":
        return handleBuildFromConsultation(body);
      case "buildFromInput":
        return handleBuildFromInput(body);
      case "parseResponse":
        return handleParseResponse(body);
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Sumex invoice API error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// buildFromConsultation — Fetches all data from DB and builds invoice XML
// ---------------------------------------------------------------------------

async function handleBuildFromConsultation(body: Record<string, unknown>) {
  const {
    consultationId,
    lawType: lawTypeStr,
    billingType: billingTypeStr,
    generatePdf,
    generationAttributes,
  } = body as {
    consultationId: string;
    lawType?: string;
    billingType?: string;
    generatePdf?: boolean;
    generationAttributes?: number;
  };

  if (!consultationId) {
    return NextResponse.json(
      { success: false, error: "consultationId is required" },
      { status: 400 },
    );
  }

  // Fetch consultation
  const { data: consultation, error: consultError } = await supabaseAdmin
    .from("consultations")
    .select("*")
    .eq("id", consultationId)
    .single();

  if (consultError || !consultation) {
    return NextResponse.json(
      { success: false, error: `Consultation not found: ${consultError?.message}` },
      { status: 404 },
    );
  }

  // Fetch patient
  const { data: patient } = await supabaseAdmin
    .from("patients")
    .select("*")
    .eq("id", consultation.patient_id)
    .single();

  if (!patient) {
    return NextResponse.json(
      { success: false, error: "Patient not found" },
      { status: 404 },
    );
  }

  // Fetch patient insurance
  const { data: insurance } = await supabaseAdmin
    .from("patient_insurances")
    .select("*")
    .eq("patient_id", patient.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Fetch provider
  const { data: provider } = await supabaseAdmin
    .from("providers")
    .select("*")
    .eq("id", consultation.provider_id)
    .single();

  // Fetch clinic config
  const { data: clinicConfig } = await supabaseAdmin
    .from("clinic_config")
    .select("*")
    .limit(1)
    .single();

  // Fetch invoice line items
  const { data: invoiceItems } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("consultation_id", consultationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Build input
  const lawType = mapLawType(lawTypeStr || consultation.law_type || "KVG");
  const tiersMode = mapTiersMode(billingTypeStr || consultation.billing_type || "TG");
  const now = new Date();
  const invoiceId = `INV-${consultationId.substring(0, 8)}-${Date.now()}`;
  const invoiceDate = now.toISOString().split("T")[0];

  // Determine provider info
  const providerGln = provider?.gln || clinicConfig?.provider_gln || "";
  const providerZsr = provider?.zsr || clinicConfig?.provider_zsr || "";
  const billerGln = clinicConfig?.gln || clinicConfig?.biller_gln || providerGln;
  const billerZsr = clinicConfig?.zsr || clinicConfig?.biller_zsr || "";
  const iban = clinicConfig?.iban || "";
  const vatNumber = clinicConfig?.vat_number || "";

  // Build services from invoice items or consultation data
  const services: InvoiceServiceInput[] = [];
  if (invoiceItems?.line_items && Array.isArray(invoiceItems.line_items)) {
    for (const item of invoiceItems.line_items as Array<Record<string, unknown>>) {
      services.push({
        tariffType: (item.tariff_type as string) || (item.tariffType as string) || "007",
        code: (item.code as string) || (item.service_code as string) || "",
        referenceCode: (item.reference_code as string) || "",
        quantity: (item.quantity as number) || 1,
        sessionNumber: (item.session_number as number) || 1,
        dateBegin: (item.date as string) || consultation.date || invoiceDate,
        providerGln: (item.provider_gln as string) || providerGln,
        responsibleGln: (item.responsible_gln as string) || providerGln,
        side: (item.side_type as number) || 0,
        serviceName: (item.description as string) || (item.name as string) || "",
        unit: (item.unit as number) || (item.tax_points as number) || 0,
        unitFactor: (item.unit_factor as number) || (item.tax_point_value as number) || 1,
        externalFactor: (item.external_factor as number) || 1,
        amount: (item.amount as number) || (item.total as number) || 0,
        vatRate: (item.vat_rate as number) || 0,
        ignoreValidate: YesNo.Yes,
      });
    }
  }

  // Build diagnoses
  const diagnoses: InvoiceDiagnosis[] = [];
  if (consultation.diagnosis_codes && Array.isArray(consultation.diagnosis_codes)) {
    for (const code of consultation.diagnosis_codes as string[]) {
      diagnoses.push({
        type: DiagnosisType.ICD,
        code,
      });
    }
  }

  // Treatment dates
  const treatmentBegin = consultation.date || invoiceDate;
  const treatmentEnd = consultation.end_date || consultation.date || invoiceDate;
  const canton = consultation.canton || clinicConfig?.canton || "GE";

  const input: SumexInvoiceInput = {
    language: 2, // FR
    roleType: RoleType.Physician,
    placeType: PlaceType.Practice,
    requestType: RequestType.Invoice,
    requestSubtype: RequestSubtype.Normal,
    tiersMode,
    vatNumber,
    invoiceId,
    invoiceDate,
    lawType,
    insuredId: insurance?.card_number || "",
    esrType: EsrType.QR,
    iban,
    paymentPeriod: 30,
    billerGln,
    billerZsr: billerZsr || undefined,
    billerAddress: {
      companyName: clinicConfig?.clinic_name || "Aesthetics Clinic XT SA",
      department: clinicConfig?.department || "",
      street: clinicConfig?.street || "",
      zip: clinicConfig?.zip || "",
      city: clinicConfig?.city || "",
      stateCode: canton,
      email: clinicConfig?.email || "",
      phone: clinicConfig?.phone || "",
    },
    providerGln,
    providerZsr: providerZsr || undefined,
    providerAddress: {
      familyName: provider?.last_name || "",
      givenName: provider?.first_name || "",
      title: provider?.title || "Dr. med.",
      street: clinicConfig?.street || "",
      zip: clinicConfig?.zip || "",
      city: clinicConfig?.city || "",
      stateCode: canton,
    },
    insuranceGln: insurance?.insurer_gln || undefined,
    insuranceAddress: insurance?.insurer_gln
      ? {
          companyName: insurance?.insurer_name || "",
          street: insurance?.insurer_street || "",
          zip: insurance?.insurer_zip || "",
          city: insurance?.insurer_city || "",
          stateCode: insurance?.insurer_canton || "",
        }
      : undefined,
    patientSex: mapSex(patient.sex || patient.gender || "male"),
    patientBirthdate: patient.date_of_birth || patient.birthdate || "1990-01-01",
    patientSsn: patient.avs_number || patient.ssn || "",
    patientAddress: (() => {
      const c = (patient.country || "").trim();
      const isCH = !c || /^(ch|switzerland|suisse|schweiz|svizzera)$/i.test(c);
      const CMAP: Record<string, string> = { france:"FR",frankreich:"FR",francia:"FR",germany:"DE",deutschland:"DE",allemagne:"DE",italia:"IT",italy:"IT",italien:"IT",italie:"IT",austria:"AT","österreich":"AT",autriche:"AT",liechtenstein:"LI",spain:"ES",espagne:"ES",portugal:"PT",belgium:"BE",belgique:"BE",netherlands:"NL","pays-bas":"NL","united kingdom":"GB",uk:"GB",luxembourg:"LU",luxemburg:"LU","united states":"US",usa:"US" };
      const cc = isCH ? "" : (c.length === 2 ? c.toUpperCase() : (CMAP[c.toLowerCase()] || ""));
      return {
        familyName: patient.last_name || patient.family_name || "",
        givenName: patient.first_name || patient.given_name || "",
        salutation: patient.salutation || "",
        street: patient.street || patient.address || "",
        zip: patient.zip || patient.postal_code || "",
        city: patient.city || "",
        stateCode: isCH ? (patient.canton || patient.state || "") : "",
        country: isCH ? undefined : (c || undefined),
        countryCode: cc || undefined,
        email: patient.email || "",
        phone: patient.phone || "",
      };
    })(),
    guarantorAddress: (() => {
      const c = (patient.country || "").trim();
      const isCH = !c || /^(ch|switzerland|suisse|schweiz|svizzera)$/i.test(c);
      const CMAP: Record<string, string> = { france:"FR",frankreich:"FR",francia:"FR",germany:"DE",deutschland:"DE",allemagne:"DE",italia:"IT",italy:"IT",italien:"IT",italie:"IT",austria:"AT","österreich":"AT",autriche:"AT",liechtenstein:"LI",spain:"ES",espagne:"ES",portugal:"PT",belgium:"BE",belgique:"BE",netherlands:"NL","pays-bas":"NL","united kingdom":"GB",uk:"GB",luxembourg:"LU",luxemburg:"LU","united states":"US",usa:"US" };
      const cc = isCH ? "" : (c.length === 2 ? c.toUpperCase() : (CMAP[c.toLowerCase()] || ""));
      return {
        familyName: patient.last_name || patient.family_name || "",
        givenName: patient.first_name || patient.given_name || "",
        salutation: patient.salutation || "",
        street: patient.street || patient.address || "",
        zip: patient.zip || patient.postal_code || "",
        city: patient.city || "",
        stateCode: isCH ? (patient.canton || patient.state || "") : "",
        country: isCH ? undefined : (c || undefined),
        countryCode: cc || undefined,
        email: patient.email || "",
        phone: patient.phone || "",
      };
    })(),
    printCopyToGuarantor: tiersMode === TiersMode.Payant ? YesNo.Yes : undefined,
    treatmentCanton: canton,
    treatmentType: 0, // Ambulatory
    treatmentReason: 0, // Disease
    treatmentDateBegin: treatmentBegin,
    treatmentDateEnd: treatmentEnd,
    diagnoses,
    services,
    softwarePackage: "AestheticsClinic",
    softwareVersion: 100,
    softwareId: 0,
  };

  // Build the invoice
  const result = await buildInvoiceRequest(input, {
    generatePdf: generatePdf === true,
    generationAttributes:
      (generationAttributes as number) ?? GenerationAttribute.None,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        abortInfo: result.abortInfo,
        validationError: result.validationError,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    success: true,
    xmlFilePath: result.xmlFilePath,
    xmlContent: result.xmlContent,
    pdfFilePath: result.pdfFilePath,
    validationError: result.validationError,
    usedSchema: result.usedSchema,
    timestamp: result.timestamp,
    invoiceId,
  });
}

// ---------------------------------------------------------------------------
// buildFromInput — Build XML from raw input (no DB lookup)
// ---------------------------------------------------------------------------

async function handleBuildFromInput(body: Record<string, unknown>) {
  const input = body.input as SumexInvoiceInput;
  if (!input) {
    return NextResponse.json(
      { success: false, error: "input is required" },
      { status: 400 },
    );
  }

  const generatePdf = body.generatePdf === true;
  const generationAttributes =
    (body.generationAttributes as number) ?? GenerationAttribute.None;

  const result = await buildInvoiceRequest(input, {
    generatePdf,
    generationAttributes,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        abortInfo: result.abortInfo,
        validationError: result.validationError,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    success: true,
    xmlFilePath: result.xmlFilePath,
    xmlContent: result.xmlContent,
    pdfFilePath: result.pdfFilePath,
    validationError: result.validationError,
    usedSchema: result.usedSchema,
    timestamp: result.timestamp,
  });
}

// ---------------------------------------------------------------------------
// parseResponse — Parse a generalInvoiceResponse XML
// ---------------------------------------------------------------------------

async function handleParseResponse(body: Record<string, unknown>) {
  const xmlFilePath = body.xmlFilePath as string;
  if (!xmlFilePath) {
    return NextResponse.json(
      { success: false, error: "xmlFilePath is required" },
      { status: 400 },
    );
  }

  const result = await parseInvoiceResponse(xmlFilePath);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 422 },
    );
  }

  const { success: _, ...responseData } = result;
  return NextResponse.json({ success: true, ...responseData });
}
