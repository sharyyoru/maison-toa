/**
 * Local copy of the official OAAT-OTMA outpatient tariff catalogues, one set
 * per tariff year, picked by the treatment date:
 * - 2026: TARDOC 1.4c, ambulatory flat rates 1.1c, CPTMA/LKAAT 1.0c
 * - 2027: TARDOC 1.5, ambulatory flat rates 1.2, CPTMA/LKAAT 1.1
 *   (src/data/oaat/2027, plus the Tarifmatcher 1.2.1 rule catalogues).
 *
 * Replaces the catalogue lookups that went to the Sumex1 validator servers,
 * which have been unreachable since mid-October. Data is generated from the
 * published Excel annexes by scripts/import-oaat-catalogs.ts — see
 * src/data/oaat/meta.json for source URLs and SHA-256 checksums.
 *
 * Server-only (reads from disk). Shapes match the old Sumex records so callers
 * did not have to change.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TardocServiceRecord, ValidationResult, ValidationServiceInput } from "@/lib/sumexTardoc";
export { TARIFF_YEARS, tariffYearFor, type TariffYear } from "@/lib/tariffYear";
import { TARIFF_YEARS, tariffYearFor, type DateLike, type TariffYear } from "@/lib/tariffYear";
import { loadTarifmatcherCatalogs, mapTardoc, nodots, type MapperLog } from "@/lib/tardocMapper";
import type {
  AcfServiceRecord,
  AcfValidateServiceInput,
  AcfValidatedService,
  TmaServiceRecord,
  TmaType,
} from "@/lib/sumexAcf";

// ------------------------------------------------------------------- data

export type TardocPosition = {
  code: string;
  name: string;
  interpretation: string;
  tpMT: number;
  tpTT: number;
  dignity: string;
  obligation: string;
  type: string; // H main, Z supplement, R reserve, B
  parents: string[];
  chapter: string;
  functionalUnit: string;
  serviceMin: number;
  placeMin: number;
  changeMin: number;
  interventionClass: string;
  rules: string[];
  maxPerSession: number | null;
  nonCumulable: string[];
  supplementTo: string[];
  sideRequired: boolean;
};

type TardocData = {
  version: string;
  positions: TardocPosition[];
  chapters: Array<{ code: string; name: string }>;
  serviceGroups: Array<{ code: string; name: string; codes: string[] }>;
};

export type AcfFlatRate = {
  code: string;
  name: string;
  note: string;
  tp: number | null;
  notEvaluated: boolean;
  dignities: string[];
  chapterCode: string;
  chapterName: string;
};

type AcfData = { version: string; services: AcfFlatRate[]; chapters: Array<{ code: string; name: string }> };

export type LkaatService = {
  code: string;
  master: string;
  type: string; // P, PZ, E, EZ, N
  lateral: boolean;
  action: boolean;
  timed: boolean;
  groupable: boolean;
  assigned: boolean;
  name: string;
  interpretation: string;
};

type LkaatData = { version: string; services: LkaatService[] };


/**
 * Tariff year whose catalogues apply to a treatment date (Swiss calendar
 * day). No date = today. Dates before 2026 use the first TARDOC catalogue,
 * dates after the newest year use the newest one.
 */

const DATA_DIR = join(process.cwd(), "src", "data", "oaat");
const cache = new Map<string, unknown>();
function load<T>(file: string, year: TariffYear): T {
  const path = year === "2026" ? join(DATA_DIR, file) : join(DATA_DIR, year, file);
  if (!cache.has(path)) cache.set(path, JSON.parse(readFileSync(path, "utf8")));
  return cache.get(path) as T;
}

export const tardocData = (date?: DateLike) => load<TardocData>("tardoc.json", tariffYearFor(date));
export const acfData = (date?: DateLike) => load<AcfData>("acf.json", tariffYearFor(date));
export const lkaatData = (date?: DateLike) => load<LkaatData>("lkaat.json", tariffYearFor(date));

const tardocIndex = new Map<TariffYear, Map<string, TardocPosition>>();
export function getTardocPosition(code: string, date?: DateLike): TardocPosition | null {
  const year = tariffYearFor(date);
  if (!tardocIndex.has(year)) tardocIndex.set(year, new Map(tardocData(year).positions.map((p) => [p.code, p])));
  return tardocIndex.get(year)!.get(code.trim().toUpperCase()) ?? null;
}

const validFrom = (date?: DateLike) => `${tariffYearFor(date)}-01-01T00:00:00`;
const validTo = (date?: DateLike) => {
  const y = tariffYearFor(date);
  return y === TARIFF_YEARS[TARIFF_YEARS.length - 1] ? "" : `${y}-12-31T23:59:59`;
};

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Matches a Sumex-style query: "*" = everything, "AA.00*" or "AA.00" = code
 * prefix, anything else = accent-insensitive substring of code or name.
 */
function matcher(query: string): (code: string, name: string) => boolean {
  const q = (query || "").trim();
  if (!q || q === "*") return () => true;
  const bare = q.replace(/\*+$/, "");
  const codeLike = /^[A-Z]{1,2}\d{0,2}(\.[\dA-Z]*)*$/i.test(bare) && (bare.length <= 2 || /[.\d]/.test(bare));
  if (codeLike) {
    const upper = bare.toUpperCase();
    return (code) => code.toUpperCase().startsWith(upper);
  }
  const needle = fold(bare);
  return (code, name) => fold(code).includes(needle) || fold(name).includes(needle);
}

// ---------------------------------------------------------------- TARDOC

export function toTardocRecord(p: TardocPosition, index = 0, additionalRef = "", date?: DateLike): TardocServiceRecord {
  return {
    recordId: index + 1,
    code: p.code,
    name: p.name,
    chapter: p.chapter,
    section: p.chapter.slice(0, 1),
    serviceType: p.type,
    unit: "",
    unitCode: "",
    unitQuantity: 0,
    tpMT: p.tpMT,
    tpTT: p.tpTT,
    internalFactorMT: 1,
    internalFactorTT: 1,
    serviceMin: p.serviceMin,
    placeMin: p.placeMin,
    changeMin: p.changeMin,
    findingsMin: 0,
    anaesthesiaMin: 0,
    prePostServiceMin: 0,
    mechanicCode: "",
    kvgObligationCode: p.obligation,
    // Only unambiguous: a supplement valid for several mains is resolved
    // against the codes actually on the invoice (searchTardocAdditional).
    masterCode: p.parents.length === 1 ? p.parents[0] : "",
    additionalServiceReferenceCode: additionalRef,
    anaesthesiaInterventionClass: p.interventionClass,
    treatmentType: "",
    medicalInfo: p.interpretation,
    technicalInfo: p.rules.join("\n"),
    validFrom: validFrom(date),
    validTo: validTo(date),
    sexRequired: 0,
    sideRequired: p.sideRequired ? 1 : 0,
  } as TardocServiceRecord;
}

export function searchTardoc(query: string, mainOnly = false, date?: DateLike) {
  const match = matcher(query);
  const services = tardocData(date).positions
    .filter((p) => (!mainOnly || p.type !== "Z") && match(p.code, p.name))
    .map((p, i) => toTardocRecord(p, i, "", date));
  return { count: services.length, services };
}

export function searchTardocByChapter(chapter: string, mainOnly = false, date?: DateLike) {
  const c = chapter.trim().toUpperCase();
  const services = tardocData(date).positions
    .filter((p) => (p.chapter === c || p.code.startsWith(`${c}.`) || (c.length === 1 && p.code.startsWith(c))) && (!mainOnly || p.type !== "Z"))
    .map((p, i) => toTardocRecord(p, i, "", date));
  return { count: services.length, services };
}

export function searchTardocByServiceGroup(group: string, mainOnly = false, date?: DateLike) {
  const g = tardocData(date).serviceGroups.find((x) => x.code === group);
  const codes = new Set(g?.codes ?? []);
  const services = tardocData(date).positions
    .filter((p) => codes.has(p.code) && (!mainOnly || p.type !== "Z"))
    .map((p, i) => toTardocRecord(p, i, "", date));
  return { count: services.length, services };
}

/** All chapters under a parent ("" = every chapter, flat — the tree builds itself). */
export function tardocChapters(parent = "", date?: DateLike) {
  const p = parent.trim().toUpperCase();
  return tardocData(date).chapters.filter((c) => !p || (c.code !== p && c.code.startsWith(p)));
}

/** Supplements (Zuschläge) that may be billed with `baseCode`. */
export function searchTardocAdditional(baseCode: string, date?: DateLike) {
  const base = baseCode.trim().toUpperCase();
  const services = tardocData(date).positions
    .filter((p) => p.parents.includes(base) || p.supplementTo.includes(base))
    .map((p, i) => toTardocRecord(p, i, base, date));
  return { count: services.length, services };
}

const conflicts = (rule: string, code: string) =>
  rule === code || (rule.length < 10 && code.startsWith(`${rule}.`)) || (rule.length === 2 && code.startsWith(rule));

/**
 * Session-level TARDOC checks taken from the catalogue's own rules:
 * code exists, "<= N fois par séance", "Non cumulable avec …",
 * supplements need one of their main positions, side must be given.
 *
 * Not checked (needs patient history or provider data): per-day / 90-day /
 * per-patient limits, age and sex limits, qualitative dignity. These are
 * listed in `notChecked` so the UI can say so.
 */
export function validateTardocLocal(
  services: ValidationServiceInput[],
  patient: { birthDate?: string | null } = {},
): ValidationResult & {
  validator: "local";
  catalogVersion: string;
  notChecked: string[];
  warnings?: string[];
} {
  const date = services.find((s) => s.date)?.date;
  if (tariffYearFor(date) !== "2026") return validateTardocTarifmatcher(services, patient, date);
  const bySession = new Map<number, ValidationServiceInput[]>();
  for (const s of services) {
    const k = s.sessionNumber ?? 1;
    bySession.set(k, [...(bySession.get(k) ?? []), s]);
  }

  let chargeMT = 0;
  let chargeTT = 0;
  const results = services.map((svc) => {
    const code = svc.code.trim().toUpperCase();
    const pos = getTardocPosition(code, date);
    const reject = (errorMessage: string) => ({ code: svc.code, accepted: false, status: 1, errorMessage });
    if (!pos) return reject(`${code}: position inconnue dans ${tardocData(date).version}`);

    const session = bySession.get(svc.sessionNumber ?? 1) ?? [];
    const sessionCodes = session.map((s) => s.code.trim().toUpperCase());

    if (pos.maxPerSession !== null) {
      const qty = session.filter((s) => s.code.trim().toUpperCase() === code).reduce((n, s) => n + (Number(s.quantity) || 0), 0);
      if (qty > pos.maxPerSession) return reject(`${code}: <= ${pos.maxPerSession} fois par séance (quantité ${qty})`);
    }

    for (const other of sessionCodes) {
      if (other === code) continue;
      const otherPos = getTardocPosition(other, date);
      const hit = pos.nonCumulable.find((r) => conflicts(r, other))
        || otherPos?.nonCumulable.find((r) => conflicts(r, code));
      if (hit) return reject(`${code}: non cumulable avec ${other}`);
    }

    const mains = [...new Set([...pos.parents, ...pos.supplementTo])];
    if (mains.length && !mains.some((m) => sessionCodes.includes(m))) {
      return reject(`${code}: supplément — nécessite ${mains.join(" ou ")} dans la même séance`);
    }
    if (svc.referenceCode && mains.length && !mains.includes(svc.referenceCode.trim().toUpperCase())) {
      return reject(`${code}: code de référence ${svc.referenceCode} invalide (attendu ${mains.join(" ou ")})`);
    }

    if (pos.sideRequired && !svc.side) return reject(`${code}: le côté doit être indiqué`);

    const q = Number(svc.quantity) || 0;
    chargeMT += Math.round(q * pos.tpMT * svc.tpValueMT * (svc.externalFactorMT ?? 1) * 100) / 100;
    chargeTT += Math.round(q * pos.tpTT * svc.tpValueTT * (svc.externalFactorTT ?? 1) * 100) / 100;
    return { code: svc.code, accepted: true, status: 0 };
  });

  const valid = results.every((r) => r.accepted);
  return {
    valid,
    services: results,
    summary: valid
      ? { chargeMT: Math.round(chargeMT * 100) / 100, chargeTT: Math.round(chargeTT * 100) / 100, totalCharge: Math.round((chargeMT + chargeTT) * 100) / 100 }
      : undefined,
    validator: "local",
    catalogVersion: tardocData(date).version,
    notChecked: ["limites par jour / 90 jours / patient", "âge et sexe", "valeur intrinsèque qualitative (dignité)"],
  };
}

const SIDE_LETTER = ["", "L", "R", "B"];

/**
 * 2027+: the session is run through the Tarifmatcher rules (tardocMapper).
 * A service is accepted when it comes out unchanged; deleted or capped
 * services are rejected with the Tarifmatcher message. Undecidable rules
 * (per day / 90 days / patient…) are returned as warnings.
 */
const dottedCode = (c: string) => (/^[A-Z]{2}\d{6}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4)}` : c);

function validateTardocTarifmatcher(
  services: ValidationServiceInput[],
  patient: { birthDate?: string | null },
  date: string | undefined,
): ReturnType<typeof validateTardocLocal> {
  const year = tariffYearFor(date);
  const cat = loadTarifmatcherCatalogs(year);
  // Tarifmatcher takes LKAAT codes. A few TARDOC positions (e.g. RC.25.0020 /
  // RC.25.0030) are only reachable through an LKAAT side mapping, so a direct
  // TARDOC line is fed in as its LKAAT code: one side as-is, both sides as L + R.
  const viaSideMapping = new Map<string, { source: string; both: boolean }>();
  for (const e of cat.lkaat.values()) {
    const args = e.mappingType === "side_mapping" ? e.mappingArguments : undefined;
    if (!args) continue;
    if (args.oneSide) viaSideMapping.set(nodots(args.oneSide), { source: e.code, both: false });
    if (args.bothSides) viaSideMapping.set(nodots(args.bothSides), { source: e.code, both: true });
  }
  const sourceCode = (code: string) => viaSideMapping.get(nodots(code))?.source.toUpperCase() ?? code.trim().toUpperCase();
  const mapped = mapTardoc(
    {
      services: services.flatMap((s) => {
        const alias = viaSideMapping.get(nodots(s.code));
        const base = { number: Number(s.quantity) || 1, session: s.sessionNumber ?? 1 };
        if (alias?.both) return [{ ...base, code: alias.source, side: "L" }, { ...base, code: alias.source, side: "R" }];
        return [{ ...base, code: alias?.source ?? s.code, side: SIDE_LETTER[s.side ?? 0] ?? "" }];
      }),
      date: date?.slice(0, 10),
      birthDate: patient.birthDate ?? null,
    },
    year,
  );
  const remaining = [...mapped.tarpos];
  const logs = [...mapped.log];
  const takeLog = (code: string, session: number): MapperLog | undefined => {
    const i = logs.findIndex((l) => l.level !== "INFO" && l.level !== "WARNING" && l.serviceCode.toUpperCase() === code && l.session === session);
    return i >= 0 ? logs.splice(i, 1)[0] : undefined;
  };
  let chargeMT = 0;
  let chargeTT = 0;
  const results = services.map((svc) => {
    const code = svc.code.trim().toUpperCase();
    const session = svc.sessionNumber ?? 1;
    const qty = Math.round(Number(svc.quantity) || 1);
    const src = sourceCode(code);
    const idx = remaining.findIndex((t) => t.serviceCode.toUpperCase() === src && nodots(t.code) === nodots(code) && t.session === session);
    const tarpo = idx >= 0 ? remaining.splice(idx, 1)[0] : undefined;
    const pos = getTardocPosition(code, date);
    if (!pos) return { code: svc.code, accepted: false, status: 1, errorMessage: `${code}: position inconnue dans ${tardocData(date).version}` };
    const masters = cat.tardoc.get(nodots(code))?.masters ?? [];
    const ref = svc.referenceCode?.trim();
    if (ref && masters.length && !masters.some((m) => nodots(m) === nodots(ref))) {
      return { code: svc.code, accepted: false, status: 1, errorMessage: `${code}: ${ref} n'est pas une prestation de référence admise (${masters.map(dottedCode).join(", ")})` };
    }
    const problem = tarpo && tarpo.number === qty ? undefined : takeLog(src, session);
    if (!tarpo || tarpo.number !== qty) {
      const msg = problem?.message
        ? problem.message.replace(/&le;/g, "≤")
        : tarpo ? `quantité limitée à ${tarpo.number}` : "refusé par les règles TARDOC";
      return { code: svc.code, accepted: false, status: 1, errorMessage: `${code}: ${msg}` };
    }
    const q = Number(svc.quantity) || 0;
    chargeMT += Math.round(q * pos.tpMT * svc.tpValueMT * (svc.externalFactorMT ?? 1) * 100) / 100;
    chargeTT += Math.round(q * pos.tpTT * svc.tpValueTT * (svc.externalFactorTT ?? 1) * 100) / 100;
    return { code: svc.code, accepted: true, status: 0 };
  });
  const valid = results.every((r) => r.accepted);
  const warnings = [...new Set(mapped.log.filter((l) => l.level === "WARNING").map((l) => `${l.tardocCode || l.serviceCode}: ${l.message.replace(/&le;/g, "≤")}`))];
  return {
    valid,
    services: results,
    summary: valid
      ? { chargeMT: Math.round(chargeMT * 100) / 100, chargeTT: Math.round(chargeTT * 100) / 100, totalCharge: Math.round((chargeMT + chargeTT) * 100) / 100 }
      : undefined,
    validator: "local",
    catalogVersion: tardocData(date).version,
    notChecked: ["limites par jour / 90 jours / patient (voir avertissements)", "valeur intrinsèque qualitative (dignité)"],
    warnings,
  };
}

// ------------------------------------------------------- ACF flat rates (005)

function toAcfRecord(s: AcfFlatRate, date?: DateLike): AcfServiceRecord {
  return {
    code: s.code,
    name: s.name,
    interpretation: s.note,
    chapterCode: s.chapterCode,
    chapterName: s.chapterName,
    referenceCode: "",
    tariffType: "005",
    tp: s.tp ?? 0,
    validFrom: validFrom(date),
    validTo: validTo(date),
    serviceProperties: s.tp !== null ? 1 : 0,
  };
}

export function searchAcfLocal(code = "*", chapterCode = "", name = "", date?: DateLike) {
  const match = matcher(code);
  const nameMatch = name ? matcher(name) : () => true;
  const services = acfData(date).services
    .filter((s) => (!chapterCode || s.chapterCode === chapterCode) && match(s.code, s.name) && nameMatch(s.code, s.name))
    .map((s) => toAcfRecord(s, date));
  return { count: services.length, services };
}

export function acfChaptersLocal(date?: DateLike) {
  const counts = new Map<string, number>();
  for (const s of acfData(date).services) counts.set(s.chapterCode, (counts.get(s.chapterCode) ?? 0) + 1);
  return acfData(date).chapters
    .filter((c) => counts.has(c.code))
    .map((c) => ({ code: c.code, name: c.name, count: counts.get(c.code) ?? 0 }));
}

/**
 * Flat-rate amounts from the catalogue: amount = TP (CHF) × external factor ×
 * quantity. Rejects unknown codes and flat rates published as "non évalué".
 * Grouping (gestures + ICD -> flat rate) is NOT done here.
 */
export function validateAcfLocal(services: AcfValidateServiceInput[], date?: DateLike) {
  const addResults: Array<{ code: string; resultCode: number; success: boolean; abortInfo: string | null; calculatedAmount: number; calculatedTP: number }> = [];
  const validatedServices: AcfValidatedService[] = [];
  for (const svc of services) {
    const rate = acfData(date).services.find((s) => s.code === svc.code.trim().toUpperCase());
    if (!rate || rate.tp === null) {
      addResults.push({
        code: svc.code, resultCode: 1, success: false, calculatedAmount: 0, calculatedTP: 0,
        abortInfo: !rate ? `Forfait inconnu dans ${acfData(date).version}` : "Forfait publié comme « non évalué » — aucun montant",
      });
      continue;
    }
    const ef = svc.externalFactor ?? 1;
    const qty = svc.quantity ?? 1;
    const amount = Math.round(rate.tp * ef * qty * 100) / 100;
    addResults.push({ code: svc.code, resultCode: 0, success: true, abortInfo: null, calculatedAmount: amount, calculatedTP: rate.tp });
    validatedServices.push({
      code: rate.code, name: rate.name, referenceCode: svc.referenceCode || "", tariffType: "005",
      quantity: qty, tp: rate.tp, amount, tpValue: 1, externalFactor: ef, side: svc.side ?? 0, sessionNumber: svc.sessionNumber ?? 1,
    });
  }
  const totalAmount = Math.round(validatedServices.reduce((n, s) => n + s.amount, 0) * 100) / 100;
  return {
    addResults,
    finalize: { count: validatedServices.length, totalAmount, success: true, addedServiceCount: 0, modifiedServiceCount: 0, deletedServiceCount: 0 },
    validatedServices,
    validator: "local" as const,
    catalogVersion: acfData(date).version,
  };
}

// ------------------------------------------------------ CPTMA / LKAAT (TMA)

// LKAAT 1.1 type "R" has no Sumex TMA type, so it only matches "any" (0).
const TMA_TYPE: Record<string, TmaType> = { P: 3, PZ: 4, E: 5, EZ: 6, N: 7, R: 0 };

function tmaChapter(code: string, date?: DateLike): { code: string; name: string } {
  const m = code.match(/^C(\d{2})\./);
  if (m) {
    const cap = m[1] === "00" ? "Prae-Cap" : `Cap${m[1]}`;
    return { code: cap, name: acfData(date).chapters.find((c) => c.code === cap)?.name ?? cap };
  }
  const prefix = code.slice(0, 2);
  return { code: prefix, name: tardocData(date).chapters.find((c) => c.code === prefix)?.name ?? prefix };
}

function toTmaRecord(s: LkaatService, date?: DateLike): TmaServiceRecord {
  const tmaType = TMA_TYPE[s.type] ?? 0;
  const hasTP = s.type === "E" || s.type === "EZ";
  const props = (hasTP ? 1 : 0) | (s.master ? 32 : 0) | (s.lateral ? 256 : 0) | (s.groupable ? 512 : 0) | (s.timed ? 1024 : 0);
  const ch = tmaChapter(s.code, date);
  return {
    code: s.code,
    name: s.name,
    interpretation: s.interpretation,
    chapterCode: ch.code,
    chapterName: ch.name,
    referenceCode: s.master,
    tariffType: "TMA",
    tmaType,
    validFrom: validFrom(date),
    validTo: validTo(date),
    serviceProperties: props,
    hasTP,
    needsRefCode: Boolean(s.master),
    hasSideDependency: s.lateral,
    isGrouperRelevant: s.groupable,
    isMinutage: s.timed,
    isContactRelated: false,
  };
}

function tmaTypeMatches(filter: TmaType, type: string): boolean {
  if (!filter) return true;
  if (filter === 1 || filter === 2 || filter === 3) return type === "P";
  if (filter === 8) return type === "P" || type === "E";
  return TMA_TYPE[type] === filter;
}

export function searchTmaLocal(code = "*", chapterCode = "", name = "", tmaType: TmaType = 0, grouperOnly = false, date?: DateLike) {
  const match = matcher(code);
  const nameMatch = name ? matcher(name) : () => true;
  const services = lkaatData(date).services
    .filter((s) =>
      (!grouperOnly || s.groupable)
      && tmaTypeMatches(tmaType, s.type)
      && match(s.code, s.name)
      && nameMatch(s.code, s.name)
      && (!chapterCode || tmaChapter(s.code, date).code === chapterCode))
    .map((s) => toTmaRecord(s, date));
  return { count: services.length, services };
}

export function searchTmaSlavesLocal(masterCode: string, date?: DateLike) {
  const m = masterCode.trim().toUpperCase();
  const services = lkaatData(date).services.filter((s) => s.master === m).map((s) => toTmaRecord(s, date));
  return { count: services.length, services };
}

export function tmaChaptersLocal(date?: DateLike) {
  const map = new Map<string, { name: string; count: number }>();
  for (const s of lkaatData(date).services) {
    if (!s.groupable) continue;
    const ch = tmaChapter(s.code, date);
    const e = map.get(ch.code);
    if (e) e.count++;
    else map.set(ch.code, { name: ch.name, count: 1 });
  }
  return [...map.entries()].map(([code, v]) => ({ code, ...v })).sort((a, b) => a.code.localeCompare(b.code));
}

export function catalogInfo(date?: DateLike) {
  return {
    tardoc: tardocData(date).version,
    acf: acfData(date).version,
    lkaat: lkaatData(date).version,
    tariffYear: tariffYearFor(date),
    source: "OAAT-OTMA published annexes (local copy)",
  };
}
