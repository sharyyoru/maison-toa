import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateTardocLocal } from "@/lib/oaatCatalog";
import { mapTardoc, nodots } from "@/lib/tardocMapper";
import { evaluatePcs, loadPcs } from "@/lib/pcsGrouper";
import { runLocalGrouper } from "@/lib/acfGrouper";
import { groupFlatRate } from "@/lib/tarifmatcher";

// Pins the 2026 revision (TARDOC 1.4c, LKAAT 1.0c, ambP V1.1d_lk) to the
// official OAAT archive and to the Tarifmatcher 1.2.1 Java tool.

const dir = "src/data/oaat/2026";
const meta = JSON.parse(readFileSync(`${dir}/meta.json`, "utf8"));
const local: Record<string, string> = {
  grouper: "grouper.json",
  capAssignment: "cap_assignment.json",
  tarifmatcherTardoc: "tarifmatcher_tardoc.json",
  tarifmatcherLkaat: "tarifmatcher_lkaat.json",
  costWeights: "cost_weights.csv",
};
for (const [k, f] of Object.entries(meta.sources as Record<string, { file: string; sha256: string }>)) {
  // The Cloud Run grouper serves the archive files byte for byte; the app copy is the same data, minified.
  const official = readFileSync(`tarifmatcher-server/tariffs/${f.file.split("/").pop()}`);
  assert.equal(createHash("sha256").update(official).digest("hex"), f.sha256, `tarifmatcher-server copy of ${f.file} differs`);
  const app = readFileSync(`${dir}/${local[k]}`, "utf8");
  if (local[k].endsWith(".json")) assert.deepEqual(JSON.parse(app), JSON.parse(official.toString("utf8")), `${local[k]} differs from ${f.file}`);
  else assert.equal(app, official.toString("utf8"), `${local[k]} differs from ${f.file}`);
}
{
  const g = loadPcs("2026", "grouper");
  assert.equal(g.application_year, "2026");
  assert.equal(g.version, "V1.1d_lk");
  assert.equal(loadPcs("2026", "cap_assignment").version, "V1.1d_lk");
}

// --- Official Tarifmatcher parity: expected outputs come from the Java tool. ---
const fx = JSON.parse(readFileSync("src/__tests__/fixtures/tarifmatcher-2026.json", "utf8"));
{
  const key = (t: { code: string; number: number; side: string; session: number }) =>
    `${nodots(t.code)}x${Number(t.number)}@${t.side === "NONE" ? "" : t.side}#${t.session}`;
  let bad = 0;
  for (const c of fx.mapper) {
    const r = mapTardoc({ services: c.services, birthDate: c.birth, ageYears: c.age, date: "2026-03-01" }, "2026");
    const got = r.tarpos.map(key).sort();
    if (JSON.stringify(got) !== JSON.stringify(c.expected) && bad++ < 3) console.error("mapper", c.id, got, c.expected);
  }
  assert.equal(bad, 0, `${bad}/${fx.mapper.length} mapper cases differ from Tarifmatcher`);
}
for (const file of ["grouper", "cap_assignment"] as const) {
  const sys = loadPcs("2026", file);
  let bad = 0;
  for (const c of fx[file]) {
    const r = evaluatePcs(sys, { services: c.services, diagnoses: c.dx, drugs: c.drugs, ageYears: c.age, sex: c.sex || null });
    if (r.group !== c.expected && bad++ < 3) console.error(file, c.id, r.group, c.expected);
  }
  assert.equal(bad, 0, `${bad}/${fx[file].length} ${file} cases differ from Tarifmatcher`);
}

// --- App grouping path (values from the official jar). ---
const grp = (icdCode: string, patientSex: number, date: string) =>
  runLocalGrouper({ icdCode, patientSex, patientBirthdate: "1966-01-01", services: [{ code: "C09.AC.0140" }], date });
{
  const r = grp("N64.8", 1, "2026-03-01");
  assert.equal(r.groupingStatusList, "C09.41B");
  assert.match(r.grouperVersion, /V1\.1d_lk/);
  assert.equal(r.acfCodes[0].tp, 5652.25);
  assert.equal(grp("N64.8", 1, "2027-03-01").groupingStatusList, "C09.18B");
  // V1.1d has sex-specific chapters.
  assert.equal(grp("N40", 0, "2026-03-01").groupingStatusList, "C90.01B");
  assert.equal(grp("N40", 1, "2026-03-01").groupingStatusList, "C99.80Z");
  assert.equal(grp("N64.8", 1, "2026-12-31").grouperSource, "local");
}

// "services in table (X) < n" counts distinct code+side pairs, not quantities (checked against the jar).
{
  const run = (date: string, icdCode: string, services: Array<{ code: string; quantity?: number; side?: number }>) =>
    runLocalGrouper({ icdCode, patientBirthdate: "1970-01-01", services, date }).groupingStatusList;
  assert.equal(run("2026-03-01", "K83.1", [{ code: "C07.AB.0070", quantity: 2 }]), "C07.60F");
  assert.equal(run("2026-03-01", "K83.1", [{ code: "C07.AB.0070" }, { code: "C07.AB.0070" }]), "C07.60F");
  assert.equal(run("2026-03-01", "K83.1", [{ code: "C07.AB.0070" }, { code: "C07.AB.0060" }]), "C07.60C");
  assert.equal(run("2026-03-01", "K83.1", [{ code: "C07.AB.0070" }, { code: "C07.AB.0060" }, { code: "C07.AB.0090" }]), "C07.60A");
  assert.equal(run("2026-03-01", "K83.1", [{ code: "C07.AB.0070", side: 1 }, { code: "C07.AB.0070", side: 2 }]), "C07.60C");
  assert.equal(run("2026-03-01", "K83.1", [{ code: "C07.AB.0070", side: 3 }]), "C07.60F");
  assert.equal(run("2027-03-01", "T93.2", [{ code: "C08.QD.0010", quantity: 3 }]), "C08.50D");
  assert.equal(run("2027-03-01", "T93.2", [{ code: "C08.QD.0010", side: 1 }, { code: "C08.QD.0010", side: 2 }]), "C08.50C");
  assert.equal(run("2027-03-01", "T93.2", [{ code: "C08.QD.0010" }, { code: "C08.PC.0020" }]), "C08.50C");
  assert.equal(run("2027-03-01", "T93.2", [{ code: "C08.AD.0050" }, { code: "C08.AD.0010" }, { code: "C08.AD.0020" }]), "C08.10A");
}

// --- TARDOC checks use the official 2026 Tarifmatcher rules. ---
{
  const base = { referenceCode: "", sessionNumber: 1, date: "2026-11-04", side: 0, tpValueMT: 0.96, externalFactorMT: 1, tpValueTT: 0.96, externalFactorTT: 1 };
  const v = validateTardocLocal([{ ...base, code: "AA.00.0010", quantity: 1 }], { birthDate: "1980-01-01" });
  assert.match(v.catalogVersion, /1\.4c/);
  assert.equal(v.services[0].accepted, true);
  const capped = validateTardocLocal([{ ...base, code: "AA.00.0010", quantity: 2 }]);
  assert.equal(capped.valid, false);
}

// --- External TarifMatcher service: official result wins, outage falls back. ---
(async () => {
  const realFetch = globalThis.fetch;
  const input = { icdCode: "N64.8", patientSex: 1, patientBirthdate: "1966-01-01", services: [{ code: "C09.AC.0140", side: 1 }], date: "2026-03-01" };
  process.env.TARIFMATCHER_URL = "https://tm.example.test/";
  process.env.TARIFMATCHER_SECRET = "s3cret";
  let sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
  const reply = (flatRate: string, applicationYear = 2026) =>
    (async (url: string, init: RequestInit) => {
      sent = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ ok: true, applicationYear, results: [{ flatRate, costWeight: 1, mappedTardocs: [] }], warnings: [] }));
    }) as unknown as typeof fetch;
  try {
    globalThis.fetch = reply("C09.41B");
    const same = await groupFlatRate(input);
    assert.equal(same.grouperSource, "tarifmatcher");
    assert.equal(same.groupingStatusList, "C09.41B");
    assert.equal(sent!.url, "https://tm.example.test/group");
    assert.equal(sent!.headers["x-tarifmatcher-secret"], "s3cret");
    assert.deepEqual(sent!.body, {
      services: [{ code: "C09.AC.0140", side: "L", number: 1 }],
      diagnoses: ["N64.8"],
      ageYears: 60,
      sex: "W",
      serviceDate: "2026-03-01",
      applicationYear: 2026,
    });

    globalThis.fetch = reply("C09.18B");
    const differ = await groupFlatRate(input);
    assert.equal(differ.groupingStatusList, "C09.18B", "official result wins");
    assert.equal(differ.acfCodes.length, 0, "C09.18B is not a 2026 flat rate");
    assert.match(differ.warnings.join(" "), /built-in grouper said C09\.41B/);

    globalThis.fetch = reply("C09.41B", 2027);
    const wrongYear = await groupFlatRate(input);
    assert.equal(wrongYear.grouperSource, "local", "a reply for another tariff year is not trusted");

    globalThis.fetch = (async () => { throw new Error("connect ECONNREFUSED"); }) as unknown as typeof fetch;
    const down = await groupFlatRate(input);
    assert.equal(down.grouperSource, "local");
    assert.equal(down.groupingStatusList, "C09.41B");
    assert.match(down.warnings.join(" "), /unavailable.*ECONNREFUSED/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.TARIFMATCHER_URL;
    delete process.env.TARIFMATCHER_SECRET;
  }
  console.log("oaat2026 tests passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
