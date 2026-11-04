/**
 * Local copy of the official OAAT-OTMA outpatient tariff catalogues
 * (TARDOC 1.4c, ambulatory flat rates 1.1c, CPTMA/LKAAT 1.0c).
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

const DATA_DIR = join(process.cwd(), "src", "data", "oaat");
const cache = new Map<string, unknown>();
function load<T>(file: string): T {
  if (!cache.has(file)) cache.set(file, JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")));
  return cache.get(file) as T;
}

export const tardocData = () => load<TardocData>("tardoc.json");
export const acfData = () => load<AcfData>("acf.json");
export const lkaatData = () => load<LkaatData>("lkaat.json");

let tardocIndex: Map<string, TardocPosition> | null = null;
export function getTardocPosition(code: string): TardocPosition | null {
  if (!tardocIndex) tardocIndex = new Map(tardocData().positions.map((p) => [p.code, p]));
  return tardocIndex.get(code.trim().toUpperCase()) ?? null;
}

// The catalogue applies from the introduction of TARDOC.
const VALID_FROM = "2026-01-01T00:00:00";

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

export function toTardocRecord(p: TardocPosition, index = 0, additionalRef = ""): TardocServiceRecord {
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
    validFrom: VALID_FROM,
    validTo: "",
    sexRequired: 0,
    sideRequired: p.sideRequired ? 1 : 0,
  } as TardocServiceRecord;
}

export function searchTardoc(query: string, mainOnly = false) {
  const match = matcher(query);
  const services = tardocData().positions
    .filter((p) => (!mainOnly || p.type !== "Z") && match(p.code, p.name))
    .map((p, i) => toTardocRecord(p, i));
  return { count: services.length, services };
}

export function searchTardocByChapter(chapter: string, mainOnly = false) {
  const c = chapter.trim().toUpperCase();
  const services = tardocData().positions
    .filter((p) => (p.chapter === c || p.code.startsWith(`${c}.`) || (c.length === 1 && p.code.startsWith(c))) && (!mainOnly || p.type !== "Z"))
    .map((p, i) => toTardocRecord(p, i));
  return { count: services.length, services };
}

export function searchTardocByServiceGroup(group: string, mainOnly = false) {
  const g = tardocData().serviceGroups.find((x) => x.code === group);
  const codes = new Set(g?.codes ?? []);
  const services = tardocData().positions
    .filter((p) => codes.has(p.code) && (!mainOnly || p.type !== "Z"))
    .map((p, i) => toTardocRecord(p, i));
  return { count: services.length, services };
}

/** All chapters under a parent ("" = every chapter, flat — the tree builds itself). */
export function tardocChapters(parent = "") {
  const p = parent.trim().toUpperCase();
  return tardocData().chapters.filter((c) => !p || (c.code !== p && c.code.startsWith(p)));
}

/** Supplements (Zuschläge) that may be billed with `baseCode`. */
export function searchTardocAdditional(baseCode: string) {
  const base = baseCode.trim().toUpperCase();
  const services = tardocData().positions
    .filter((p) => p.parents.includes(base) || p.supplementTo.includes(base))
    .map((p, i) => toTardocRecord(p, i, base));
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
export function validateTardocLocal(services: ValidationServiceInput[]): ValidationResult & {
  validator: "local";
  catalogVersion: string;
  notChecked: string[];
} {
  const bySession = new Map<number, ValidationServiceInput[]>();
  for (const s of services) {
    const k = s.sessionNumber ?? 1;
    bySession.set(k, [...(bySession.get(k) ?? []), s]);
  }

  let chargeMT = 0;
  let chargeTT = 0;
  const results = services.map((svc) => {
    const code = svc.code.trim().toUpperCase();
    const pos = getTardocPosition(code);
    const reject = (errorMessage: string) => ({ code: svc.code, accepted: false, status: 1, errorMessage });
    if (!pos) return reject(`${code}: position inconnue dans ${tardocData().version}`);

    const session = bySession.get(svc.sessionNumber ?? 1) ?? [];
    const sessionCodes = session.map((s) => s.code.trim().toUpperCase());

    if (pos.maxPerSession !== null) {
      const qty = session.filter((s) => s.code.trim().toUpperCase() === code).reduce((n, s) => n + (Number(s.quantity) || 0), 0);
      if (qty > pos.maxPerSession) return reject(`${code}: <= ${pos.maxPerSession} fois par séance (quantité ${qty})`);
    }

    for (const other of sessionCodes) {
      if (other === code) continue;
      const otherPos = getTardocPosition(other);
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
    catalogVersion: tardocData().version,
    notChecked: ["limites par jour / 90 jours / patient", "âge et sexe", "valeur intrinsèque qualitative (dignité)"],
  };
}

// ------------------------------------------------------- ACF flat rates (005)

function toAcfRecord(s: AcfFlatRate): AcfServiceRecord {
  return {
    code: s.code,
    name: s.name,
    interpretation: s.note,
    chapterCode: s.chapterCode,
    chapterName: s.chapterName,
    referenceCode: "",
    tariffType: "005",
    tp: s.tp ?? 0,
    validFrom: VALID_FROM,
    validTo: "",
    serviceProperties: s.tp !== null ? 1 : 0,
  };
}

export function searchAcfLocal(code = "*", chapterCode = "", name = "") {
  const match = matcher(code);
  const nameMatch = name ? matcher(name) : () => true;
  const services = acfData().services
    .filter((s) => (!chapterCode || s.chapterCode === chapterCode) && match(s.code, s.name) && nameMatch(s.code, s.name))
    .map(toAcfRecord);
  return { count: services.length, services };
}

export function acfChaptersLocal() {
  const counts = new Map<string, number>();
  for (const s of acfData().services) counts.set(s.chapterCode, (counts.get(s.chapterCode) ?? 0) + 1);
  return acfData().chapters
    .filter((c) => counts.has(c.code))
    .map((c) => ({ code: c.code, name: c.name, count: counts.get(c.code) ?? 0 }));
}

/**
 * Flat-rate amounts from the catalogue: amount = TP (CHF) × external factor ×
 * quantity. Rejects unknown codes and flat rates published as "non évalué".
 * Grouping (gestures + ICD -> flat rate) is NOT done here.
 */
export function validateAcfLocal(services: AcfValidateServiceInput[]) {
  const addResults: Array<{ code: string; resultCode: number; success: boolean; abortInfo: string | null; calculatedAmount: number; calculatedTP: number }> = [];
  const validatedServices: AcfValidatedService[] = [];
  for (const svc of services) {
    const rate = acfData().services.find((s) => s.code === svc.code.trim().toUpperCase());
    if (!rate || rate.tp === null) {
      addResults.push({
        code: svc.code, resultCode: 1, success: false, calculatedAmount: 0, calculatedTP: 0,
        abortInfo: !rate ? `Forfait inconnu dans ${acfData().version}` : "Forfait publié comme « non évalué » — aucun montant",
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
    catalogVersion: acfData().version,
  };
}

// ------------------------------------------------------ CPTMA / LKAAT (TMA)

const TMA_TYPE: Record<string, TmaType> = { P: 3, PZ: 4, E: 5, EZ: 6, N: 7 };

function tmaChapter(code: string): { code: string; name: string } {
  const m = code.match(/^C(\d{2})\./);
  if (m) {
    const cap = m[1] === "00" ? "Prae-Cap" : `Cap${m[1]}`;
    return { code: cap, name: acfData().chapters.find((c) => c.code === cap)?.name ?? cap };
  }
  const prefix = code.slice(0, 2);
  return { code: prefix, name: tardocData().chapters.find((c) => c.code === prefix)?.name ?? prefix };
}

function toTmaRecord(s: LkaatService): TmaServiceRecord {
  const tmaType = TMA_TYPE[s.type] ?? 0;
  const hasTP = s.type === "E" || s.type === "EZ";
  const props = (hasTP ? 1 : 0) | (s.master ? 32 : 0) | (s.lateral ? 256 : 0) | (s.groupable ? 512 : 0) | (s.timed ? 1024 : 0);
  const ch = tmaChapter(s.code);
  return {
    code: s.code,
    name: s.name,
    interpretation: s.interpretation,
    chapterCode: ch.code,
    chapterName: ch.name,
    referenceCode: s.master,
    tariffType: "TMA",
    tmaType,
    validFrom: VALID_FROM,
    validTo: "",
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

export function searchTmaLocal(code = "*", chapterCode = "", name = "", tmaType: TmaType = 0, grouperOnly = false) {
  const match = matcher(code);
  const nameMatch = name ? matcher(name) : () => true;
  const services = lkaatData().services
    .filter((s) =>
      (!grouperOnly || s.groupable)
      && tmaTypeMatches(tmaType, s.type)
      && match(s.code, s.name)
      && nameMatch(s.code, s.name)
      && (!chapterCode || tmaChapter(s.code).code === chapterCode))
    .map(toTmaRecord);
  return { count: services.length, services };
}

export function searchTmaSlavesLocal(masterCode: string) {
  const m = masterCode.trim().toUpperCase();
  const services = lkaatData().services.filter((s) => s.master === m).map(toTmaRecord);
  return { count: services.length, services };
}

export function tmaChaptersLocal() {
  const map = new Map<string, { name: string; count: number }>();
  for (const s of lkaatData().services) {
    if (!s.groupable) continue;
    const ch = tmaChapter(s.code);
    const e = map.get(ch.code);
    if (e) e.count++;
    else map.set(ch.code, { name: ch.name, count: 1 });
  }
  return [...map.entries()].map(([code, v]) => ({ code, ...v })).sort((a, b) => a.code.localeCompare(b.code));
}

export function catalogInfo() {
  return {
    tardoc: tardocData().version,
    acf: acfData().version,
    lkaat: lkaatData().version,
    source: "OAAT-OTMA published annexes (local copy)",
  };
}
