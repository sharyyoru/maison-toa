// v2 — AR.* zero-TT fix, correct TARDOC dignity codes
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  // NOTE: generateTardocServicesFromDuration is intentionally NOT imported.
  // Auto-generating synthetic line items from consultation duration was a
  // source of the partial-payment-for-services-not-rendered bug. Line items
  // must come exclusively from the invoice_line_items table.
  type BillingType,
  type SwissLawType,
} from "@/lib/medidata";
import {
  uploadInvoiceXml,
} from "@/lib/medidataProxy";
import {
  buildInvoiceRequest,
  mapLawType as mapSumexLaw,
  mapTiersMode as mapSumexTiers,
  mapSex as mapSumexSex,
  TiersMode,
  RoleType,
  PlaceType,
  RequestType,
  RequestSubtype,
  DiagnosisType,
  EsrType,
  YesNo,
  type SumexInvoiceInput,
  type InvoiceServiceInput as SumexServiceInput,
  type InvoiceDiagnosis as SumexDiagnosis,
} from "@/lib/sumexInvoice";
import { deriveTariffType } from "@/lib/tariffType";

type ConsultationData = {
  id: string;
  patient_id: string;
  title: string;
  content: string | null;
  scheduled_at: string;
  invoice_total_amount: number | null;
  doctor_name: string | null;
};

type PatientData = {
  id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  gender: string | null;
  street_address: string | null;
  postal_code: string | null;
  town: string | null;
  country?: string | null;
  avs_number?: string | null;
  email?: string | null;
  phone?: string | null;
};

type InsuranceData = {
  id: string;
  provider_name: string;
  card_number: string;
  insurance_type: string;
  gln: string | null;
  avs_number: string | null;
  policy_number: string | null;
  law_type: string | null;
  billing_type: string | null;
  case_number: string | null;
  insurer_id: string | null;
};

// MediData intermediate (clearing house) GLN — required in XML transport <via>
const MEDIDATA_INTERMEDIATE_GLN = "7601001304307";
// Per MediData: TG invoices must use this GLN as transport "To" (no transmission to insurance)
const TG_NO_TRANSMISSION_GLN = "2000000000008";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      invoiceId,
      consultationId, // legacy fallback
      patientId: bodyPatientId,
      billingType: bodyBillingType = 'TP',
      lawType: bodyLawType = 'KVG',
      reminderLevel = 0,
      diagnosisCodes = [],
      treatmentReason = 'disease',
      insurerGln,
      insurerName,
      insurerAddress: bodyInsurerAddress,
      policyNumber,
      avsNumber,
      caseNumber,
      accidentDate,
      durationMinutes,
      language,
      skipValidation = false,
    } = body as {
      invoiceId?: string;
      consultationId?: string;
      patientId?: string;
      billingType?: string;
      lawType?: string;
      reminderLevel?: number;
      diagnosisCodes?: string[];
      treatmentReason?: string;
      insurerGln?: string;
      insurerName?: string;
      insurerAddress?: { street?: string; zip?: string; city?: string };
      policyNumber?: string;
      avsNumber?: string;
      caseNumber?: string;
      accidentDate?: string;
      durationMinutes?: number;
      language?: 1 | 2 | 3;
      skipValidation?: boolean;
    };

    // ── Resolve the invoice (primary) or fall back to consultation ──
    let invoiceRecord: any = null;
    let consultationData: ConsultationData | null = null;
    let resolvedInvoiceId: string | null = invoiceId || null;

    if (invoiceId) {
      const { data: inv, error: invErr } = await supabaseAdmin
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (invErr || !inv) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      invoiceRecord = inv;
    } else if (consultationId) {
      // Legacy path: look up invoice by consultation_id, or fall back to consultation table
      const { data: inv } = await supabaseAdmin
        .from("invoices")
        .select("*")
        .eq("consultation_id", consultationId)
        .limit(1)
        .single();
      if (inv) {
        invoiceRecord = inv;
        resolvedInvoiceId = inv.id;
      } else {
        const { data: cons } = await supabaseAdmin
          .from("consultations")
          .select("*")
          .eq("id", consultationId)
          .eq("record_type", "invoice")
          .single();
        if (!cons) {
          return NextResponse.json({ error: "Invoice or consultation not found" }, { status: 404 });
        }
        consultationData = cons as unknown as ConsultationData;
      }
    } else {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
    }

    const patientId = bodyPatientId
      || invoiceRecord?.patient_id
      || consultationData?.patient_id;

    // Derive billing fields from invoice record when available
    const billingType = bodyBillingType || invoiceRecord?.billing_type || 'TP';
    const lawType = bodyLawType || invoiceRecord?.health_insurance_law || 'KVG';

    // Get patient data
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("*")
      .eq("id", patientId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: "Patient not found" },
        { status: 404 }
      );
    }

    const patientData = patient as unknown as PatientData;

    // Normalize canton abbreviation — DB may store full name e.g. "Vaud" instead of "VD"
    const CANTON_NAME_TO_CODE: Record<string, string> = {
      "aargau": "AG", "appenzell innerrhoden": "AI", "appenzell ausserrhoden": "AR",
      "bern": "BE", "berne": "BE", "basel-landschaft": "BL", "basel-stadt": "BS",
      "fribourg": "FR", "freiburg": "FR", "geneva": "GE", "genève": "GE", "genf": "GE",
      "glarus": "GL", "graubünden": "GR", "grisons": "GR", "jura": "JU",
      "luzern": "LU", "lucerne": "LU", "nidwalden": "NW", "neuenburg": "NE",
      "neuchâtel": "NE", "obwalden": "OW", "st. gallen": "SG", "schaffhausen": "SH",
      "solothurn": "SO", "schwyz": "SZ", "thurgau": "TG", "ticino": "TI",
      "uri": "UR", "vaud": "VD", "valais": "VS", "wallis": "VS",
      "zug": "ZG", "zürich": "ZH", "zurich": "ZH",
    };
    const normalizeCanton = (c: string | null | undefined): string => {
      if (!c) return "GE";
      if (c.length === 2) return c.toUpperCase();
      return CANTON_NAME_TO_CODE[c.toLowerCase()] || c.toUpperCase().slice(0, 2);
    };

    // Get insurance data if available
    let insuranceData: InsuranceData | null = null;
    const { data: insurances } = await supabaseAdmin
      .from("patient_insurances")
      .select("*")
      .eq("patient_id", patientId)
      .limit(1);

    if (insurances && insurances.length > 0) {
      insuranceData = insurances[0] as unknown as InsuranceData;
    }

    // Get detailed Swiss insurer data if available
    let swissInsurer: {
      receiver_gln: string | null;
      tp_allowed: boolean | null;
      name: string | null;
      address_street: string | null;
      address_postal_code: string | null;
      address_city: string | null;
      address_canton: string | null;
    } | null = null;

    const resolvedInsurerId = invoiceRecord?.insurer_id || insuranceData?.insurer_id;
    if (resolvedInsurerId) {
      const { data } = await supabaseAdmin
        .from("swiss_insurers")
        .select("name, receiver_gln, tp_allowed, address_street, address_postal_code, address_city, address_canton")
        .eq("id", resolvedInsurerId)
        .single();

      if (data) swissInsurer = data;
    }

    // Fallback: look up swiss_insurers by GLN if no insurer_id resolved
    if (!swissInsurer) {
      const lookupGln = insurerGln || invoiceRecord?.insurance_gln || insuranceData?.gln;
      if (lookupGln) {
        const { data } = await supabaseAdmin
          .from("swiss_insurers")
          .select("name, receiver_gln, tp_allowed, address_street, address_postal_code, address_city, address_canton")
          .eq("gln", lookupGln)
          .limit(1)
          .single();

        if (data) swissInsurer = data;
      }
    }

    // Get sender GLN from medidata_config (only field needed from config)
    const { data: mdConfig } = await supabaseAdmin
      .from("medidata_config")
      .select("clinic_gln")
      .limit(1)
      .single();
    const senderGln = mdConfig?.clinic_gln || "";

    // ── Fetch billing entity (provider) from providers table ──
    let billingEntity: Record<string, any> | null = null;
    if (invoiceRecord?.provider_id) {
      const { data: provRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, phone, vatuid, qual_dignities")
        .eq("id", invoiceRecord.provider_id)
        .single();
      if (provRow) billingEntity = provRow;
    }
    // Fallback: if provider_id is not set, look up by provider_gln
    if (!billingEntity && invoiceRecord?.provider_gln) {
      const { data: provRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, phone, vatuid, qual_dignities")
        .eq("gln", invoiceRecord.provider_gln)
        .limit(1)
        .maybeSingle();
      if (provRow) billingEntity = provRow;
    }

    // ── Fetch staff/doctor provider if different ──
    let staffEntity: Record<string, any> | null = null;
    if (invoiceRecord?.doctor_user_id && invoiceRecord.doctor_user_id !== invoiceRecord.provider_id) {
      const { data: staffRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, salutation, title, qual_dignities")
        .eq("id", invoiceRecord.doctor_user_id)
        .single();
      if (staffRow) staffEntity = staffRow;
    }
    // Fallback: if doctor_user_id is not set, look up by doctor_gln
    if (!staffEntity && invoiceRecord?.doctor_gln && invoiceRecord.doctor_gln !== invoiceRecord.provider_gln) {
      const { data: staffRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, salutation, title, qual_dignities")
        .eq("gln", invoiceRecord.doctor_gln)
        .limit(1)
        .maybeSingle();
      if (staffRow) staffEntity = staffRow;
    }

    // ── Resolve provider fields with fallbacks (same pattern as check-xml) ──
    const pickValidGln = (...candidates: (string | null | undefined)[]) => {
      for (const c of candidates) if (c && /^\d{13}$/.test(c)) return c;
      return "7601003000115"; // fallback
    };
    const provGln = pickValidGln(billingEntity?.gln, invoiceRecord?.provider_gln);
    const provZsr = billingEntity?.zsr || invoiceRecord?.provider_zsr || "";
    const provName = billingEntity?.name || invoiceRecord?.provider_name || "TOA SA";
    const provStreet = billingEntity?.street
      ? `${billingEntity.street}${billingEntity.street_no ? " " + billingEntity.street_no : ""}`
      : "Voie du Chariot 6";
    const provZip = billingEntity?.zip_code || "1003";
    const provCity = billingEntity?.city || "Lausanne";
    const provCanton = normalizeCanton(invoiceRecord?.treatment_canton || billingEntity?.canton);
    // QR-IBAN check: Sumex SetEsrQR requires IID 30000-31999 (error [638] for regular IBANs).
    const sanitizeQrIban = (raw: string | null | undefined): string | null => {
      if (!raw) return null;
      const stripped = raw.replace(/\s+/g, "").toUpperCase();
      if (!/^CH[0-9A-Z]{19}$/.test(stripped)) return null;
      const iid = parseInt(stripped.slice(4, 9), 10);
      if (Number.isNaN(iid) || iid < 30000 || iid > 31999) {
        console.warn(`[SendInvoice] IBAN ${stripped} is not a QR-IBAN (IID=${iid}); falling back to default QR-IBAN.`);
        return null;
      }
      return stripped;
    };
    const provIban = sanitizeQrIban(billingEntity?.iban) || sanitizeQrIban(invoiceRecord?.provider_iban) || "CH0930788000050249289";

    // Derive invoice metadata
    const invoiceNumber = invoiceRecord?.invoice_number || `INV-${Date.now().toString(36).toUpperCase()}`;
    const invoiceDate = invoiceRecord?.invoice_date
      ? String(invoiceRecord.invoice_date).split('T')[0]
      : new Date().toISOString().split('T')[0];
    const dueDate = invoiceRecord?.due_date
      ? String(invoiceRecord.due_date).split('T')[0]
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const treatmentDate = invoiceRecord?.treatment_date
      ? new Date(invoiceRecord.treatment_date).toISOString().split('T')[0]
      : consultationData?.scheduled_at?.split('T')[0]
        || new Date().toISOString().split('T')[0];

    // Load line items
    let services: import("@/lib/medidata").InvoiceServiceLine[] = [];
    const lineItemLookupId = resolvedInvoiceId || consultationId;

    console.log(`[SendInvoice] Loading line items: invoiceId=${invoiceId}, consultationId=${consultationId}, resolvedInvoiceId=${resolvedInvoiceId}, lineItemLookupId=${lineItemLookupId}`);

    const lineItemsQuery = supabaseAdmin
      .from("invoice_line_items")
      .select("code, name, quantity, unit_price, total_price, tariff_code, external_factor_mt, side_type, session_number, ref_code, date_begin, provider_gln, responsible_gln, catalog_name, tp_al, tp_tl, tp_al_value, tp_tl_value")
      .eq("invoice_id", lineItemLookupId)
      .order("sort_order", { ascending: true });

    const { data: dbLineItems, error: lineItemsError } = await lineItemsQuery;

    console.log(`[SendInvoice] Line items query result: found=${dbLineItems?.length ?? 0}, error=${lineItemsError ? JSON.stringify(lineItemsError) : 'none'}`);
    if (lineItemsError) {
      console.error(`[SendInvoice] Line items query error details:`, lineItemsError);
    }
    if (dbLineItems && dbLineItems.length > 0) {
      console.log(`[SendInvoice] First line item:`, JSON.stringify(dbLineItems[0], null, 2));
    }

    if (dbLineItems && dbLineItems.length > 0) {
      // Include all line items (TMA gesture codes are kept as reference lines with amount=0)
      const billableLineItems = dbLineItems;

      // ── TARDOC tax-point backfill ─────────────────────────────────────────
      // Some TARDOC line items were stored with tp_al=0/tp_tl=0 (the columns
      // were not populated when the line item was created). Sumex requires the
      // raw AL/TL tax-point counts (tp_mt/tp_tt) — it rejects dUnitMT = 0 or
      // the CHF total.  Look up missing values from tardoc_group_items.
      const tardocCodesNeedingLookup = billableLineItems
        .filter((it: any) => it.tariff_code === 7 && (!(it.tp_al > 0) || !(it.tp_tl > 0)))
        .map((it: any) => it.code as string)
        .filter(Boolean);

      const tardocCatalogMap: Record<string, { tp_mt: number; tp_tt: number }> = {};
      if (tardocCodesNeedingLookup.length > 0) {
        const uniqueCodes = [...new Set(tardocCodesNeedingLookup)];
        const { data: catalogRows } = await supabaseAdmin
          .from("tardoc_group_items")
          .select("tardoc_code, tp_mt, tp_tt")
          .in("tardoc_code", uniqueCodes);
        for (const row of (catalogRows ?? [])) {
          if (row.tardoc_code && !tardocCatalogMap[row.tardoc_code]) {
            tardocCatalogMap[row.tardoc_code] = { tp_mt: row.tp_mt ?? 0, tp_tt: row.tp_tt ?? 0 };
          }
        }
        console.log(`[SendInvoice] TARDOC catalog backfill: looked up ${uniqueCodes.length} codes, found ${Object.keys(tardocCatalogMap).length}:`, tardocCatalogMap);
      }
      // ── end backfill ──────────────────────────────────────────────────────

      // Map actual line items to InvoiceServiceLine for XML generation
      services = billableLineItems.map((item: any, idx: number) => {
        // Resolve tariff_type honoring `catalog_name` first so TMA gestures
        // (catalog_name='TMA' but tariff_code=5/7) emit as "TMA", not "005".
        // See src/lib/tariffType.ts for the full priority chain.
        const tariffType = deriveTariffType(item);
        const isAcf = tariffType === "005";
        // ACF (005) with ignoreValidate=Yes: use sessionNumber=1 (simple tariff default per docs)
        const rawSession = item.session_number ?? 1;
        const sessionNumber = isAcf ? 1 : rawSession;

        // For TARDOC, prefer stored tp_al/tp_tl; fall back to catalog tp_mt/tp_tt.
        // AR.* room/change codes (serviceType=R) self-compute TT via changeMin — must send 0.
        const catalog = item.tariff_code === 7 ? tardocCatalogMap[item.code] : undefined;
        const isArCode = (item.code || "").startsWith("AR.");
        const resolvedTpAl = (item.tp_al > 0) ? item.tp_al : (catalog?.tp_mt ?? 0);
        const resolvedTpTl = isArCode ? 0 : ((item.tp_tl > 0) ? item.tp_tl : (catalog?.tp_tt ?? 0));

        return {
          code: item.code || "",
          tariffType,
          description: item.name || "",
          quantity: item.quantity || 1,
          unitPrice: item.unit_price || 0,
          total: item.total_price || 0,
          date: item.date_begin || treatmentDate,
          providerId: item.provider_gln || provGln,
          providerGln: item.provider_gln || provGln,
          // ACF/TARDOC-specific fields
          externalFactor: (item.tariff_code === 5 || item.tariff_code === 7) ? (item.external_factor_mt ?? 1) : undefined,
          sideType: item.tariff_code === 5 ? (item.side_type ?? 0) : undefined,
          sessionNumber,
          refCode: item.ref_code || undefined,
          // Tax point fields for TARDOC — use catalog-backfilled values if stored as 0
          tpAl: resolvedTpAl,
          tpTl: resolvedTpTl,
          tpAlValue: item.tp_al_value,
          tpTlValue: item.tp_tl_value,
        };
      });

      if (services.length === 0) {
        console.error(`[SendInvoice] ❌ All line items are TMA gesture codes (grouper inputs). No billable ACF flat rate codes found.`);
        return NextResponse.json(
          { error: "No billable services found. TMA gesture codes must be grouped into ACF flat rate codes first." },
          { status: 400 },
        );
      }
    } else {
      // NO FALLBACK - line items are required for all invoices
      console.error(`[SendInvoice] ❌ CRITICAL: NO LINE ITEMS FOUND for invoice!`);
      console.error(`[SendInvoice] invoiceId=${invoiceId}, consultationId=${consultationId}, resolvedInvoiceId=${resolvedInvoiceId}, lineItemLookupId=${lineItemLookupId}`);
      console.error(`[SendInvoice] Invoice number: ${invoiceNumber}, Patient: ${patientId}`);

      return NextResponse.json(
        {
          error: "No line items found for this invoice",
          details: "Invoice must have line items before it can be sent to insurance. Please add services to the invoice first.",
          debug: {
            invoiceId,
            consultationId,
            resolvedInvoiceId,
            lineItemLookupId,
            invoiceNumber,
          }
        },
        { status: 400 }
      );
    }

    // Calculate totals
    const subtotal = services.reduce((sum, s) => sum + s.total, 0);
    const total = invoiceRecord?.total_amount || consultationData?.invoice_total_amount || subtotal;
    const resolvedInsurerGln = insurerGln || invoiceRecord?.insurance_gln || insuranceData?.gln || '7601003000016';
    const resolvedReceiverGln = swissInsurer?.receiver_gln || resolvedInsurerGln;
    const resolvedInsurerName = insurerName || invoiceRecord?.insurance_name || insuranceData?.provider_name || 'Unknown Insurer';

    // Build Sumex1 input — Sumex1 server is the ONLY XML generation path
    const sumexServices: SumexServiceInput[] = services.map(s => {
      // For TARDOC (007) and ACF (005), use tp_al/tp_tl as MT/TT unit values.
      // Both AL (physician) and TL (technical) components must be sent for correct insurance billing.
      const isTardoc = s.tariffType === "007";
      const isAcf = (s.tariffType || "590") === "005";
      const usesTaxPoints = isTardoc || isAcf;
      // IMPORTANT: tp_al=0 is a valid value for pure-TT codes (AK.*, AR.*).
      // Do NOT fall back to unitPrice when tp_al is explicitly 0 — send 0 to Sumex.
      // Only fall back to unitPrice when the service is NOT a tax-point service (590 etc.).
      const unit = usesTaxPoints
        ? (s.tpAl ?? 0)
        : (s.unitPrice || 0);
      const unitFactor = usesTaxPoints && s.tpAlValue != null && s.tpAlValue > 0 ? s.tpAlValue : 1;
      // TT (technical) component — pass for TARDOC so insurance XML includes full billed amount
      const unitTT = usesTaxPoints && s.tpTl != null && s.tpTl > 0 ? s.tpTl : undefined;
      const unitFactorTT = usesTaxPoints && s.tpTlValue != null && s.tpTlValue > 0 ? s.tpTlValue : undefined;
      return {
        tariffType: s.tariffType || "590",
        code: s.code,
        referenceCode: s.refCode || "",
        quantity: s.quantity,
        sessionNumber: s.sessionNumber ?? 1,
        dateBegin: s.date,
        providerGln: s.providerGln || provGln,
        responsibleGln: s.providerGln || provGln,
        side: (s.sideType as 0 | 1 | 2 | 3) ?? 0,
        serviceName: s.description || "",
        unit,
        unitFactor,
        unitTT,
        unitFactorTT,
        externalFactor: s.externalFactor ?? 1,
        amount: s.total || 0,
        vatRate: 0,
        // ACF 005: always skip validation — already grouped by standalone acfValidator.
        ignoreValidate: (isAcf || skipValidation) ? YesNo.Yes : YesNo.No,
      };
    });

    // Fallback: extract ICD codes from ACF line items' ref_code if none provided
    let resolvedDiagCodes: string[] = (diagnosisCodes || []).filter((c: string) => c && c.length >= 2);
    if (resolvedDiagCodes.length === 0 && services.some((s: any) => s.tariffType === "005")) {
      const acfRefCodes = [...new Set(
        services
          .filter((s: any) => s.tariffType === "005" && s.refCode && s.refCode.length >= 2)
          .map((s: any) => s.refCode as string)
      )];
      if (acfRefCodes.length > 0) {
        console.log(`[SendInvoice] No diagnosis codes provided, extracted from ACF ref_codes: ${acfRefCodes.join(", ")}`);
        resolvedDiagCodes = acfRefCodes;
      }
    }
    const sumexDiagnoses: SumexDiagnosis[] = resolvedDiagCodes.map((code: string) => ({
      type: DiagnosisType.ICD,
      code,
    }));

    const canton = provCanton;
    // Detect non-Swiss patient for address handling
    const patientCountry = patientData.country?.trim() || "";
    const isSwissPatient = !patientCountry || /^(ch|switzerland|suisse|schweiz|svizzera)$/i.test(patientCountry);
    // Map common country names to ISO 3166-1 alpha-2 codes
    const COUNTRY_NAME_TO_CODE: Record<string, string> = {
      france: "FR", frankreich: "FR", francia: "FR",
      germany: "DE", deutschland: "DE", allemagne: "DE", germania: "DE",
      italy: "IT", italien: "IT", italie: "IT", italia: "IT",
      austria: "AT", österreich: "AT", autriche: "AT",
      liechtenstein: "LI",
      spain: "ES", spanien: "ES", espagne: "ES", españa: "ES",
      portugal: "PT",
      belgium: "BE", belgien: "BE", belgique: "BE",
      netherlands: "NL", niederlande: "NL", "pays-bas": "NL",
      "united kingdom": "GB", uk: "GB", großbritannien: "GB", "royaume-uni": "GB",
      "united states": "US", usa: "US",
      luxembourg: "LU", luxemburg: "LU",
    };
    const resolveCountryCode = (c: string): string => {
      if (!c || isSwissPatient) return "";
      if (c.length === 2) return c.toUpperCase();
      return COUNTRY_NAME_TO_CODE[c.toLowerCase()] || "";
    };
    const patientCountryCode = resolveCountryCode(patientCountry);
    const patientCountryName = isSwissPatient ? "" : patientCountry;

    console.log(`[SendInvoice] Building Sumex1 invoice: id=${invoiceNumber}, patient=${patientData.first_name} ${patientData.last_name}, services=${services.length}, total=${total}, country="${patientCountry}", isSwiss=${isSwissPatient}, countryCode="${patientCountryCode}", countryName="${patientCountryName}"`);

    // For non-Swiss patients without SSN, use the unknownSSN per Sumex CHM docs
    const patientSsn = avsNumber || insuranceData?.avs_number || (!isSwissPatient ? "7569999999991" : "");

    const tiersMode = mapSumexTiers(billingType);
    // amountPrepaid is only allowed in Tiers Garant (TG) — error [926] if sent for TP/TS
    const paidAmt = Number(invoiceRecord?.paid_amount) || 0;
    const amountPrepaid = tiersMode === TiersMode.Garant ? paidAmt : 0;

    const sumexInput: SumexInvoiceInput = {
      language: language || 2,
      roleType: RoleType.Physician,
      placeType: PlaceType.Practice,
      requestType: RequestType.Invoice,
      requestSubtype: RequestSubtype.Normal,
      tiersMode,
      amountPrepaid: amountPrepaid || undefined,
      vatNumber: billingEntity?.vatuid || "",
      invoiceId: invoiceNumber,
      invoiceDate,
      reminderLevel: reminderLevel || 0,
      lawType: mapSumexLaw(lawType),
      insuredId: insuranceData?.card_number || "",
      esrType: EsrType.QR,
      iban: provIban,
      paymentPeriod: 30,
      billerGln: provGln,
      billerZsr: provZsr || undefined,
      billerAddress: {
        companyName: provName,
        street: provStreet,
        zip: provZip,
        city: provCity,
        stateCode: canton,
      },
      providerGln: pickValidGln(staffEntity?.gln, invoiceRecord?.doctor_gln, provGln),
      providerZsr: staffEntity?.zsr || invoiceRecord?.doctor_zsr || provZsr || undefined,
      providerAddress: {
        familyName: staffEntity?.name || invoiceRecord?.doctor_name || consultationData?.doctor_name || provName,
        givenName: "",
        salutation: staffEntity?.salutation || billingEntity?.salutation || "",
        title: staffEntity?.title || billingEntity?.title || "",
        street: staffEntity?.street ? `${staffEntity.street}${staffEntity.street_no ? " " + staffEntity.street_no : ""}` : provStreet,
        zip: staffEntity?.zip_code || provZip,
        city: staffEntity?.city || provCity,
        stateCode: staffEntity?.canton || canton,
      },
      insuranceGln: resolvedInsurerGln,
      insuranceAddress: resolvedInsurerGln ? {
        companyName: swissInsurer?.name || resolvedInsurerName,
        street: swissInsurer?.address_street || "N/A",
        zip: swissInsurer?.address_postal_code || "0000",
        city: swissInsurer?.address_city || "N/A",
        stateCode: swissInsurer?.address_canton || canton,
      } : undefined,
      patientSex: mapSumexSex(patientData.gender || "male"),
      patientBirthdate: patientData.dob || "1990-01-01",
      patientSsn,
      patientAddress: {
        familyName: patientData.last_name,
        givenName: patientData.first_name,
        street: patientData.street_address || "",
        zip: patientData.postal_code || "",
        city: patientData.town || "",
        stateCode: isSwissPatient ? canton : "",
        country: patientCountryName || undefined,
        countryCode: patientCountryCode || undefined,
        email: patientData.email || undefined,
        phone: patientData.phone || undefined,
      },
      guarantorAddress: {
        familyName: patientData.last_name,
        givenName: patientData.first_name,
        street: patientData.street_address || "",
        zip: patientData.postal_code || "",
        city: patientData.town || "",
        stateCode: isSwissPatient ? canton : "",
        country: patientCountryName || undefined,
        countryCode: patientCountryCode || undefined,
        email: patientData.email || undefined,
        phone: patientData.phone || undefined,
      },
      treatmentCanton: canton,
      treatmentDateBegin: treatmentDate,
      treatmentDateEnd: treatmentDate,
      ...(accidentDate ? { acid: accidentDate } : {}),
      ...(caseNumber ? { apid: caseNumber } : {}),
      diagnoses: sumexDiagnoses,
      services: sumexServices,
      transportFrom: senderGln || provGln,
      transportViaGln: MEDIDATA_INTERMEDIATE_GLN,
      // Per MediData (Vladimir): TG uses GLN 2000000000008 (no direct transmission to insurance)
      transportTo: billingType === 'TG' ? TG_NO_TRANSMISSION_GLN : resolvedReceiverGln,
      // Per MediData feedback: TP invoices must include print_copy_to_guarantor for patient copy
      printCopyToGuarantor: billingType === 'TP' ? YesNo.Yes : (invoiceRecord?.copy_to_guarantor ? YesNo.Yes : YesNo.No),
      qualDignities:
        (staffEntity?.qual_dignities && staffEntity.qual_dignities.length > 0)
          ? staffEntity.qual_dignities
          : (billingEntity?.qual_dignities && billingEntity.qual_dignities.length > 0)
            ? billingEntity.qual_dignities
            : undefined,
    };

    // Guard: qual_dignities are required for TARDOC/TARMED insurance billing
    if (!sumexInput.qualDignities || sumexInput.qualDignities.length === 0) {
      const doctorName = staffEntity?.name || billingEntity?.name || "the doctor";
      console.error(`[SendInvoice] Missing qual_dignities for ${doctorName} (GLN: ${sumexInput.providerGln})`);
      return NextResponse.json({
        error: "Missing specialty codes",
        details: `No specialty codes (qual_dignities) found for ${doctorName}. Please add the doctor's specialty codes in the provider settings before sending to insurance.`,
      }, { status: 422 });
    }

    // DEBUG: Log complete sumexInput before sending to Sumex
    console.log('[SendInvoice] DEBUG sumexInput:', JSON.stringify({
      providerGln: sumexInput.providerGln,
      qualDignities: sumexInput.qualDignities,
      lawType: sumexInput.lawType,
      tiersMode: sumexInput.tiersMode,
      insuranceGln: sumexInput.insuranceGln,
      servicesCount: sumexInput.services?.length || 0,
      firstService: sumexInput.services?.[0] ? {
        code: sumexInput.services[0].code,
        tariffType: sumexInput.services[0].tariffType,
        providerGln: sumexInput.services[0].providerGln,
        responsibleGln: sumexInput.services[0].responsibleGln,
      } : null
    }, null, 2));

    // Generate XML + PDF via Sumex1 server (no fallback — this is the only path)
    const sumexResult = await buildInvoiceRequest(sumexInput, { generatePdf: true });

    if (!sumexResult.success || !sumexResult.xmlContent) {
      console.error(`[SendInvoice] Sumex1 XML generation FAILED for ${invoiceNumber}: error=${sumexResult.error}, abort=${sumexResult.abortInfo}, validErr=${sumexResult.validationError}`);
      return NextResponse.json(
        {
          error: "Sumex1 XML generation failed",
          details: sumexResult.error,
          abortInfo: sumexResult.abortInfo,
          validationError: sumexResult.validationError,
        },
        { status: 500 }
      );
    }

    const xmlContent = sumexResult.xmlContent;
    console.log(`[SendInvoice] Sumex1 XML generated: schema=${sumexResult.usedSchema}, validErr=${sumexResult.validationError}, pdfSize=${sumexResult.pdfContent?.length ?? 0}`);

    // Verify Sumex didn't silently drop any services.
    // TARDOC/ACF use AddServiceEx → <invoice:service_ex> tags.
    // Free-text/590 use AddService → <invoice:service> tags (NOT service_ex).
    // Count both to detect silent rejections.
    if (xmlContent) {
      const xmlServiceExCount = (xmlContent.match(/<invoice:service_ex/g) || []).length;
      const xmlServiceCount = xmlServiceExCount + (xmlContent.match(/<invoice:service\b/g) || []).length;
      const sentCount = sumexServices.length;
      if (xmlServiceCount < sentCount) {
        console.error(`[SendInvoice] Service count mismatch: sent ${sentCount}, XML contains ${xmlServiceCount} (${xmlServiceExCount} service_ex + ${xmlServiceCount - xmlServiceExCount} service). Sumex may have silently filtered services.`);
        return NextResponse.json({
          error: "Invoice XML incomplete",
          details: `Sent ${sentCount} service(s) but XML only contains ${xmlServiceCount}. Sumex may have rejected some services silently. Check service codes and amounts.`,
        }, { status: 500 });
      }
      console.log(`[SendInvoice] XML service count OK: ${xmlServiceCount}/${sentCount}`);
    }

    // Upload PDF to Supabase storage if generated
    let pdfStoragePath: string | null = null;
    if (sumexResult.pdfContent) {
      const pdfFileName = `invoice-sumex-${invoiceNumber}-${Date.now()}.pdf`;
      const pdfPath = `${patientData.id}/${pdfFileName}`;
      const { error: pdfUploadErr } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .upload(pdfPath, sumexResult.pdfContent, {
          contentType: "application/pdf",
          cacheControl: "3600",
          upsert: true,
        });
      if (pdfUploadErr) {
        console.warn(`[SendInvoice] PDF upload to storage failed: ${pdfUploadErr.message}`);
      } else {
        pdfStoragePath = pdfPath;
        console.log(`[SendInvoice] PDF uploaded to storage: ${pdfPath}`);
      }
    }

    // Create submission record
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("medidata_submissions")
      .insert({
        invoice_id: resolvedInvoiceId,
        patient_id: patientData.id,
        insurer_id: insuranceData?.insurer_id || null,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        invoice_amount: total,
        billing_type: billingType,
        law_type: lawType,
        xml_content: xmlContent,
        xml_version: '5.00',
        status: 'draft',
        created_by: null,
      })
      .select()
      .single();

    if (submissionError) {
      console.error("Error creating submission:", submissionError);
      return NextResponse.json(
        { error: "Failed to create invoice submission" },
        { status: 500 }
      );
    }

    // Record initial status in history
    await supabaseAdmin.from("medidata_submission_history").insert({
      submission_id: submission.id,
      previous_status: null,
      new_status: 'draft',
      changed_by: null,
    });

    // Send XML to MediData via proxy
    let medidataTransmissionStatus = 'draft';
    let medidataTransmissionError: string | null = null;
    let medidataTransmissionRef: string | null = null;

    const canTransmit = !!process.env.MEDIDATA_PROXY_API_KEY;

    if (canTransmit) {
      try {
        console.log(`[SendInvoice] Uploading to MediData proxy: invoice=${invoiceNumber}`);

        const uploadReceiverGln = billingType === 'TG' ? TG_NO_TRANSMISSION_GLN : resolvedReceiverGln;
        const uploadResult = await uploadInvoiceXml(
          xmlContent,
          `${invoiceNumber}.xml`,
          {
            source: "maisontoa",
            invoiceNumber,
            senderGln: senderGln || provGln,
            receiverGln: uploadReceiverGln,
            lawType,
            billingType,
          },
        );

        if (uploadResult.success) {
          medidataTransmissionStatus = 'pending';
          medidataTransmissionRef = uploadResult.transmissionReference;

          // Update submission with transmission details
          await supabaseAdmin
            .from("medidata_submissions")
            .update({
              status: 'pending',
              medidata_message_id: uploadResult.transmissionReference,
              medidata_transmission_date: new Date().toISOString(),
              medidata_response_code: String(uploadResult.statusCode),
            })
            .eq("id", submission.id);

          // Record status change
          await supabaseAdmin.from("medidata_submission_history").insert({
            submission_id: submission.id,
            previous_status: 'draft',
            new_status: 'pending',
            response_code: String(uploadResult.statusCode),
            changed_by: null,
            notes: `Transmitted via proxy. Ref: ${uploadResult.transmissionReference || 'unknown'}`,
          });

          console.log(`[SendInvoice] Invoice ${invoiceNumber} transmitted. Ref: ${uploadResult.transmissionReference}`);

          // ── Send patient copy for TP invoices (LAMal Art. 42 para. 3) ──
          if (billingType === "TP") {
            try {
              const copyInput: SumexInvoiceInput = {
                ...sumexInput,
                requestSubtype: RequestSubtype.Copy,
              };
              const copyResult = await buildInvoiceRequest(copyInput, { generatePdf: false });
              if (copyResult.success && copyResult.xmlContent) {
                const copyUpload = await uploadInvoiceXml(copyResult.xmlContent, `${invoiceNumber}-copy.xml`, {
                  source: "send-invoice-patient-copy",
                  invoiceNumber,
                  senderGln: senderGln || provGln,
                  receiverGln: resolvedReceiverGln,
                  requestSubtype: "copy",
                });
                if (copyUpload.success) {
                  console.log(`[SendInvoice] Patient copy sent for ${invoiceNumber}: ref=${copyUpload.transmissionReference}`);
                } else {
                  console.warn(`[SendInvoice] Patient copy upload failed for ${invoiceNumber}: ${copyUpload.errorMessage}`);
                }
              } else {
                console.warn(`[SendInvoice] Patient copy XML failed for ${invoiceNumber}: ${copyResult.error}`);
              }
            } catch (copyErr) {
              console.warn(`[SendInvoice] Patient copy error for ${invoiceNumber}:`, copyErr);
            }
          }
        } else {
          medidataTransmissionError = uploadResult.errorMessage || `Proxy upload failed (${uploadResult.statusCode})`;
          console.error("[SendInvoice] Proxy transmission failed:", medidataTransmissionError, uploadResult.rawResponse);

          // Record the error in history
          await supabaseAdmin.from("medidata_submission_history").insert({
            submission_id: submission.id,
            previous_status: 'draft',
            new_status: 'draft',
            response_code: String(uploadResult.statusCode),
            changed_by: null,
            notes: `Transmission failed: ${medidataTransmissionError}`,
          });
        }
      } catch (error) {
        medidataTransmissionError = `Proxy error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error("[SendInvoice] Proxy transmission error:", error);

        // Record the error in history
        await supabaseAdmin.from("medidata_submission_history").insert({
          submission_id: submission.id,
          previous_status: 'draft',
          new_status: 'draft',
          changed_by: null,
          notes: `Proxy error: ${medidataTransmissionError}`,
        });
      }
    } else {
      console.warn("[SendInvoice] MEDIDATA_PROXY_API_KEY not set — skipping transmission");
    }

    // Log rejected services if any
    if (sumexResult.rejectedServices && sumexResult.rejectedServices.length > 0) {
      console.warn(`[SendInvoice] ${sumexResult.rejectedServices.length} service(s) rejected by Sumex:`, sumexResult.rejectedServices);
    }

    return NextResponse.json({
      success: true,
      submission: {
        id: submission.id,
        invoiceNumber,
        status: medidataTransmissionStatus,
        messageId: medidataTransmissionRef,
        xmlGenerated: true,
        xmlVersion: '5.00',
        sumex1Schema: sumexResult.usedSchema,
        pdfGenerated: !!pdfStoragePath,
        pdfStoragePath,
        transmitted: medidataTransmissionStatus === 'pending',
        transmissionError: medidataTransmissionError,
        total,
        servicesRequested: sumexResult.servicesRequested,
        servicesAccepted: sumexResult.servicesAccepted,
        rejectedServices: sumexResult.rejectedServices,
        services: services.map(s => ({
          code: s.code,
          description: s.description,
          quantity: s.quantity,
          total: s.total,
        })),
      },
    });
  } catch (error) {
    console.error("Error in MediData send-invoice:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
