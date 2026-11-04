/**
 * Imports the official OAAT-OTMA outpatient tariff catalogues into versioned
 * JSON under src/data/oaat/, replacing the catalogue lookups that used to go
 * to the (now unreachable) Sumex1 validator servers.
 *
 * Sources — the public annexes approved by the Federal Council, published at
 * https://oaat-otma.ch/fr/informations/conventions-et-les-annexes
 *   A2  TARDOC 1.4c catalogue
 *   A1  Ambulatory flat rates (forfaits ambulatoires / ACF) 1.1c
 *   CPTMA/LKAAT 1.0c service catalogue (the "TMA" gesture codes)
 *
 * Nothing is typed in by hand: every value comes from those files, and the
 * SHA-256 of each source is recorded in meta.json so the data can be traced
 * back to the exact publication.
 *
 * Usage:
 *   npx tsx scripts/import-oaat-catalogs.ts              # download from oaat-otma.ch
 *   npx tsx scripts/import-oaat-catalogs.ts --dir <path> # use local A2.xlsx, A1.xlsx, LKAAT.xlsx
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as XLSX from "xlsx";

const BASE =
  "https://oaat-otma.ch/fileadmin/redaktion/dokumente/FR/Gesamt-Tarifsystem/Vertraege_und_Anhaenge";
const SOURCES = {
  A2: `${BASE}/Anhang_A2_Katalog_des_TARDOC_1.4c_FR.xlsx`,
  A1: `${BASE}/Anhang_A1_Katalog_der_Ambulanten_Pauschalen_v1.1c_FR.xlsx`,
  LKAAT: `${BASE}/LKAAT_1.0c_Leistungskatalog_ambulante_Arzttarife_FR.xlsx`,
} as const;
type SourceKey = keyof typeof SOURCES;

const OUT_DIR = resolve("src/data/oaat");
const CODE_RE = /[A-Z]{2}\.\d{2}\.\d{4}/g;

async function loadSource(key: SourceKey, dir: string | null): Promise<Buffer> {
  if (dir) return readFileSync(join(dir, `${key}.xlsx`));
  const res = await fetch(SOURCES[key]);
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status} from ${SOURCES[key]}`);
  return Buffer.from(await res.arrayBuffer());
}

function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/_x000D_/g, "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Swiss thousands separators appear as text, e.g. "3'839.26".
  const s = clean(v).replace(/['’\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function rowsOf(wb: XLSX.WorkBook, sheet: string): unknown[][] {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`Sheet not found: ${sheet} (have: ${wb.SheetNames.join(", ")})`);
  // Always read from A1 so column indexes are stable even when the sheet's
  // used range starts at column B.
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  range.s = { r: 0, c: 0 };
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, range });
}

/** Locate the header row by its first column label, so column order changes fail loudly. */
function headerIndex(rows: unknown[][], firstLabel: string): number {
  const idx = rows.findIndex((r) => clean(r[1]).toLowerCase().startsWith(firstLabel.toLowerCase()));
  if (idx < 0) throw new Error(`Header "${firstLabel}" not found`);
  return idx;
}

function expectColumns(header: unknown[], expected: string[]) {
  expected.forEach((label, i) => {
    const got = clean(header[i + 1]).toLowerCase();
    if (!got.startsWith(label.toLowerCase())) {
      throw new Error(`Unexpected column ${i + 1}: "${clean(header[i + 1])}" (expected "${label}")`);
    }
  });
}

// ---------------------------------------------------------------- TARDOC (A2)

/** Codes or chapter prefixes named after "Non cumulable avec". */
function parseNonCumulable(line: string): string[] {
  const out: string[] = [];
  const re = /Non cumulable avec ([A-Z]{2}(?:\.\d{2}(?:\.\d{4})?)?)(?=[\s,]|$)/g;
  for (const m of line.matchAll(re)) out.push(m[1]);
  return out;
}

function parseTardoc(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const versionCell = clean(rowsOf(wb, "Positions tarifaires")[2]?.[1]);

  const posRows = rowsOf(wb, "Positions tarifaires");
  const h = headerIndex(posRows, "P-Num");
  expectColumns(posRows[h], [
    "P-Num", "Prestation", "Interpr", "PM", "PIP", "Valeur intrins", "Obligation",
    "Type", "Parent", "Chapitre", "Positions pr", "Unit", "Prestation au sens",
    "Temps d", "Temps de changement", "Classe d'intervention", "R",
  ]);

  const positions = posRows.slice(h + 1).filter((r) => clean(r[1])).map((r) => {
    const rules = clean(r[17]).split("\n").map((s) => s.trim()).filter(Boolean);
    let maxPerSession: number | null = null;
    const nonCumulable = new Set<string>();
    const supplementTo = new Set<string>();
    let sideRequired = false;
    for (const line of rules) {
      const m = line.match(/^<=\s*(\d+)\s*fois par séance/);
      if (m) maxPerSession = Number(m[1]);
      parseNonCumulable(line).forEach((c) => nonCumulable.add(c));
      if (line.startsWith("Supplément à")) (line.match(CODE_RE) || []).forEach((c) => supplementTo.add(c));
      if (/côté doit être indiqué/.test(line)) sideRequired = true;
    }
    const interpretation = clean(r[3]);
    return {
      code: clean(r[1]),
      name: clean(r[2]),
      interpretation: interpretation === "\\-" ? "" : interpretation,
      tpMT: num(r[4]) ?? 0,
      tpTT: num(r[5]) ?? 0,
      dignity: clean(r[6]),
      obligation: clean(r[7]),
      type: clean(r[8]),
      // A supplement (type Z) may attach to several main positions.
      parents: clean(r[9]).match(CODE_RE) ?? [],
      chapter: clean(r[10]),
      functionalUnit: clean(r[12]),
      serviceMin: num(r[13]) ?? 0,
      placeMin: num(r[14]) ?? 0,
      changeMin: num(r[15]) ?? 0,
      interventionClass: clean(r[16]),
      rules,
      maxPerSession,
      nonCumulable: [...nonCumulable],
      supplementTo: [...supplementTo],
      sideRequired,
    };
  });

  const chRows = rowsOf(wb, "Chapitres");
  const ch = headerIndex(chRows, "N° de chapitre");
  const chapters = chRows.slice(ch + 1).filter((r) => clean(r[1])).map((r) => ({
    code: clean(r[1]),
    name: clean(r[2]),
  }));

  const sgRows = rowsOf(wb, "Groupes de prestations");
  const sg = headerIndex(sgRows, "N° groupe");
  const serviceGroups = sgRows.slice(sg + 1).filter((r) => clean(r[1])).map((r) => ({
    code: clean(r[1]),
    name: clean(r[2]),
    codes: clean(r[3]).match(CODE_RE) ?? [],
  }));

  return { version: versionCell, positions, chapters, serviceGroups };
}

// ------------------------------------------------------------------- ACF (A1)

function parseAcf(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const rows = rowsOf(wb, "catalogue");
  const version = clean(rows[2]?.[1]);
  const h = headerIndex(rows, "Position tarifaire");
  expectColumns(rows[h], ["Position tarifaire", "Désignation", "Note", "Points tarifaires", "Valeurs intrins"]);

  const services: Array<{
    code: string; name: string; note: string; tp: number | null; notEvaluated: boolean;
    dignities: string[]; chapterCode: string; chapterName: string;
  }> = [];
  const chapters: Array<{ code: string; name: string }> = [];
  let chapterCode = "";
  let chapterName = "";
  for (const r of rows.slice(h + 2)) {
    const first = clean(r[1]);
    const tpRaw = clean(r[4]);
    const tp = num(r[4]);
    if (!first && clean(r[2]).startsWith("Note de bas de page")) break;
    if (!first) continue;
    if (!clean(r[2])) {
      // Chapter heading row, e.g. "Cap01: Système nerveux", "Prae-Cap".
      const m = first.match(/^(Cap\d{2}):\s*(.+)$/);
      chapterCode = m ? m[1] : first === "Prae-Cap" ? "Prae-Cap" : first;
      chapterName = m ? m[2] : first;
      chapters.push({ code: chapterCode, name: chapterName });
      continue;
    }
    services.push({
      code: first,
      name: clean(r[2]),
      note: clean(r[3]),
      tp,
      // "non évalué": the flat rate exists but has no published amount.
      notEvaluated: tp === null,
      dignities: clean(r[5]).split("\n").map((s) => s.trim()).filter(Boolean),
      chapterCode,
      chapterName,
    });
  }
  return { version, services, chapters };
}

// ----------------------------------------------------------- LKAAT / CPTMA TMA

function parseLkaat(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.SheetNames.find((n) => n.startsWith("CPTMA"));
  if (!sheet) throw new Error(`CPTMA sheet not found (have: ${wb.SheetNames.join(", ")})`);
  const rows = rowsOf(wb, sheet);
  const version = rows.slice(0, 5).map((r) => clean(r[1])).find((v) => /^v\d/.test(v)) ?? "";
  const h = headerIndex(rows, "NCP");
  expectColumns(rows[h], [
    "NCP", "Master", "Type", "Latéralité", "Prestations d'action", "Prestations en temps",
    "Variable est groupable", "Prestations attribuées", "Description", "Interprétation",
  ]);
  const services = rows.slice(h + 1).filter((r) => clean(r[1])).map((r) => {
    const interpretation = clean(r[10]);
    return {
      code: clean(r[1]),
      master: clean(r[2]),
      type: clean(r[3]),
      lateral: clean(r[4]).toLowerCase() === "x",
      action: clean(r[5]).toLowerCase() === "x",
      timed: clean(r[6]).toLowerCase() === "x",
      groupable: clean(r[7]).toLowerCase() === "x",
      assigned: clean(r[8]).toLowerCase() === "x",
      name: clean(r[9]).replace(/^"|"$/g, ""),
      interpretation: interpretation === "\\-" ? "" : interpretation,
    };
  });
  return { version, services };
}

// ----------------------------------------------------------------------- main

async function main() {
  const dirFlag = process.argv.indexOf("--dir");
  const dir = dirFlag >= 0 ? resolve(process.argv[dirFlag + 1]) : null;

  const bufs = {} as Record<SourceKey, Buffer>;
  const meta: Record<string, unknown> = { importedAt: new Date().toISOString(), sources: {} };
  for (const key of Object.keys(SOURCES) as SourceKey[]) {
    bufs[key] = await loadSource(key, dir);
    (meta.sources as Record<string, unknown>)[key] = {
      url: SOURCES[key],
      sha256: createHash("sha256").update(bufs[key]).digest("hex"),
      bytes: bufs[key].length,
    };
  }

  const tardoc = parseTardoc(bufs.A2);
  const acf = parseAcf(bufs.A1);
  const lkaat = parseLkaat(bufs.LKAAT);

  // Sanity checks: fail rather than ship a half-parsed catalogue.
  const dup = (codes: string[]) => codes.length !== new Set(codes).size;
  if (tardoc.positions.length < 1000) throw new Error(`TARDOC: only ${tardoc.positions.length} positions`);
  if (dup(tardoc.positions.map((p) => p.code))) throw new Error("TARDOC: duplicate codes");
  if (acf.services.length < 250) throw new Error(`ACF: only ${acf.services.length} flat rates`);
  if (dup(acf.services.map((s) => s.code))) throw new Error("ACF: duplicate codes");
  const badAcf = acf.services.filter((s) => !/^C\d{2}\.\d{2}[A-Z]$/.test(s.code) && !s.code.startsWith("C"));
  if (badAcf.length) throw new Error(`ACF: unexpected codes ${badAcf.slice(0, 5).map((s) => s.code).join(", ")}`);
  if (lkaat.services.length < 2500) throw new Error(`LKAAT: only ${lkaat.services.length} services`);
  // Spot values that must survive any re-import (AA.00.0010 consultation).
  const aa = tardoc.positions.find((p) => p.code === "AA.00.0010");
  if (!aa || aa.tpMT <= 0 || aa.maxPerSession !== 1 || !aa.nonCumulable.length) {
    throw new Error(`TARDOC: AA.00.0010 parsed wrongly: ${JSON.stringify(aa)}`);
  }
  if (lkaat.services.filter((s) => s.name && s.name !== "-" && s.name !== "\\-").length < lkaat.services.length * 0.9) {
    throw new Error("LKAAT: descriptions missing — column layout changed?");
  }
  const codes = new Set(tardoc.positions.map((p) => p.code));
  const badParents = tardoc.positions.filter((p) => p.parents.some((c) => !codes.has(c)));
  if (badParents.length) throw new Error(`TARDOC: unknown parent codes ${badParents.map((p) => p.code).join(", ")}`);

  Object.assign(meta, {
    tardoc: { version: tardoc.version, positions: tardoc.positions.length, chapters: tardoc.chapters.length },
    acf: { version: acf.version, flatRates: acf.services.length, chapters: acf.chapters.length },
    lkaat: { version: lkaat.version, services: lkaat.services.length },
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "tardoc.json"), JSON.stringify(tardoc));
  writeFileSync(join(OUT_DIR, "acf.json"), JSON.stringify(acf));
  writeFileSync(join(OUT_DIR, "lkaat.json"), JSON.stringify(lkaat));
  writeFileSync(join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
