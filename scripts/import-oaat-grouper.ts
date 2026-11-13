/**
 * Import the OAAT "Definitionshandbuch" — the machine-readable grouping logic
 * for the ambulatory flat rates (ambulante Pauschalen / ACF).
 *
 * Source: the public Tarifbrowser API at tarifbrowser.oaat-otma.ch, which is
 * the same interactive Definitionshandbuch published by the OAAT. Per
 * capitulum it returns the full decision tree (`logik` expressions, leaf
 * `kapitelPauschaleNummer` flat-rate codes) and the code tables those
 * expressions reference (`tabelle/{name}`).
 *
 * This is the data the licensed TarifMatcher grouper applies to a patient
 * case (LKAAT gesture codes + ICD-10 → flat rate). The licensed
 * `system_ambP_*_lkaat.json` file behind OAAT registration contains the same
 * logic in a proprietary envelope; this script pulls the equivalent public
 * rendering so the app can group flat rates without the dead Sumex server.
 *
 * Usage: npx tsx scripts/import-oaat-grouper.ts
 * Output: src/data/oaat/grouper.json (+ checksum recorded in meta.json)
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const API = "https://tarifbrowser.oaat-otma.ch/api/1.0";
const OUT_DIR = path.join(__dirname, "..", "src", "data", "oaat");

type DhNode = {
  bezeichnung?: string;
  id: number;
  kapitelNummer?: string;
  kapitelPauschaleNummer?: string;
  istWeiterleitung?: boolean;
  logik?: string;
  children?: DhNode[];
};

function stripNode(n: DhNode): DhNode {
  return {
    ...(n.bezeichnung ? { bezeichnung: n.bezeichnung } : {}),
    id: n.id,
    ...(n.kapitelNummer ? { kapitelNummer: n.kapitelNummer } : {}),
    ...(n.kapitelPauschaleNummer ? { kapitelPauschaleNummer: n.kapitelPauschaleNummer } : {}),
    ...(n.istWeiterleitung ? { istWeiterleitung: n.istWeiterleitung } : {}),
    ...(n.logik ? { logik: n.logik } : {}),
    children: (n.children || []).map(stripNode),
  };
}

function tableNames(node: DhNode, into: Set<string>) {
  for (const m of (node.logik || "").matchAll(/table\s*\(([^)]+)\)/g)) {
    for (const t of m[1].split(",")) into.add(t.trim());
  }
  (node.children || []).forEach((c) => tableNames(c, into));
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

async function main() {
  const pakets = await getJson<{ bezeichnung: string; publikation: string; istUngueltig: boolean }[]>(
    `${API}/Pakets?language=de`,
  );
  const current = pakets.find((p) => !p.istUngueltig);
  const capitula = await getJson<{ nummer: string }[]>(`${API}/KapitelPauschales?language=de`);

  const trees: Record<string, DhNode> = {};
  const tableSet = new Set<string>();
  for (const cap of capitula) {
    const tree = await getJson<DhNode>(
      `${API}/Definitionshandbuch/${encodeURIComponent(cap.nummer)}?language=de`,
    );
    trees[cap.nummer] = stripNode(tree);
    tableNames(tree, tableSet);
    await new Promise((r) => setTimeout(r, 50));
  }

  const tables: Record<string, { bezeichnung: string; text: string; codes: string[] }> = {};
  const missing: string[] = [];
  for (const name of [...tableSet].sort()) {
    try {
      const t = await getJson<{ bezeichnung?: string; text?: string; codes?: string[] }>(
        `${API}/Definitionshandbuch/tabelle/${encodeURIComponent(name)}?language=de`,
      );
      tables[name] = {
        bezeichnung: t.bezeichnung || name,
        text: t.text || "",
        codes: t.codes || [],
      };
    } catch {
      missing.push(name);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (missing.length) throw new Error(`Tables not found: ${missing.join(", ")}`);

  const out = {
    version: `ambP Definitionshandbuch ${current?.bezeichnung || "?"} (Publikation ${current?.publikation || "?"})`,
    source: API,
    importedAt: new Date().toISOString(),
    trees,
    tables,
  };
  const json = JSON.stringify(out);
  fs.writeFileSync(path.join(OUT_DIR, "grouper.json"), json);

  const metaPath = path.join(OUT_DIR, "meta.json");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  meta.sources = meta.sources || {};
  meta.sources.grouper = {
    url: API,
    sha256: crypto.createHash("sha256").update(json).digest("hex"),
    bytes: Buffer.byteLength(json),
  };
  meta.grouper = { version: out.version, capitula: capitula.length, tables: tableSet.size };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log(`Imported ${capitula.length} capitula, ${tableSet.size} tables -> grouper.json (${Buffer.byteLength(json)} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
