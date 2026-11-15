/**
 * LKAAT -> TARDOC mapping and TARDOC rule checks for tariff year 2027+,
 * driven by the machine-readable catalogues published with the OAAT
 * Tarifmatcher (tardoc_TARDOC_1.5_fr.json, lkaat_1.1.json).
 *
 * Mirrors ch.oaat_otma.mapper.Mapper from Tarifmatcher 1.2.1 and is checked
 * against it in src/__tests__/tardocMapper.test.ts: cumulation rules (E/X/I,
 * per session or side), maximum numbers (per session or side, also for LG
 * groups), age limits with their tolerance, required master positions, the
 * LKAAT side mappings, and undecidable rules reported as warnings.
 */

import { readFileSync } from "fs";
import { join } from "path";

export type TmRule =
  | { type: "CumulationRule"; cumulationType: "E" | "I" | "X"; codes: string[]; context?: "session" | "side"; description?: string }
  | { type: "MaxNumberRule"; description: string; maxNumber: number; context: "session" | "side" }
  | { type: "AgeRule"; description: string; condition: string; tolerance: number }
  | { type: "UndecidableRule"; description: string };

export type TmTardocEntry = {
  code: string;
  codeType: "tardoc" | "group";
  digni: string[];
  rules: TmRule[];
  taxpointsAL?: number;
  taxpointsIPL?: number;
  percentageAL?: number | null;
  percentageIPL?: number | null;
  hasSide?: boolean;
  masters?: string[];
  tardocs?: string[];
};

export type TmLkaatEntry = {
  code: string;
  type: string;
  hasSide: boolean;
  mappingType?: "side_mapping";
  mappingArguments?: { oneSide: string; bothSides: string };
};

type TmCatalog<T> = { version: string; application_year: string; min_tarifmatcher_version: string; entries: T[] };

export type MapperSide = "" | "L" | "R" | "B";
export type MapperService = { code: string; side?: string | null; number?: number; session?: number };
export type MapperInput = {
  services: MapperService[];
  /** Treatment date (YYYY-MM-DD); with `birthDate` gives the exact age for age rules. */
  date?: string | null;
  birthDate?: string | null;
  ageYears?: number | null;
};
export type MapperTarpo = { code: string; serviceCode: string; number: number; side: MapperSide; session: number; missingSide?: boolean };
export type MapperLogLevel = "INFO" | "WARNING" | "LKAAT_VALIDATION_TRIGGER" | "LKAAT_VALIDATION_DUPLICATE" | "LKAAT_VALIDATION_NOT_FOUND" | "TARDOC_VALIDATION_DELETE" | "TARDOC_VALIDATION_UPDATE" | "MISSING_MASTER";
export type MapperLog = { level: MapperLogLevel; message: string; serviceCode: string; tardocCode: string; session: number };
export type MapperResult = { tarpos: MapperTarpo[]; log: MapperLog[] };

export const nodots = (c: string) => String(c ?? "").toUpperCase().replace(/[\s.]/g, "");
/** "AA000010" -> "AA.00.0010" */
export const dotted = (c: string) => {
  const n = nodots(c);
  return /^[A-Z0-9]{2}\d{2}[A-Z0-9]{4}$/.test(n) ? `${n.slice(0, 2)}.${n.slice(2, 4)}.${n.slice(4)}` : c;
};

type Catalogs = {
  tardoc: Map<string, TmTardocEntry>;
  groups: TmTardocEntry[];
  lkaat: Map<string, TmLkaatEntry>;
  version: { tardoc: string; lkaat: string; applicationYear: string };
};
const catalogs = new Map<string, Catalogs>();
export function loadTarifmatcherCatalogs(year: string): Catalogs {
  let c = catalogs.get(year);
  if (c) return c;
  const read = <T,>(f: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "data", "oaat", year, f), "utf8")) as TmCatalog<T>;
  const t = read<TmTardocEntry>("tarifmatcher_tardoc.json");
  const l = read<TmLkaatEntry>("tarifmatcher_lkaat.json");
  c = {
    tardoc: new Map(t.entries.filter((e) => e.codeType !== "group").map((e) => [nodots(e.code), e])),
    groups: t.entries.filter((e) => e.codeType === "group"),
    lkaat: new Map(l.entries.map((e) => [nodots(e.code), e])),
    version: { tardoc: t.version, lkaat: l.version, applicationYear: t.application_year },
  };
  catalogs.set(year, c);
  return c;
}

const normSide = (s: string | null | undefined): MapperSide => {
  const v = String(s ?? "").trim().toUpperCase();
  if (v === "L" || v === "1" || v === "LEFT") return "L";
  if (v === "R" || v === "2" || v === "RIGHT") return "R";
  if (v === "B" || v === "3" || v === "BOTH") return "B";
  return "";
};

function ageIn(unit: "years" | "months" | "days", birth: Date, at: Date): number {
  if (unit === "days") return Math.floor((at.getTime() - birth.getTime()) / 86400000);
  let months = (at.getUTCFullYear() - birth.getUTCFullYear()) * 12 + (at.getUTCMonth() - birth.getUTCMonth());
  if (at.getUTCDate() < birth.getUTCDate()) months--;
  return unit === "months" ? months : Math.floor(months / 12);
}

/** Evaluates an AgeRule condition such as "age_months < 6"; null when the age is unknown. */
function ageCondition(rule: Extract<TmRule, { type: "AgeRule" }>, input: MapperInput): boolean | null {
  const m = rule.condition.match(/^\s*age_(years|months|days)\s*(<=|>=|<|>|=)\s*(\d+)\s*$/);
  if (!m) return null;
  const unit = m[1] as "years" | "months" | "days";
  const limit = Number(m[3]);
  let age: number | null = null;
  if (input.birthDate && input.date) {
    const at = new Date(`${input.date.slice(0, 10)}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() - rule.tolerance);
    age = ageIn(unit, new Date(`${input.birthDate.slice(0, 10)}T00:00:00Z`), at);
  } else if (unit === "years" && input.ageYears != null) {
    age = input.ageYears;
  }
  if (age === null) return null;
  switch (m[2]) {
    case "<": return age < limit;
    case "<=": return age <= limit;
    case ">": return age > limit;
    case ">=": return age >= limit;
    default: return age === limit;
  }
}

const html = (s: string) => s.replace(/&le;/g, "≤").replace(/&ge;/g, "≥").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function mapTardoc(input: MapperInput, year = "2027"): MapperResult {
  const cat = loadTarifmatcherCatalogs(year);
  const log: MapperLog[] = [];
  const added: MapperTarpo[] = [];

  const seen = new Set<string>();
  // A side-mapped LKAAT code given for the left and the right side in the same
  // session becomes one "both sides" TARDOC position.
  const services: MapperService[] = [];
  const bothSides = new Set<string>();
  for (const svc of input.services) {
    const code = nodots(svc.code);
    const m = cat.lkaat.get(code)?.mappingArguments;
    const session = svc.session ?? 1;
    const key = `${session}|${code}`;
    if (m && normSide(svc.side) !== "B" && (normSide(svc.side) === "L" || normSide(svc.side) === "R")) {
      const other = normSide(svc.side) === "L" ? "R" : "L";
      const pairIdx = services.findIndex((s) => nodots(s.code) === code && (s.session ?? 1) === session && normSide(s.side) === other);
      if (pairIdx >= 0 && !bothSides.has(key)) {
        bothSides.add(key);
        services[pairIdx] = { ...services[pairIdx], side: "", number: 1, bothSides: true } as MapperService;
        continue;
      }
    }
    services.push(svc);
  }
  for (const svc of services) {
    if ((svc as { bothSides?: boolean }).bothSides) {
      const serviceCode = String(svc.code).trim().toUpperCase();
      const target = nodots(cat.lkaat.get(nodots(svc.code))!.mappingArguments!.bothSides);
      const session = svc.session ?? 1;
      log.push({ level: "INFO", message: "", serviceCode, tardocCode: dotted(target), session });
      added.push({ code: target, serviceCode, number: 1, side: "", session });
      continue;
    }
    const serviceCode = String(svc.code ?? "").trim().toUpperCase();
    const code = nodots(serviceCode);
    let side = normSide(svc.side);
    const session = svc.session ?? 1;
    const number = Math.max(1, Math.round(Number(svc.number) || 1));
    const entry = cat.lkaat.get(code);
    const push = (level: MapperLogLevel, message: string, tardocCode = "") => log.push({ level, message, serviceCode, tardocCode, session });
    if (!entry) { push("LKAAT_VALIDATION_NOT_FOUND", `Code LKAAT inconnu: ${serviceCode}`); continue; }
    const sideMapping = entry.mappingType === "side_mapping" ? entry.mappingArguments : undefined;
    const target = sideMapping ? nodots(sideMapping.oneSide) : code;
    const tardoc = cat.tardoc.get(target);
    if (!tardoc) { push("LKAAT_VALIDATION_TRIGGER", ""); continue; } // flat-rate gesture, goes to the grouper
    if (side === "B") { push("TARDOC_VALIDATION_DELETE", "Side B is not allowed for codes that are mapped to TARDOC. See TARDOC GI-17."); continue; }
    const needsSide = sideMapping ? entry.hasSide : Boolean(tardoc.hasSide);
    if (!needsSide) side = "";
    const dup = `${session}|${code}|${side}`;
    if (seen.has(dup)) { push("LKAAT_VALIDATION_DUPLICATE", "Prestation en double dans la séance"); continue; }
    seen.add(dup);
    push("INFO", "", dotted(target));
    added.push({ code: target, serviceCode, number, side, session, missingSide: needsSide && !side });
  }

  const sessions = [...new Set(added.map((t) => t.session))];
  const result: MapperTarpo[] = [];
  for (const session of sessions) {
    const tarpos = added.filter((t) => t.session === session);
    const alive = new Set(tarpos);
    const del = (t: MapperTarpo, level: MapperLogLevel, message: string) => {
      alive.delete(t);
      log.push({ level, message, serviceCode: t.serviceCode, tardocCode: dotted(t.code), session });
    };
    for (const t of tarpos) {
      const entry = cat.tardoc.get(t.code)!;
      if (t.missingSide) {
        del(t, "TARDOC_VALIDATION_DELETE", "Missing or unknown side");
        continue;
      }
      const masters = (entry.masters ?? []).map(nodots);
      if (masters.length && !tarpos.some((o) => masters.includes(o.code))) {
        del(t, "MISSING_MASTER", `Missing master code: ${masters.join(", ")}`);
        continue;
      }
      for (const rule of entry.rules) {
        if (!alive.has(t)) break;
        const others = [...alive].filter((o) => o !== t && o.code !== t.code && (rule.type !== "CumulationRule" || rule.context !== "side" || o.side === t.side));
        if (rule.type === "CumulationRule") {
          const list = rule.codes.map(nodots);
          if (rule.cumulationType === "E" && others.some((o) => list.includes(o.code))) {
            del(t, "TARDOC_VALIDATION_DELETE", `E: Not combinable with: [${list.join(", ")}]`);
          } else if (rule.cumulationType === "X" && others.some((o) => !list.includes(o.code))) {
            del(t, "TARDOC_VALIDATION_DELETE", `X: Only combinable with: [${list.join(", ")}]`);
          }
        } else if (rule.type === "MaxNumberRule") {
          // Tarifmatcher caps each TARPO on its own (duplicates were removed above).
          if (t.number > rule.maxNumber) {
            log.push({ level: "TARDOC_VALIDATION_UPDATE", message: `${rule.description} (${t.number} => ${rule.maxNumber})`, serviceCode: t.serviceCode, tardocCode: dotted(t.code), session });
            t.number = rule.maxNumber;
          }
        } else if (rule.type === "AgeRule") {
          const ok = ageCondition(rule, input);
          if (ok === false) del(t, "TARDOC_VALIDATION_DELETE", html(rule.description));
          else if (ok === null) log.push({ level: "WARNING", message: `${html(rule.description)} (âge inconnu)`, serviceCode: t.serviceCode, tardocCode: dotted(t.code), session });
        } else if (rule.type === "UndecidableRule") {
          log.push({ level: "WARNING", message: rule.description, serviceCode: t.serviceCode, tardocCode: dotted(t.code), session });
        }
      }
    }
    for (const g of cat.groups) {
      const members = new Set((g.tardocs ?? []).map(nodots));
      for (const rule of g.rules) {
        if (rule.type === "MaxNumberRule") {
          const keys = rule.context === "side" ? (["", "L", "R", "B"] as MapperSide[]) : [null];
          for (const k of keys) {
            const inGroup = [...alive].filter((o) => members.has(o.code) && (k === null || o.side === k));
            const before = inGroup.reduce((n, o) => n + o.number, 0);
            if (before <= rule.maxNumber) continue;
            let room = rule.maxNumber;
            for (const o of inGroup) {
              const keep = Math.min(o.number, room);
              room -= keep;
              if (keep === 0) alive.delete(o);
              else o.number = keep;
            }
            log.push({ level: "TARDOC_VALIDATION_UPDATE", message: `${g.code}: ${rule.description} (${before} => ${rule.maxNumber})`, serviceCode: inGroup[0].serviceCode, tardocCode: dotted(inGroup[0].code), session });
          }
        } else if (rule.type === "UndecidableRule") {
          for (const o of [...alive].filter((x) => members.has(x.code))) {
            log.push({ level: "WARNING", message: rule.description, serviceCode: o.serviceCode, tardocCode: dotted(o.code), session });
          }
        }
      }
    }
    result.push(...tarpos.filter((t) => alive.has(t)).map((t) => {
      const out = { ...t };
      delete out.missingSide;
      return out;
    }));
  }
  return { tarpos: result, log };
}
