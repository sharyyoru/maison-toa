import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  acfData,
  catalogInfo,
  getTardocPosition,
  lkaatData,
  searchTmaLocal,
  tardocData,
  tariffYearFor,
  validateTardocLocal,
} from "@/lib/oaatCatalog";
import { mapTardoc, nodots } from "@/lib/tardocMapper";
import { evaluatePcs, loadPcs } from "@/lib/pcsGrouper";
import { runLocalGrouper } from "@/lib/acfGrouper";

// Pins the 2027 revision (TARDOC 1.5, ambulatory flat rates 1.2, LKAAT 1.1,
// Tarifmatcher 1.2) to the official archive, and checks the 2026 catalogue
// still applies to treatments up to 31 Dec 2026.

// --- Tariff year follows the treatment date (Swiss local day). ---
assert.equal(tariffYearFor("2026-12-31"), "2026");
assert.equal(tariffYearFor("2027-01-01"), "2027");
assert.equal(tariffYearFor("2026-12-31T23:30:00.000Z"), "2027"); // 00:30 in Zurich
assert.equal(tariffYearFor("2026-12-31T22:30:00.000Z"), "2026");
assert.equal(tariffYearFor("2025-06-01"), "2026");
assert.equal(tariffYearFor("2028-03-01"), "2027");
assert.equal(tariffYearFor("2027"), "2027");
assert.equal(tariffYearFor("2026"), "2026");

// --- Versions and provenance. ---
assert.match(tardocData("2026-06-01").version, /1\.4c/);
assert.match(tardocData("2027-06-01").version, /1\.5/);
assert.match(acfData("2027-06-01").version, /1\.2/);
assert.match(lkaatData("2027-06-01").version, /1\.1/);
assert.equal(catalogInfo("2026-06-01").tariffYear, "2026");
assert.equal(catalogInfo("2027-06-01").tariffYear, "2027");
{
  const meta = JSON.parse(readFileSync("src/data/oaat/2027/meta.json", "utf8"));
  for (const key of ["A2", "A1", "LKAAT", "tarifmatcherTardoc", "tarifmatcherLkaat", "grouper", "capAssignment", "costWeights", "tarifmatcher"]) {
    assert.match(meta.sources[key].sha256, /^[0-9a-f]{64}$/, key);
  }
  assert.equal(meta.sources.grouper.application_year, "2027");
  assert.equal(meta.sources.grouper.grouper_hash, "9957438a553d188cd75af26d7f4edd41fa21e8ef");
  assert.equal(tardocData("2027-06-01").positions.length, meta.tardoc.positions);
  assert.equal(lkaatData("2027-06-01").services.length, 3371);
}

// --- Lookups pick the right catalogue. ---
{
  const p26 = getTardocPosition("AA.00.0010", "2026-06-01");
  const p27 = getTardocPosition("AA.00.0010", "2027-06-01");
  assert.ok(p26 && p27);
  const fromDb = JSON.parse(readFileSync("src/data/oaat/2027/tarifmatcher_tardoc.json", "utf8"));
  const official = fromDb.entries.find((e: { code: string }) => nodots(e.code) === "AA000010");
  assert.equal(p27.tpMT, official.taxpointsAL);
  assert.equal(p27.tpTT, official.taxpointsIPL);
}

// --- ACF 1.2 tax points equal the official cost weights (catalog_ambP_12.csv). ---
{
  const csv = readFileSync("src/data/oaat/2027/cost_weights.csv", "utf8").trim().split(/\r?\n/).slice(1);
  const byCode = new Map(acfData("2027-06-01").services.map((s) => [s.code, s.tp]));
  assert.ok(csv.length > 400);
  for (const line of csv) {
    const [code, w] = line.split(";");
    // 0.0 = "non évalué" in the annex; the catalogue keeps tp null.
    if (Number(w) === 0) { assert.equal(byCode.get(code), null, code); continue; }
    assert.ok(Math.abs((byCode.get(code) ?? NaN) - Number(w.replace(",", "."))) < 0.005, code);
  }
}

// --- LKAAT type R is a known 2027 type. ---
{
  const r = lkaatData("2027-06-01").services.filter((s) => s.type === "R");
  assert.equal(r.length, 19);
  assert.equal(searchTmaLocal(r[0].code, "", "", 0, false, "2027-06-01").count, 1);
}

// --- Side mappings (Tarifmatcher 1.2). ---
{
  const one = mapTardoc({ services: [{ code: "RC.25.0021", side: "L" }], date: "2027-03-01" });
  assert.deepEqual(one.tarpos.map((t) => [nodots(t.code), t.side]), [["RC250020", "L"]]);
  // Both sides = one L + one R line; side "B" itself is refused (GI-17), as in Tarifmatcher.
  const both = mapTardoc({ services: [{ code: "RC.25.0021", side: "L" }, { code: "RC.25.0021", side: "R" }], date: "2027-03-01" });
  assert.deepEqual(both.tarpos.map((t) => nodots(t.code)), ["RC250030"]);
  const b = mapTardoc({ services: [{ code: "RC.25.0021", side: "B" }], date: "2027-03-01" });
  assert.equal(b.tarpos.length, 0);
  assert.match(b.log[0].message, /GI-17/);
}

// --- Official Tarifmatcher parity: expected outputs come from the Java tool. ---
const fx = JSON.parse(readFileSync("src/__tests__/fixtures/tarifmatcher-2027.json", "utf8"));
{
  const key = (t: { code: string; number: number; side: string; session: number }) =>
    `${nodots(t.code)}x${Number(t.number)}@${t.side === "NONE" ? "" : t.side}#${t.session}`;
  let bad = 0;
  for (const c of fx.mapper) {
    const r = mapTardoc({ services: c.services, birthDate: c.birth, ageYears: c.age, date: "2027-03-01" });
    const got = r.tarpos.map(key).sort();
    if (JSON.stringify(got) !== JSON.stringify(c.expected)) {
      if (bad++ < 3) console.error("mapper", c.id, got, c.expected);
    }
  }
  assert.equal(bad, 0, `${bad}/${fx.mapper.length} mapper cases differ from Tarifmatcher`);
}
for (const file of ["grouper", "cap_assignment"] as const) {
  const sys = loadPcs("2027", file);
  let bad = 0;
  for (const c of fx[file]) {
    const r = evaluatePcs(sys, { services: c.services, diagnoses: c.dx, drugs: c.drugs, ageYears: c.age });
    if (r.group !== c.expected && bad++ < 3) console.error(file, c.id, r.group, c.expected);
  }
  assert.equal(bad, 0, `${bad}/${fx[file].length} ${file} cases differ from Tarifmatcher`);
}

// --- App paths dispatch on the treatment date. ---
{
  const c = fx.grouper.find((x: { expected: string }) => x.expected && x.expected !== "NO.ambP");
  const r = runLocalGrouper({
    icdCode: c.dx[0],
    services: c.services.map((s: { code: string; side: string; number: number }) => ({ code: s.code, side: s.side, quantity: s.number })),
    patientBirthdate: `${2027 - c.age - 1}-01-01`,
    date: "2027-06-01",
  });
  assert.equal(r.groupingStatusList, c.expected);
  assert.match(r.grouperVersion, /V1\.2_lk/);

  const v = validateTardocLocal(
    [{ code: "AA.00.0010", referenceCode: "", quantity: 1, sessionNumber: 1, date: "2027-02-01", side: 0, tpValueMT: 0.96, externalFactorMT: 1, tpValueTT: 0.96, externalFactorTT: 1 }],
    { birthDate: "1980-01-01" },
  );
  assert.match(v.catalogVersion, /1\.5/);
  assert.equal(v.services[0].accepted, true);
  const v26 = validateTardocLocal([
    { code: "AA.00.0010", referenceCode: "", quantity: 1, sessionNumber: 1, date: "2026-12-30", side: 0, tpValueMT: 0.96, externalFactorMT: 1, tpValueTT: 0.96, externalFactorTT: 1 },
  ]);
  assert.match(v26.catalogVersion, /1\.4c/);
}

console.log("oaat2027 tests passed");
