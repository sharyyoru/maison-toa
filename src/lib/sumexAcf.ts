/**
 * Sumex1 ACF Validator API Client
 *
 * Connects to the Sumex1 acfValidatorServer100 to provide live ACF
 * (Ambulatory Case Flatrate) catalog browsing, searching, and validation.
 *
 * Tariffs:
 * - 005 (ACF) — Ambulatory Case Flatrates (surgery flat rates)
 * - TMA (LKAAT) — Leistungskatalog Ambulante Akutversorgung Tarifierung
 *
 * API Pattern (same as tardocValidatorServer100):
 * - Properties (read): GET  Interface/Get{PropertyName}?p{Interface}=handle
 * - Methods:           POST Interface/{MethodName} with JSON body
 * - Factory:           GET  IAcfValidator/GetCreateAcfValidator (no params)
 * - Sub-interfaces:    GET  IAcfValidator/GetCreate{SubInterface}?pIAcfValidator=handle
 *
 * Interfaces: IAcfValidator, ISearch005, ISearchTMA, IValidate005, IValidateTMA
 */

const SUMEX_ACF_BASE_URL =
  process.env.SUMEX_ACF_URL ||
  "http://34.100.230.253:8080/acfValidatorServer100";

// Language enum matching Sumex1 API
export type AcfLanguage = 1 | 2 | 3; // 1=DE, 2=FR, 3=IT

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type AcfServiceRecord = {
  code: string;
  name: string;
  interpretation: string;
  chapterCode: string;
  chapterName: string;
  referenceCode: string;
  tariffType: string; // "005"
  tp: number; // flat rate CHF amount
  validFrom: string;
  validTo: string;
  serviceProperties: number;
};

export type AcfTariffInfo = {
  dbVersion: string;
  name: string;
  tariffType: string;
  dbDate: string;
  validFrom: number;
  validTo: number;
};

export type AcfSession = {
  validatorHandle: number;
  language: AcfLanguage;
  moduleVersion: string;
  tariff005: AcfTariffInfo | null;
  tariffTMA: AcfTariffInfo | null;
  createdAt: number;
};

// --------------------------------------------------------------------------
// Low-level API helpers
// --------------------------------------------------------------------------

async function acfGet<T = Record<string, unknown>>(
  path: string,
): Promise<T> {
  const url = `${SUMEX_ACF_BASE_URL}/${path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sumex ACF GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function acfPost<T = Record<string, unknown>>(
  iface: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${SUMEX_ACF_BASE_URL}/${iface}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Sumex ACF POST ${iface}/${method} failed: ${res.status} ${errBody}`);
  }
  return res.json() as Promise<T>;
}

// --------------------------------------------------------------------------
// Session Management
// --------------------------------------------------------------------------

let cachedAcfSession: AcfSession | null = null;
const ACF_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function isAcfSessionValid(session: AcfSession | null): session is AcfSession {
  if (!session) return false;
  return Date.now() - session.createdAt < ACF_SESSION_TTL_MS;
}

export async function getOrCreateAcfSession(
  language: AcfLanguage = 2,
): Promise<AcfSession> {
  if (isAcfSessionValid(cachedAcfSession) && cachedAcfSession.language === language) {
    return cachedAcfSession;
  }

  // Create validator via factory endpoint
  const factoryData = await acfGet<{ pIAcfValidator: number }>(
    "IAcfValidator/GetCreateAcfValidator",
  );
  const handle = factoryData.pIAcfValidator;

  // Open with language
  const openRes = await acfPost<{ pbStatus: boolean }>(
    "IAcfValidator",
    "Open",
    { pIAcfValidator: handle, eLanguage: language },
  );
  if (!openRes.pbStatus) throw new Error("Failed to open AcfValidator");

  // Get module version
  const moduleVersion = await acfGet<{ pbstrModuleVersion: string }>(
    `IAcfValidator/GetModuleVersion?pIAcfValidator=${handle}`,
  ).then((r) => r.pbstrModuleVersion).catch(() => "unknown");

  // Get tariff info for 005 and TMA
  const [tariff005, tariffTMA] = await Promise.all([
    acfPost<{
      pbStatus: boolean;
      pbstrDBVersion: string;
      pbstrName: string;
      pbstrTariffType: string;
      pdDBDate: string;
      plValidFrom: number;
      plValidTo: number;
    }>("IAcfValidator", "GetTariff005", { pIAcfValidator: handle })
      .then((r) => r.pbStatus ? {
        dbVersion: r.pbstrDBVersion,
        name: r.pbstrName,
        tariffType: r.pbstrTariffType,
        dbDate: r.pdDBDate,
        validFrom: r.plValidFrom,
        validTo: r.plValidTo,
      } : null)
      .catch(() => null),
    acfPost<{
      pbStatus: boolean;
      pbstrDBVersion: string;
      pbstrName: string;
      pbstrTariffType: string;
      pdDBDate: string;
      plValidFrom: number;
      plValidTo: number;
    }>("IAcfValidator", "GetTariffTMA", { pIAcfValidator: handle })
      .then((r) => r.pbStatus ? {
        dbVersion: r.pbstrDBVersion,
        name: r.pbstrName,
        tariffType: r.pbstrTariffType,
        dbDate: r.pdDBDate,
        validFrom: r.plValidFrom,
        validTo: r.plValidTo,
      } : null)
      .catch(() => null),
  ]);

  const session: AcfSession = {
    validatorHandle: handle,
    language,
    moduleVersion,
    tariff005,
    tariffTMA,
    createdAt: Date.now(),
  };

  cachedAcfSession = session;
  return session;
}

export function invalidateAcfSession(): void {
  cachedAcfSession = null;
}

// --------------------------------------------------------------------------
// ISearch005 — Browse & Search ACF Flat Rate Codes
// --------------------------------------------------------------------------

function mapAcfServiceRecord(raw: Record<string, unknown>): AcfServiceRecord {
  return {
    code: (raw.pbstrCode as string) ?? "",
    name: (raw.pbstrName as string) ?? "",
    interpretation: (raw.pbstrInterpretation as string) ?? "",
    chapterCode: (raw.pbstrChapterCode as string) ?? "",
    chapterName: (raw.pbstrChapterName as string) ?? "",
    referenceCode: (raw.pbstrReferenceCode as string) ?? "",
    tariffType: (raw.pbstrTariffType as string) ?? "005",
    tp: (raw.pdTP as number) ?? 0,
    validFrom: (raw.pdValidFrom as string) ?? "",
    validTo: (raw.pdValidTo as string) ?? "",
    serviceProperties: (raw.plServiceProperties as number) ?? 0,
  };
}

/**
 * Create a fresh ISearch005 handle for searching ACF codes.
 */
async function createSearch005(session: AcfSession): Promise<number> {
  const data = await acfGet<{ pISearch005: number }>(
    `IAcfValidator/GetCreateSearch005?pIAcfValidator=${session.validatorHandle}`,
  );
  return data.pISearch005;
}

/**
 * Search ACF flat rate codes.
 *
 * @param code - ACF code pattern (e.g. "C01*", "*" for all). Uses wildcard *.
 * @param chapterCode - Filter by chapter (e.g. "Cap01"). Empty = all chapters.
 * @param name - Filter by name substring. Empty = no name filter.
 * @param onlyValid - Only return currently valid services.
 * @param date - Reference date for validity check (ISO string).
 */
export async function searchAcf005(
  code: string = "*",
  chapterCode: string = "",
  name: string = "",
  onlyValid: boolean = true,
  date?: string,
  language: AcfLanguage = 2,
): Promise<{ count: number; services: AcfServiceRecord[] }> {
  const session = await getOrCreateAcfSession(language);
  const searchHandle = await createSearch005(session);

  const searchDate = date || new Date().toISOString().split("T")[0] + "T00:00:00";

  await acfPost("ISearch005", "SearchGeneral", {
    pISearch005: searchHandle,
    bstrCode: code,
    bstrChapterCode: chapterCode,
    bstrName: name,
    bOnlyValidServices: onlyValid,
    dDate: searchDate,
  });

  const countRes = await acfPost<{ pbStatus: boolean; plSize: number }>(
    "ISearch005",
    "GetRecordCount",
    { pISearch005: searchHandle },
  );

  const count = countRes.plSize ?? 0;
  if (count === 0) return { count: 0, services: [] };

  // Fetch in batches of 100 to avoid overloading
  const allServices: AcfServiceRecord[] = [];
  let offset = 0;
  while (offset < count) {
    const batchSize = Math.min(100, count - offset);
    const rawServices = await acfPost<Array<Record<string, unknown>>>(
      "ISearch005",
      "GetServices",
      { pISearch005: searchHandle, lStartRecordID: offset, lNumberOfRecords: batchSize },
    );

    if (Array.isArray(rawServices)) {
      const batch = rawServices
        .filter((r) => r.pbStatus)
        .map(mapAcfServiceRecord);
      allServices.push(...batch);
    }
    offset += batchSize;
  }

  return { count, services: allServices };
}

/**
 * Get all unique chapters from the ACF catalog.
 * Searches all services and extracts unique chapter codes/names.
 */
export async function getAcfChapters(
  language: AcfLanguage = 2,
): Promise<Array<{ code: string; name: string; count: number }>> {
  const { services } = await searchAcf005("*", "", "", true, undefined, language);

  const chapterMap = new Map<string, { name: string; count: number }>();
  for (const svc of services) {
    const existing = chapterMap.get(svc.chapterCode);
    if (existing) {
      existing.count++;
    } else {
      chapterMap.set(svc.chapterCode, { name: svc.chapterName, count: 1 });
    }
  }

  return Array.from(chapterMap.entries())
    .map(([code, info]) => ({ code, name: info.name, count: info.count }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

// --------------------------------------------------------------------------
// IValidate005 — Validate & Calculate ACF Service Pricing
// --------------------------------------------------------------------------
//
// Workflow (from Sumex1 API docs):
// 1. Initialize() — reset the validator
// 2. AddService() — add each service with parameters (code, date, side, etc.)
//    - Returns 0 on success, >0 if validation rule failed (service rejected)
//    - After adding, read back properties for calculated amount/TP
// 3. Finalize() — run final rule checks, returns count of ACF flat rates and total
// 4. GetFirstService/GetNextService/GetServices — iterate validated services
//
// Key parameters that affect pricing:
// - SideType: 0=none, 1=left, 2=right, 3=both (bilateral may double price)
// - ExternalFactor: multiplier applied to the amount
// - TPValue: tax point value (for ACF this is typically 1.0 since TP = CHF)
// - SessionNumber: groups related services together across days
// - ReferenceCode: can be used as ICD-10 container
// - Date: affects validity and pricing period

export type AcfSideType = 0 | 1 | 2 | 3; // 0=none, 1=left, 2=right, 3=both

export type AcfValidateServiceInput = {
  code: string;
  referenceCode?: string; // ICD-10 code
  quantity?: number;
  sessionNumber?: number;
  date?: string; // ISO date string
  side?: AcfSideType;
  externalFactor?: number;
  tp?: number; // The flat rate CHF amount (tax points = CHF for ACF)
  tpValue?: number; // Tax point multiplier (typically 1.0 for ACF since TP = CHF)
  amount?: number; // Pre-calculated amount (0 = let validator calculate)
  ignoreValidate?: boolean;
  hook?: number;
};

export type AcfValidatedService = {
  code: string;
  name: string;
  referenceCode: string;
  tariffType: string;
  quantity: number;
  tp: number;
  amount: number;
  tpValue: number;
  externalFactor: number;
  side: AcfSideType;
  sessionNumber: number;
};

export type AcfFinalizeResult = {
  count: number;
  totalAmount: number;
  success: boolean;
  addedServiceCount?: number;
  modifiedServiceCount?: number;
  deletedServiceCount?: number;
};

/**
 * Create a fresh IValidate005 handle.
 */
async function createValidate005(session: AcfSession): Promise<number> {
  const data = await acfGet<{ pIValidate005: number }>(
    `IAcfValidator/GetCreateValidate005?pIAcfValidator=${session.validatorHandle}`,
  );
  return data.pIValidate005;
}

/**
 * Initialize the IValidate005 validator (reset state for a new validation).
 */
export async function initializeValidate005(
  language: AcfLanguage = 2,
): Promise<{ validateHandle: number }> {
  const session = await getOrCreateAcfSession(language);
  const handle = await createValidate005(session);

  await acfPost("IValidate005", "Initialize", {
    pIValidate005: handle,
  });

  return { validateHandle: handle };
}

/**
 * Add a service to the IValidate005 validator.
 *
 * Returns the validation result code (0 = success, >0 = rejected).
 * After adding, reads back the calculated Amount and TP from properties.
 */
export async function addServiceToValidate005(
  validateHandle: number,
  input: AcfValidateServiceInput,
): Promise<{
  resultCode: number;
  success: boolean;
  abortInfo: string | null;
  calculatedAmount: number;
  calculatedTP: number;
}> {
  const dateStr = input.date || new Date().toISOString().split("T")[0] + "T00:00:00";

  // Use raw fetch to handle 400 validation rejections without throwing
  const addUrl = `${SUMEX_ACF_BASE_URL}/IValidate005/AddService`;
  const addBody = {
    pIValidate005: validateHandle,
    bstrCode: input.code,
    bstrReferenceCode: input.referenceCode || "",
    dQuantity: input.quantity ?? 1,
    lSessionNumber: input.sessionNumber ?? 1,
    dDate: dateStr,
    eSide: input.side ?? 0,
    dExternalFactor: input.externalFactor ?? 1.0,
    dTP: input.tp ?? 0,
    dTPValue: input.tpValue ?? 1.0,
    dAmount: input.amount ?? 0,
    eIgnoreValidate: input.ignoreValidate ? 1 : 0,
    lHook: input.hook ?? 0,
  };
  const addRes = await fetch(addUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(addBody),
    cache: "no-store",
  });

  // Handle 400 as a validation rejection (not a server error)
  if (!addRes.ok) {
    const errBody = await addRes.json().catch(() => ({})) as Record<string, unknown>;
    const abortText = (errBody.pbstrAbortText as string) || null;
    const abortCode = (errBody.plAbortCode as number) || 0;
    return {
      resultCode: abortCode || 1,
      success: false,
      abortInfo: abortText,
      calculatedAmount: 0,
      calculatedTP: 0,
    };
  }

  const result = await addRes.json() as { pbStatus: boolean; plResult?: number };
  const resultCode = result.plResult ?? (result.pbStatus ? 0 : 1);

  // If validation failed, get abort info
  let abortInfo: string | null = null;
  if (resultCode !== 0) {
    try {
      const info = await acfPost<{ pbstrAbortInfo: string }>(
        "IValidate005",
        "GetAbortInfo",
        { pIValidate005: validateHandle },
      );
      abortInfo = info.pbstrAbortInfo || null;
    } catch { /* ignore */ }
  }

  // Read back calculated values
  let calculatedAmount = 0;
  let calculatedTP = 0;
  try {
    const amountRes = await acfGet<{ pdAmount: number }>(
      `IValidate005/GetAmount?pIValidate005=${validateHandle}`,
    );
    calculatedAmount = amountRes.pdAmount ?? 0;
  } catch { /* ignore */ }
  try {
    const tpRes = await acfGet<{ pdTP: number }>(
      `IValidate005/GetTP?pIValidate005=${validateHandle}`,
    );
    calculatedTP = tpRes.pdTP ?? 0;
  } catch { /* ignore */ }

  return {
    resultCode,
    success: resultCode === 0,
    abortInfo,
    calculatedAmount,
    calculatedTP,
  };
}

/**
 * Finalize the validation. Call after all services have been added.
 * Returns the number of ACF flat rate codes and total summed amount.
 * Also retrieves counts of services added/modified/deleted by the validator.
 */
export async function finalizeValidate005(
  validateHandle: number,
): Promise<AcfFinalizeResult> {
  const result = await acfPost<{
    pbStatus: boolean;
    plNumberOfACFs?: number;
    pdSumAmount?: number;
  }>(
    "IValidate005",
    "Finalize",
    { pIValidate005: validateHandle },
  );

  // Try to get service change counts (validator may add/modify/delete services)
  let addedCount = 0;
  let modifiedCount = 0;
  let deletedCount = 0;

  try {
    const addedRes = await acfGet<{ plAddedServiceCount?: number }>(
      `IValidate005/GetAddedServiceCount?pIValidate005=${validateHandle}`,
    );
    addedCount = addedRes.plAddedServiceCount ?? 0;
  } catch { /* Property may not exist */ }

  try {
    const modifiedRes = await acfGet<{ plModifiedServiceCount?: number }>(
      `IValidate005/GetModifiedServiceCount?pIValidate005=${validateHandle}`,
    );
    modifiedCount = modifiedRes.plModifiedServiceCount ?? 0;
  } catch { /* Property may not exist */ }

  try {
    const deletedRes = await acfGet<{ plDeletedServiceCount?: number }>(
      `IValidate005/GetDeletedServiceCount?pIValidate005=${validateHandle}`,
    );
    deletedCount = deletedRes.plDeletedServiceCount ?? 0;
  } catch { /* Property may not exist */ }

  return {
    count: result.plNumberOfACFs ?? 0,
    totalAmount: result.pdSumAmount ?? 0,
    success: result.pbStatus ?? false,
    addedServiceCount: addedCount,
    modifiedServiceCount: modifiedCount,
    deletedServiceCount: deletedCount,
  };
}

/**
 * Get all validated services after Finalize.
 * Returns the list of services as modified/grouped by the validator.
 */
export async function getValidatedServices005(
  validateHandle: number,
): Promise<AcfValidatedService[]> {
  const services: AcfValidatedService[] = [];

  // Try GetFirstService / GetNextService iteration
  try {
    const first = await acfPost<Record<string, unknown>>(
      "IValidate005",
      "GetFirstService",
      { pIValidate005: validateHandle },
    );

    if (first.pbStatus) {
      services.push(mapValidatedService(first));

      // Iterate remaining
      let hasMore = true;
      while (hasMore) {
        try {
          const next = await acfPost<Record<string, unknown>>(
            "IValidate005",
            "GetNextService",
            { pIValidate005: validateHandle },
          );
          if (next.pbStatus) {
            services.push(mapValidatedService(next));
          } else {
            hasMore = false;
          }
        } catch {
          hasMore = false;
        }
      }
    }
  } catch { /* GetFirstService may not exist or return empty */ }

  return services;
}

function mapValidatedService(raw: Record<string, unknown>): AcfValidatedService {
  return {
    code: (raw.pbstrCode as string) ?? "",
    name: (raw.pbstrName as string) ?? "",
    referenceCode: (raw.pbstrReferenceCode as string) ?? "",
    tariffType: (raw.pbstrTariffType as string) ?? "005",
    quantity: (raw.pdQuantity as number) ?? 1,
    tp: (raw.pdTP as number) ?? 0,
    amount: (raw.pdAmount as number) ?? 0,
    tpValue: (raw.pdTPValue as number) ?? 1.0,
    externalFactor: (raw.pdExternalFactor as number) ?? 1.0,
    side: ((raw.peSide ?? raw.eSide ?? 0) as AcfSideType),
    sessionNumber: (raw.plSessionNumber as number) ?? 1,
  };
}

/**
 * Get ACF session/tariff info for display purposes.
 */
export async function getAcfSessionInfo(
  language: AcfLanguage = 2,
): Promise<{
  moduleVersion: string;
  language: AcfLanguage;
  tariff005: AcfTariffInfo | null;
  tariffTMA: AcfTariffInfo | null;
}> {
  const session = await getOrCreateAcfSession(language);
  return {
    moduleVersion: session.moduleVersion,
    language: session.language,
    tariff005: session.tariff005,
    tariffTMA: session.tariffTMA,
  };
}

// --------------------------------------------------------------------------
// ISearchTMA — Browse & Search TMA Gesture Codes
// --------------------------------------------------------------------------
//
// TMA (LKAAT) codes are the surgical gesture codes that doctors select.
// They are INPUT to the grouper which produces ACF flat rate codes (005).
// TMA codes have TP=0 — they have no direct price.
//
// TMAType enum:
//   0 = enTMATypeAny (no filter)
//   1 = enTMATypeIsPOR (main trigger P in OR group)
//   2 = enTMATypeIsPNotOR (main trigger P not in OR group)
//   3 = enTMATypeIsP (filter: P(OR) + P(notOR))
//   4 = enTMATypeIsPZ (additional service PZ, needs P as reference)
//   5 = enTMATypeIsE (TARDOC-like main service E)
//   6 = enTMATypeIsEZ (TARDOC-like additional service EZ, needs E as reference)
//   7 = enTMATypeIsN (neither E nor P, e.g. hemodialysis)
//   8 = enTMATypeIsPandE (filter: both P and E)
//
// ServiceProperties bit flags:
//   1   = HasSideDependency
//   256 = NeedsRefCode
//   512 = IsGrouperRelevant
//   2048 = IsContactRelated

export type TmaType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const TMA_TYPE_LABELS: Record<TmaType, string> = {
  0: "Any",
  1: "P(OR) — Main trigger (OR group)",
  2: "P(notOR) — Main trigger (not OR)",
  3: "P — All main triggers",
  4: "PZ — Additional (needs P ref)",
  5: "E — TARDOC-like main",
  6: "EZ — TARDOC-like additional (needs E ref)",
  7: "N — Other",
  8: "P+E — Main triggers + TARDOC-like",
};

export type TmaServiceRecord = {
  code: string;
  name: string;
  interpretation: string;
  chapterCode: string;
  chapterName: string;
  referenceCode: string;
  tariffType: string; // "TMA"
  tmaType: TmaType;
  validFrom: string;
  validTo: string;
  serviceProperties: number;
  // Derived flags from serviceProperties
  hasSideDependency: boolean;
  needsRefCode: boolean;
  isGrouperRelevant: boolean;
};

function mapTmaServiceRecord(raw: Record<string, unknown>): TmaServiceRecord {
  const props = (raw.plServiceProperties as number) ?? 0;
  return {
    code: (raw.pbstrCode as string) ?? "",
    name: (raw.pbstrName as string) ?? "",
    interpretation: (raw.pbstrInterpretation as string) ?? "",
    chapterCode: (raw.pbstrChapterCode as string) ?? "",
    chapterName: (raw.pbstrChapterName as string) ?? "",
    referenceCode: (raw.pbstrReferenceCode as string) ?? "",
    tariffType: (raw.pbstrTariffType as string) ?? "TMA",
    tmaType: ((raw.peTMAType as number) ?? 0) as TmaType,
    validFrom: (raw.pdValidFrom as string) ?? "",
    validTo: (raw.pdValidTo as string) ?? "",
    serviceProperties: props,
    hasSideDependency: (props & 1) !== 0,
    needsRefCode: (props & 256) !== 0,
    isGrouperRelevant: (props & 512) !== 0,
  };
}

async function createSearchTMA(session: AcfSession): Promise<number> {
  const data = await acfGet<{ pISearchTMA: number }>(
    `IAcfValidator/GetCreateSearchTMA?pIAcfValidator=${session.validatorHandle}`,
  );
  return data.pISearchTMA;
}

/**
 * Search TMA gesture codes in the LKAAT catalog.
 *
 * @param code - TMA code pattern (e.g. "C02*", "*" for all). Supports wildcards.
 * @param chapterCode - Filter by chapter (e.g. "Cap02"). Empty = all.
 * @param name - Filter by name substring. Empty = no filter.
 * @param tmaType - Filter by TMA type. 0 = any (no filter).
 * @param onlyGrouperRelevant - Only return grouper-relevant services.
 * @param date - Reference date (ISO string).
 */
export async function searchTma(
  code: string = "*",
  chapterCode: string = "",
  name: string = "",
  tmaType: TmaType = 0,
  onlyGrouperRelevant: boolean = false,
  date?: string,
  language: AcfLanguage = 2,
): Promise<{ count: number; services: TmaServiceRecord[] }> {
  const session = await getOrCreateAcfSession(language);
  const searchHandle = await createSearchTMA(session);

  const searchDate = date || new Date().toISOString().split("T")[0] + "T00:00:00";

  await acfPost("ISearchTMA", "SearchGeneral", {
    pISearchTMA: searchHandle,
    dDate: searchDate,
    eTMAType: tmaType,
    eOnlyGrouperRelevant: onlyGrouperRelevant ? 1 : 0,
    bstrCode: code,
    bstrName: name,
    bstrChapterCode: chapterCode,
  });

  const countRes = await acfPost<{ pbStatus: boolean; plSize: number }>(
    "ISearchTMA",
    "GetRecordCount",
    { pISearchTMA: searchHandle },
  );

  const count = countRes.plSize ?? 0;
  if (count === 0) return { count: 0, services: [] };

  const allServices: TmaServiceRecord[] = [];
  let hasMore = true;
  while (hasMore) {
    try {
      const rawServices = await acfPost<Array<Record<string, unknown>>>(
        "ISearchTMA",
        "GetServices",
        { pISearchTMA: searchHandle },
      );
      if (Array.isArray(rawServices) && rawServices.length > 0) {
        const batch = rawServices
          .filter((r) => r.pbStatus)
          .map(mapTmaServiceRecord);
        allServices.push(...batch);
        if (batch.length < 200) hasMore = false; // API returns max 200 per call
      } else {
        hasMore = false;
      }
    } catch {
      hasMore = false;
    }
  }

  return { count, services: allServices };
}

/**
 * Get all unique chapters from the TMA catalog.
 */
export async function getTmaChapters(
  language: AcfLanguage = 2,
): Promise<Array<{ code: string; name: string; count: number }>> {
  // Search all P-type gesture codes (main triggers) which are grouper-relevant
  const { services } = await searchTma("*", "", "", 0, true, undefined, language);

  const chapterMap = new Map<string, { name: string; count: number }>();
  for (const svc of services) {
    const existing = chapterMap.get(svc.chapterCode);
    if (existing) {
      existing.count++;
    } else {
      chapterMap.set(svc.chapterCode, { name: svc.chapterName, count: 1 });
    }
  }

  return Array.from(chapterMap.entries())
    .map(([code, info]) => ({ code, name: info.name, count: info.count }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

// --------------------------------------------------------------------------
// IValidateTMA — Grouper: TMA Gesture Codes → ACF Flat Rate Codes
// --------------------------------------------------------------------------
//
// Workflow:
// 1. Initialize — reset
// 2. AddACFBase — set diagnostic context (ICD, patient sex/age, law)
// 3. AddService — add TMA gesture code(s)
// 4. Finalize — run grouper, returns ACF code(s)
// 5. GetFirstACFBase/GetNextACFBase — read grouped ACF results
// 6. GetFirstService/GetNextService — read validated TMA services
//
// Key constraints:
// - SessionNumber must be > 15
// - Side is MANDATORY for codes with HasSideDependency flag

export type TmaGrouperInput = {
  icdCode: string;
  patientSex: 0 | 1; // 0=male, 1=female
  patientBirthdate: string; // ISO date
  law?: number; // 0=KVG, 1=UVG, 2=MVG, 3=IVG, 4=VVG
  sessionNumber?: number; // must be > 15, defaults to 100
  services: Array<{
    code: string;
    referenceCode?: string;
    quantity?: number;
    date?: string;
    side?: AcfSideType; // 0=none, 1=left, 2=right, 3=both
    name?: string;
    ignoreValidate?: boolean;
    hook?: number;
  }>;
};

export type TmaGrouperACFResult = {
  sessionNumber: number;
  icdCode: string;
  chapterCode: string;
  acfCode: string;
  groupingSuccess: boolean;
  groupingTries: number;
  patientSex: number;
  patientBirthdate: string;
  law: number;
  firstDate: string;
};

export type TmaGrouperServiceResult = {
  code: string;
  name: string;
  referenceCode: string;
  tariffType: string;
  tmaType: TmaType;
  quantity: number;
  side: AcfSideType;
  externalFactor: number;
  sessionNumber: number;
  hook: number;
  date: string;
};

export type TmaGrouperResult = {
  success: boolean;
  groupingStatusList: string;
  numACF: number;
  acfBases: TmaGrouperACFResult[];
  services: TmaGrouperServiceResult[];
  // The resulting ACF flat rate codes with their pricing (looked up from ISearch005)
  acfCodes: Array<{
    code: string;
    name: string;
    tp: number; // CHF flat rate amount
    chapterCode: string;
    chapterName: string;
  }>;
  errors: string[];
};

async function createValidateTMA(session: AcfSession): Promise<number> {
  const data = await acfGet<{ pIValidateTMA: number }>(
    `IAcfValidator/GetCreateValidateTMA?pIAcfValidator=${session.validatorHandle}`,
  );
  return data.pIValidateTMA;
}

/**
 * Run the TMA grouper: takes gesture codes + ICD diagnostic → produces ACF flat rate codes.
 *
 * This is the core function that converts TMA gesture codes into billable ACF flat rate codes.
 */
export async function runTmaGrouper(
  input: TmaGrouperInput,
  language: AcfLanguage = 2,
): Promise<TmaGrouperResult> {
  const session = await getOrCreateAcfSession(language);
  const handle = await createValidateTMA(session);
  const errors: string[] = [];

  const sessionNum = input.sessionNumber ?? 100;
  const dateStr = new Date().toISOString().split("T")[0] + "T00:00:00";

  // 1. Initialize
  await acfPost("IValidateTMA", "Initialize", { pIValidateTMA: handle });

  // 2. AddACFBase — set diagnostic context
  const addBaseUrl = `${SUMEX_ACF_BASE_URL}/IValidateTMA/AddACFBase`;
  const addBaseRes = await fetch(addBaseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pIValidateTMA: handle,
      lSessionNumber: sessionNum,
      bstrICDCode: input.icdCode,
      ePatientSex: input.patientSex,
      dPatientBirthdate: input.patientBirthdate,
      eLaw: input.law ?? 0,
    }),
    cache: "no-store",
  });

  if (!addBaseRes.ok) {
    const errBody = await addBaseRes.json().catch(() => ({})) as Record<string, unknown>;
    const errText = (errBody.pbstrAbortText as string) || `AddACFBase failed: ${addBaseRes.status}`;
    errors.push(errText);
    return { success: false, groupingStatusList: "", numACF: 0, acfBases: [], services: [], acfCodes: [], errors };
  }

  // 3. AddService — add each TMA gesture code
  for (const svc of input.services) {
    const svcDate = svc.date || dateStr;
    const addSvcUrl = `${SUMEX_ACF_BASE_URL}/IValidateTMA/AddService`;
    const addSvcRes = await fetch(addSvcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pIValidateTMA: handle,
        bstrCode: svc.code,
        bstrReferenceCode: svc.referenceCode || "",
        dQuantity: svc.quantity ?? 1,
        lSessionNumber: sessionNum,
        dDate: svcDate,
        eSide: svc.side ?? 0,
        bstrName: svc.name || "",
        eIgnoreValidate: svc.ignoreValidate ? 1 : 0,
        lHook: svc.hook ?? 0,
      }),
      cache: "no-store",
    });

    if (!addSvcRes.ok) {
      const errBody = await addSvcRes.json().catch(() => ({})) as Record<string, unknown>;
      const errText = (errBody.pbstrAbortText as string) || `AddService ${svc.code} failed: ${addSvcRes.status}`;
      errors.push(errText);
      // Continue adding remaining services — don't abort entirely
    }
  }

  // 4. Finalize — run the grouper
  const finalizeUrl = `${SUMEX_ACF_BASE_URL}/IValidateTMA/Finalize`;
  const finalizeRes = await fetch(finalizeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pIValidateTMA: handle }),
    cache: "no-store",
  });

  let groupingStatusList = "";
  let numACF = 0;
  let finalizeSuccess = false;

  if (finalizeRes.ok) {
    const finalData = await finalizeRes.json() as Record<string, unknown>;
    groupingStatusList = (finalData.pbstrGroupingStatusList as string) || "";
    numACF = (finalData.plNumACF as number) || 0;
    finalizeSuccess = (finalData.pbStatus as boolean) || false;
  } else {
    const errBody = await finalizeRes.json().catch(() => ({})) as Record<string, unknown>;
    const errText = (errBody.pbstrAbortText as string) || `Finalize failed: ${finalizeRes.status}`;
    errors.push(errText);
  }

  // 5. Read ACFBase results (grouped ACF codes)
  const acfBases: TmaGrouperACFResult[] = [];
  try {
    const first = await acfPost<Record<string, unknown>>(
      "IValidateTMA", "GetFirstACFBase", { pIValidateTMA: handle },
    );
    if (first.pbStatus) {
      acfBases.push(mapAcfBase(first));
      let hasMore = true;
      while (hasMore) {
        try {
          const next = await acfPost<Record<string, unknown>>(
            "IValidateTMA", "GetNextACFBase", { pIValidateTMA: handle },
          );
          if (next.pbStatus) {
            acfBases.push(mapAcfBase(next));
          } else {
            hasMore = false;
          }
        } catch { hasMore = false; }
      }
    }
  } catch { /* no ACF bases */ }

  // 6. Read validated TMA services
  const services: TmaGrouperServiceResult[] = [];
  try {
    const first = await acfPost<Record<string, unknown>>(
      "IValidateTMA", "GetFirstService", { pIValidateTMA: handle },
    );
    if (first.pbStatus) {
      services.push(mapTmaGrouperService(first));
      let hasMore = true;
      while (hasMore) {
        try {
          const next = await acfPost<Record<string, unknown>>(
            "IValidateTMA", "GetNextService", { pIValidateTMA: handle },
          );
          if (next.pbStatus) {
            services.push(mapTmaGrouperService(next));
          } else {
            hasMore = false;
          }
        } catch { hasMore = false; }
      }
    }
  } catch { /* no services */ }

  // 7. Look up pricing for each successful ACF code via ISearch005
  const acfCodes: TmaGrouperResult["acfCodes"] = [];
  for (const base of acfBases) {
    if (base.groupingSuccess && base.acfCode) {
      try {
        const { services: acfServices } = await searchAcf005(
          base.acfCode, "", "", true, undefined, language,
        );
        if (acfServices.length > 0) {
          const svc = acfServices[0];
          acfCodes.push({
            code: svc.code,
            name: svc.name,
            tp: svc.tp,
            chapterCode: svc.chapterCode,
            chapterName: svc.chapterName,
          });
        } else {
          acfCodes.push({
            code: base.acfCode,
            name: "",
            tp: 0,
            chapterCode: base.chapterCode,
            chapterName: "",
          });
        }
      } catch {
        acfCodes.push({
          code: base.acfCode,
          name: "",
          tp: 0,
          chapterCode: base.chapterCode,
          chapterName: "",
        });
      }
    }
  }

  return {
    success: finalizeSuccess && errors.length === 0,
    groupingStatusList,
    numACF,
    acfBases,
    services,
    acfCodes,
    errors,
  };
}

function mapAcfBase(raw: Record<string, unknown>): TmaGrouperACFResult {
  return {
    sessionNumber: (raw.plSessionNumber as number) ?? 0,
    icdCode: (raw.pbstrICDCode as string) ?? "",
    chapterCode: (raw.pbstrChapterCode as string) ?? "",
    acfCode: (raw.pbstrACFCode as string) ?? "",
    groupingSuccess: (raw.peGroupingSuccess as number) === 1,
    groupingTries: (raw.plGroupingTries as number) ?? 0,
    patientSex: (raw.pePatientSex as number) ?? 0,
    patientBirthdate: (raw.pdPatientBirthdate as string) ?? "",
    law: (raw.peLaw as number) ?? 0,
    firstDate: (raw.pdFirstDate as string) ?? "",
  };
}

function mapTmaGrouperService(raw: Record<string, unknown>): TmaGrouperServiceResult {
  return {
    code: (raw.pbstrCode as string) ?? "",
    name: (raw.pbstrName as string) ?? "",
    referenceCode: (raw.pbstrReferenceCode as string) ?? "",
    tariffType: (raw.pbstrTariffType as string) ?? "TMA",
    tmaType: ((raw.peTMAType as number) ?? 0) as TmaType,
    quantity: (raw.pdQuantity as number) ?? 1,
    side: ((raw.peSide as number) ?? 0) as AcfSideType,
    externalFactor: (raw.pdExternalFactor as number) ?? 1,
    sessionNumber: (raw.plSessionNumber as number) ?? 0,
    hook: (raw.plHook as number) ?? 0,
    date: (raw.pdDate as string) ?? "",
  };
}
