/**
 * Sumex1 TARDOC Validator API Client
 *
 * Connects to the Sumex1 tardocValidatorServer hosted on a Windows VM
 * to provide live TARDOC catalog browsing, service searching, and validation.
 *
 * API Pattern:
 * - Properties (read): GET  Interface/Get{PropertyName}?p{Interface}=handle
 * - Methods:           POST Interface/{MethodName} with JSON body
 * - Factory:           GET  ITardocValidator/GetCreate{SubInterface}?pITardocValidator=handle
 *
 * Interfaces: ITardocValidator, ICatalog, ISearch, ITardocInput, IUtility, IValidate
 */

const SUMEX_BASE_URL =
  process.env.SUMEX_TARDOC_URL ||
  "http://34.100.230.253:8080/tardocValidatorServer100";

// Language enum matching Sumex1 API
export type SumexLanguage = 1 | 2 | 3; // 1=DE, 2=FR, 3=IT

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type TardocChapter = {
  code: string;
  name: string;
};

export type TardocServiceRecord = {
  recordId: number;
  code: string;
  name: string;
  chapter: string;
  section: string;
  serviceType: string;
  unit: string;
  unitCode: string;
  unitQuantity: number;
  tpMT: number; // Tax points Medical (doctor)
  tpTT: number; // Tax points Technical (infrastructure)
  internalFactorMT: number;
  internalFactorTT: number;
  serviceMin: number;
  placeMin: number;
  changeMin: number;
  findingsMin: number;
  anaesthesiaMin: number;
  prePostServiceMin: number;
  mechanicCode: string;
  kvgObligationCode: string;
  masterCode: string;
  additionalServiceReferenceCode: string;
  anaesthesiaInterventionClass: string;
  treatmentType: string;
  medicalInfo: string;
  technicalInfo: string;
  validFrom: string;
  validTo: string;
  sexRequired: number;
  sideRequired: number;
};

export type SumexSession = {
  validatorHandle: number;
  catalogHandle: number | null;
  searchHandle: number | null;
  language: SumexLanguage;
  dbVersion: string;
  dbVersionDate: string;
  moduleVersion: string;
  createdAt: number;
};

// --------------------------------------------------------------------------
// Low-level API helpers
// --------------------------------------------------------------------------

async function getProperty<T = Record<string, unknown>>(
  iface: string,
  property: string,
  handle: number,
  handleParam?: string,
): Promise<T> {
  const param = handleParam || `p${iface}`;
  const url = `${SUMEX_BASE_URL}/${iface}/Get${property}?${param}=${handle}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sumex GET ${iface}/Get${property} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function callMethod<T = Record<string, unknown>>(
  iface: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${SUMEX_BASE_URL}/${iface}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sumex POST ${iface}/${method} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function createSubInterface(
  validatorHandle: number,
  subInterface: string,
): Promise<number> {
  const data = await getProperty<Record<string, number>>(
    "ITardocValidator",
    `Create${subInterface}`,
    validatorHandle,
  );
  const key = `pI${subInterface}`;
  if (!(key in data)) throw new Error(`Missing ${key} in response: ${JSON.stringify(data)}`);
  return data[key];
}

// --------------------------------------------------------------------------
// Session Management
// --------------------------------------------------------------------------

let cachedSession: SumexSession | null = null;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function isSessionValid(session: SumexSession | null): session is SumexSession {
  if (!session) return false;
  return Date.now() - session.createdAt < SESSION_TTL_MS;
}

export async function getOrCreateSession(
  language: SumexLanguage = 2,
): Promise<SumexSession> {
  if (isSessionValid(cachedSession) && cachedSession.language === language) {
    return cachedSession;
  }

  // Create validator via factory endpoint (no instance param needed)
  const factoryRes = await fetch(
    `${SUMEX_BASE_URL}/ITardocValidator/GetCreateTardocValidator`,
    { cache: "no-store" },
  );
  if (!factoryRes.ok) throw new Error("Failed to create TardocValidator");
  const factoryData = (await factoryRes.json()) as { pITardocValidator: number };
  const validatorHandle = factoryData.pITardocValidator;

  // Open with language
  const openRes = await callMethod<{ pbStatus: boolean }>(
    "ITardocValidator",
    "Open",
    { pITardocValidator: validatorHandle, eLanguage: language },
  );
  if (!openRes.pbStatus) throw new Error("Failed to open TardocValidator");

  // Get version info
  const [dbVersion, dbVersionDate, moduleVersion] = await Promise.all([
    getProperty<{ pbstrDBVersion: string }>("ITardocValidator", "DBVersion", validatorHandle)
      .then((r) => r.pbstrDBVersion)
      .catch(() => "unknown"),
    getProperty<{ pdDBVersionDate: string }>("ITardocValidator", "DBVersionDate", validatorHandle)
      .then((r) => r.pdDBVersionDate)
      .catch(() => "unknown"),
    getProperty<{ pbstrModuleVersion: string }>("ITardocValidator", "ModuleVersion", validatorHandle)
      .then((r) => r.pbstrModuleVersion)
      .catch(() => "unknown"),
  ]);

  const session: SumexSession = {
    validatorHandle,
    catalogHandle: null,
    searchHandle: null,
    language,
    dbVersion,
    dbVersionDate,
    moduleVersion,
    createdAt: Date.now(),
  };

  cachedSession = session;
  return session;
}

async function ensureCatalog(session: SumexSession): Promise<number> {
  if (session.catalogHandle) return session.catalogHandle;
  const handle = await createSubInterface(session.validatorHandle, "Catalog");
  session.catalogHandle = handle;
  return handle;
}

async function ensureSearch(session: SumexSession): Promise<number> {
  if (session.searchHandle) return session.searchHandle;
  const handle = await createSubInterface(session.validatorHandle, "Search");
  session.searchHandle = handle;
  return handle;
}

// --------------------------------------------------------------------------
// Catalog Browsing
// --------------------------------------------------------------------------

export async function getChapters(
  parentCode: string = "",
  language: SumexLanguage = 2,
): Promise<TardocChapter[]> {
  const session = await getOrCreateSession(language);
  const catalogHandle = await ensureCatalog(session);

  const data = await callMethod<
    Array<{ pbStatus: boolean; pbstrCode: string; pbstrName: string }>
  >("ICatalog", "GetChapters", {
    pICatalog: catalogHandle,
    bstrCode: parentCode,
  });

  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => item.pbStatus)
    .map((item) => ({
      code: item.pbstrCode,
      name: item.pbstrName.trim(),
    }));
}

export async function getSections(
  language: SumexLanguage = 2,
): Promise<Array<{ code: string; name: string }>> {
  const session = await getOrCreateSession(language);
  const catalogHandle = await ensureCatalog(session);

  const data = await callMethod<
    Array<{ pbStatus: boolean; pbstrCode: string; pbstrName: string }>
  >("ICatalog", "GetSections", { pICatalog: catalogHandle });

  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => item.pbStatus)
    .map((item) => ({ code: item.pbstrCode, name: item.pbstrName.trim() }));
}

export async function getServiceGroups(
  language: SumexLanguage = 2,
): Promise<Array<{ code: string; name: string }>> {
  const session = await getOrCreateSession(language);
  const catalogHandle = await ensureCatalog(session);

  const data = await callMethod<
    Array<{ pbStatus: boolean; pbstrCode: string; pbstrName: string }>
  >("ICatalog", "GetServiceGroups", { pICatalog: catalogHandle });

  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => item.pbStatus)
    .map((item) => ({ code: item.pbstrCode, name: item.pbstrName.trim() }));
}

// --------------------------------------------------------------------------
// Service Search
// --------------------------------------------------------------------------

function mapServiceRecord(
  raw: Record<string, unknown>,
): TardocServiceRecord {
  return {
    recordId: (raw.plRecordID as number) ?? 0,
    code: (raw.pbstrCode as string) ?? "",
    name: (raw.pbstrName255 as string) ?? "",
    chapter: (raw.pbstrChapter as string) ?? "",
    section: (raw.pbstrSection as string) ?? "",
    serviceType: (raw.pbstrServiceType as string) ?? "",
    unit: (raw.pbstrUnit as string) ?? "",
    unitCode: (raw.pbstrUnitCode as string) ?? "",
    unitQuantity: (raw.pdUnitQuantity as number) ?? 0,
    tpMT: (raw.pdTP_MT as number) ?? 0,
    tpTT: (raw.pdTP_TT as number) ?? 0,
    internalFactorMT: (raw.pdInternalFactor_MT as number) ?? 1,
    internalFactorTT: (raw.pdInternalFactor_TT as number) ?? 1,
    serviceMin: (raw.pdServiceMin as number) ?? 0,
    placeMin: (raw.pdPlaceMin as number) ?? 0,
    changeMin: (raw.pdChangeMin as number) ?? 0,
    findingsMin: (raw.pdFindingsMin as number) ?? 0,
    anaesthesiaMin: (raw.pdAnaesthesiaMin as number) ?? 0,
    prePostServiceMin: (raw.pdPrePostServiceMin as number) ?? 0,
    mechanicCode: (raw.pbstrMechanicCode as string) ?? "",
    kvgObligationCode: (raw.pbstrKVGObligationCode as string) ?? "",
    masterCode: (raw.pbstrMasterCode as string) ?? "",
    additionalServiceReferenceCode:
      (raw.pbstrAdditionalServiceReferenceCode as string) ?? "",
    anaesthesiaInterventionClass:
      (raw.pbstrAnaesthesiaInterventionClass as string) ?? "",
    treatmentType: (raw.pbstrTreatmentType as string) ?? "",
    medicalInfo: (raw.pbstrMedicalInfo as string) ?? "",
    technicalInfo: (raw.pbstrTechnicalInfo as string) ?? "",
    validFrom: (raw.pdValidFrom as string) ?? "",
    validTo: (raw.pdValidTo as string) ?? "",
    sexRequired: (raw.peSexRequired as number) ?? 0,
    sideRequired: (raw.peSideRequired as number) ?? 0,
  };
}

export async function searchByCode(
  code: string,
  onlyMainServices: boolean = false,
  language: SumexLanguage = 2,
): Promise<{ count: number; services: TardocServiceRecord[] }> {
  const session = await getOrCreateSession(language);
  // Create a fresh search for each query to avoid stale state
  const searchHandle = await createSubInterface(session.validatorHandle, "Search");

  await callMethod("ISearch", "SearchCode", {
    pISearch: searchHandle,
    bstrCode: code,
    eOnlyMainServices: onlyMainServices ? 1 : 0,
  });

  const countRes = await callMethod<{ pbStatus: boolean; plSize: number }>(
    "ISearch",
    "GetRecordCount",
    { pISearch: searchHandle },
  );

  const count = countRes.plSize ?? 0;
  if (count === 0) return { count: 0, services: [] };

  const pageSize = Math.min(count, 100);
  const rawServices = await callMethod<Array<Record<string, unknown>>>(
    "ISearch",
    "GetServices",
    { pISearch: searchHandle, lStartRecordID: 0, lNumberOfRecords: pageSize },
  );

  const services = Array.isArray(rawServices)
    ? rawServices.filter((r) => r.pbStatus).map(mapServiceRecord)
    : [];

  return { count, services };
}

export async function searchByChapter(
  chapterCode: string,
  onlyMainServices: boolean = false,
  language: SumexLanguage = 2,
): Promise<{ count: number; services: TardocServiceRecord[] }> {
  const session = await getOrCreateSession(language);
  const searchHandle = await createSubInterface(session.validatorHandle, "Search");

  await callMethod("ISearch", "SearchChapter", {
    pISearch: searchHandle,
    bstrChapterCode: chapterCode,
    eOnlyMainServices: onlyMainServices ? 1 : 0,
  });

  const countRes = await callMethod<{ pbStatus: boolean; plSize: number }>(
    "ISearch",
    "GetRecordCount",
    { pISearch: searchHandle },
  );

  const count = countRes.plSize ?? 0;
  if (count === 0) return { count: 0, services: [] };

  const pageSize = Math.min(count, 200);
  const rawServices = await callMethod<Array<Record<string, unknown>>>(
    "ISearch",
    "GetServices",
    { pISearch: searchHandle, lStartRecordID: 0, lNumberOfRecords: pageSize },
  );

  const services = Array.isArray(rawServices)
    ? rawServices.filter((r) => r.pbStatus).map(mapServiceRecord)
    : [];

  return { count, services };
}

export async function searchByServiceGroup(
  groupCode: string,
  onlyMainServices: boolean = false,
  language: SumexLanguage = 2,
): Promise<{ count: number; services: TardocServiceRecord[] }> {
  const session = await getOrCreateSession(language);
  const searchHandle = await createSubInterface(session.validatorHandle, "Search");

  await callMethod("ISearch", "SearchServiceGroup", {
    pISearch: searchHandle,
    bstrServiceGroupCode: groupCode,
    eOnlyMainServices: onlyMainServices ? 1 : 0,
  });

  const countRes = await callMethod<{ pbStatus: boolean; plSize: number }>(
    "ISearch",
    "GetRecordCount",
    { pISearch: searchHandle },
  );

  const count = countRes.plSize ?? 0;
  if (count === 0) return { count: 0, services: [] };

  const pageSize = Math.min(count, 200);
  const rawServices = await callMethod<Array<Record<string, unknown>>>(
    "ISearch",
    "GetServices",
    { pISearch: searchHandle, lStartRecordID: 0, lNumberOfRecords: pageSize },
  );

  const services = Array.isArray(rawServices)
    ? rawServices.filter((r) => r.pbStatus).map(mapServiceRecord)
    : [];

  return { count, services };
}

// --------------------------------------------------------------------------
// Price Calculation
// --------------------------------------------------------------------------

/**
 * Calculate CHF price from TARDOC tax points for a given canton.
 *
 * Formula: Price = (TP_MT × taxPointValue) + (TP_TT × taxPointValue)
 *
 * Note: The canton tax point value applies to both MT and TT components.
 * Internal factors are already baked into the TP values from the API.
 */
export function calculatePrice(
  tpMT: number,
  tpTT: number,
  taxPointValue: number,
): number {
  return Math.round((tpMT + tpTT) * taxPointValue * 100) / 100;
}

// --------------------------------------------------------------------------
// Session Info
// --------------------------------------------------------------------------

export async function getSessionInfo(
  language: SumexLanguage = 2,
): Promise<{
  dbVersion: string;
  dbVersionDate: string;
  moduleVersion: string;
  language: SumexLanguage;
}> {
  const session = await getOrCreateSession(language);
  return {
    dbVersion: session.dbVersion,
    dbVersionDate: session.dbVersionDate,
    moduleVersion: session.moduleVersion,
    language: session.language,
  };
}

export function invalidateSession(): void {
  cachedSession = null;
}

// --------------------------------------------------------------------------
// Validation (IValidate interface)
// --------------------------------------------------------------------------

export type ValidationServiceInput = {
  code: string;
  referenceCode?: string;
  quantity: number;
  sessionNumber?: number;
  date: string; // ISO date e.g. "2026-03-05"
  side?: number; // 0=None, 1=Left, 2=Right, 3=Both
  tpValueMT: number;
  externalFactorMT?: number;
  tpValueTT: number;
  externalFactorTT?: number;
};

export type ValidationResult = {
  valid: boolean;
  services: Array<{
    code: string;
    accepted: boolean;
    status: number;
    errorMessage?: string;
  }>;
  summary?: {
    chargeMT: number;
    chargeTT: number;
    totalCharge: number;
  };
};

/**
 * Validate a set of TARDOC services using the IValidate interface.
 * Returns whether all services pass validation and per-service results.
 */
export async function validateServices(
  services: ValidationServiceInput[],
  canton: string = "GE",
  lawType: number = 1, // 1=KVG
  language: SumexLanguage = 2,
): Promise<ValidationResult> {
  const session = await getOrCreateSession(language);

  // Create IValidate + ITardocInput instances
  const validateHandle = await createSubInterface(session.validatorHandle, "Validate");
  const tardocInputHandle = await createSubInterface(session.validatorHandle, "TardocInput");

  // Initialize IValidate
  await callMethod("IValidate", "Initialize", { pIValidate: validateHandle });

  // Initialize ITardocInput
  await callMethod("ITardocInput", "Initialize", { pITardocInput: tardocInputHandle });

  // Map canton string to enum
  const cantonMap: Record<string, number> = {
    AG: 1, AI: 2, AR: 3, BE: 4, BL: 5, BS: 6, FR: 7, GE: 8, GL: 9, GR: 10,
    JU: 11, LU: 12, NE: 13, NW: 14, OW: 15, SG: 16, SH: 17, SO: 18, SZ: 19,
    TG: 20, TI: 21, UR: 22, VD: 23, VS: 24, ZG: 25, ZH: 26,
  };
  const cantonEnum = cantonMap[canton.toUpperCase()] ?? 8; // Default GE

  // Set physician, patient, treatment — non-fatal; these provide context for
  // qualification/age/sex restrictions but don't affect cumulation rule checks.
  try {
    await callMethod("ITardocInput", "SetPhysician", {
      pITardocInput: tardocInputHandle,
      eMedicalRole: 1, // SelfEmployed
      eBillingRole: 3, // Both
      bstrGLNProvider: "",
      bstrGLNResponsible: "",
      bstrMedicalSectionCode: "",
    });
  } catch { /* non-fatal for group validation */ }

  try {
    await callMethod("ITardocInput", "SetPatient", {
      pITardocInput: tardocInputHandle,
      dBirthdate: "1980-01-01",
      eSex: 0, // Unknown
    });
  } catch { /* non-fatal for group validation */ }

  try {
    await callMethod("ITardocInput", "SetTreatment", {
      pITardocInput: tardocInputHandle,
      eCanton: cantonEnum,
      eLaw: lawType,
      eTreatmentType: 0, // Ambulatory
    });
  } catch { /* non-fatal for group validation */ }

  // Add each service and collect results
  const results: ValidationResult["services"] = [];
  let allValid = true;

  for (let i = 0; i < services.length; i++) {
    const svc = services[i];
    try {
      const addRes = await callMethod<{ plStatus: number; pbStatus: boolean }>(
        "IValidate",
        "AddService",
        {
          pIValidate: validateHandle,
          pITardocInput: tardocInputHandle,
          bstrCode: svc.code,
          bstrReferenceCode: svc.referenceCode || "",
          dQuantity: svc.quantity,
          lSessionNumber: svc.sessionNumber ?? 1,
          dDate: svc.date,
          eSide: svc.side ?? 0,
          dTPValue_MT: svc.tpValueMT,
          dExternalFactor_MT: svc.externalFactorMT ?? 1,
          dTPValue_TT: svc.tpValueTT,
          dExternalFactor_TT: svc.externalFactorTT ?? 1,
          eIgnoreValidate: 0, // No = validate
          lHook: i + 1,
        },
      );

      if (!addRes.pbStatus) {
        allValid = false;
        // Get abort info
        let errorMessage = `Status code: ${addRes.plStatus}`;
        try {
          const abortRes = await callMethod<{ pbstrInfo: string }>(
            "IValidate",
            "GetAbortInfo",
            { pIValidate: validateHandle },
          );
          if (abortRes.pbstrInfo) errorMessage = abortRes.pbstrInfo;
        } catch { /* ignore */ }

        results.push({
          code: svc.code,
          accepted: false,
          status: addRes.plStatus,
          errorMessage,
        });
      } else {
        results.push({
          code: svc.code,
          accepted: true,
          status: addRes.plStatus,
        });
      }
    } catch (err) {
      allValid = false;
      results.push({
        code: svc.code,
        accepted: false,
        status: -1,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Calculate sum if all valid
  let summary: ValidationResult["summary"];
  if (allValid && services.length > 0) {
    try {
      const sumRes = await callMethod<{ pbStatus: boolean }>(
        "IValidate",
        "CalculateSum",
        { pIValidate: validateHandle },
      );
      if (sumRes.pbStatus) {
        // Read charges from properties
        const [chargeMT, chargeTT] = await Promise.all([
          getProperty<{ pdCharge_MT: number }>("IValidate", "Charge_MT", validateHandle)
            .then(r => r.pdCharge_MT).catch(() => 0),
          getProperty<{ pdCharge_TT: number }>("IValidate", "Charge_TT", validateHandle)
            .then(r => r.pdCharge_TT).catch(() => 0),
        ]);
        summary = {
          chargeMT,
          chargeTT,
          totalCharge: Math.round((chargeMT + chargeTT) * 100) / 100,
        };
      }
    } catch { /* ignore sum errors */ }
  }

  // Cleanup
  try {
    await callMethod("IValidate", "Initialize", { pIValidate: validateHandle });
  } catch { /* ignore cleanup */ }

  return { valid: allValid, services: results, summary };
}
