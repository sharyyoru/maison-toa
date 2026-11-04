import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getTardocPosition,
  searchTardoc,
  searchTardocByChapter,
  searchTardocAdditional,
  tardocChapters,
  validateTardocLocal,
  searchAcfLocal,
  acfChaptersLocal,
  validateAcfLocal,
  searchTmaLocal,
  searchTmaSlavesLocal,
  tmaChaptersLocal,
  tardocData,
} from "@/lib/oaatCatalog";

// The Sumex1 validators are gone; these tests pin the local catalogue that
// replaced them to the official OAAT publication.

// --- Provenance: meta.json records the sources and sizes we imported. ---
{
  const meta = JSON.parse(readFileSync("src/data/oaat/meta.json", "utf8"));
  assert.match(meta.tardoc.version, /^TARDOC 1\.4c/);
  assert.equal(meta.tardoc.positions, tardocData().positions.length);
  for (const key of ["A2", "A1", "LKAAT"]) {
    assert.match(meta.sources[key].sha256, /^[0-9a-f]{64}$/);
    assert.match(meta.sources[key].url, /^https:\/\/oaat-otma\.ch\//);
  }
}

// --- Known values from Annex A2 (TARDOC 1.4c). ---
{
  const aa = getTardocPosition("AA.00.0010")!;
  assert.equal(aa.name, "Consultation médicale, 5 premières min");
  assert.equal(aa.tpMT, 10.56);
  assert.equal(aa.tpTT, 8.64);
  assert.equal(aa.type, "H");
  assert.equal(aa.maxPerSession, 1);
  assert.ok(aa.nonCumulable.includes("AA.00.0030"));

  const sup = getTardocPosition("aa.00.0020")!; // case-insensitive lookup
  assert.equal(sup.type, "Z");
  assert.deepEqual(sup.parents, ["AA.00.0010"]);
  assert.equal(sup.maxPerSession, 15);
  assert.equal(getTardocPosition("ZZ.99.9999"), null);
}

// --- Search / browse behave like the Sumex calls they replace. ---
{
  assert.ok(searchTardoc("AA.00").services.every((s) => s.code.startsWith("AA.00")));
  assert.ok(searchTardoc("AA.00").count >= 4);
  assert.ok(searchTardoc("consultation").services.some((s) => s.code === "AA.00.0010"), "name search");
  assert.ok(searchTardoc("Consultation medicale").services.some((s) => s.code === "AA.00.0010"), "accent-insensitive");
  assert.ok(searchTardoc("AA.00", true).services.every((s) => s.serviceType !== "Z"), "mainOnly drops supplements");
  assert.ok(searchTardocByChapter("AA.00").services.every((s) => s.chapter === "AA.00"));
  assert.ok(tardocChapters("").some((c) => c.code === "A") && tardocChapters("").some((c) => c.code === "AA.00"));
  const add = searchTardocAdditional("AA.00.0010").services;
  const s20 = add.find((s) => s.code === "AA.00.0020");
  assert.ok(s20 && s20.additionalServiceReferenceCode === "AA.00.0010", "supplements of AA.00.0010");
  const rec = searchTardoc("AA.00.0020").services[0];
  assert.equal(rec.masterCode, "AA.00.0010", "single-parent supplement exposes masterCode for ref autofill");
}

// --- Local validator: catalogue rules. ---
{
  const base = { quantity: 1, date: "2026-11-04", tpValueMT: 0.93, tpValueTT: 0.93 };
  const ok = validateTardocLocal([
    { ...base, code: "AA.00.0010" },
    { ...base, code: "AA.00.0020", quantity: 10, referenceCode: "AA.00.0010" },
  ]);
  assert.equal(ok.valid, true, JSON.stringify(ok.services));
  // 10.56+8.64 = 19.20 pts; 21.10 + 17.30 = 38.40 pts for 10 x AA.00.0020
  assert.equal(ok.summary!.totalCharge, Math.round((19.2 * 0.93 + 38.4 * 0.93) * 100) / 100);

  const unknown = validateTardocLocal([{ ...base, code: "ZZ.99.9999" }]);
  assert.equal(unknown.valid, false);

  const tooMany = validateTardocLocal([{ ...base, code: "AA.00.0010", quantity: 2 }]);
  assert.equal(tooMany.valid, false);
  assert.match(tooMany.services[0].errorMessage!, /<= 1 fois par séance/);

  const orphan = validateTardocLocal([{ ...base, code: "AA.00.0020" }]);
  assert.equal(orphan.valid, false, "supplement without its main position");

  const conflict = validateTardocLocal([{ ...base, code: "AA.00.0010" }, { ...base, code: "AA.00.0030" }]);
  assert.equal(conflict.valid, false, "AA.00.0010 is not cumulable with AA.00.0030");

  // Separate sessions do not conflict.
  const sessions = validateTardocLocal([
    { ...base, code: "AA.00.0010", sessionNumber: 1 },
    { ...base, code: "AA.00.0030", sessionNumber: 2 },
  ]);
  assert.equal(sessions.valid, true, JSON.stringify(sessions.services));

  const sided = tardocData().positions.find((p) => p.sideRequired && !p.parents.length && !p.supplementTo.length)!;
  assert.equal(validateTardocLocal([{ ...base, code: sided.code }]).valid, false, "side required");
  assert.equal(validateTardocLocal([{ ...base, code: sided.code, side: 1 }]).services[0].accepted, true);
}

// --- ACF flat rates (Annex A1). ---
{
  const c = searchAcfLocal("C00.80A").services[0];
  assert.equal(c.tp, 3839.26, "Swiss thousands separator parsed");
  assert.equal(c.chapterCode, "Prae-Cap");
  assert.ok(searchAcfLocal("*", "Cap02").services.every((s) => s.code.startsWith("C02")));
  assert.ok(acfChaptersLocal().some((ch) => ch.code === "Cap09"));

  const v = validateAcfLocal([{ code: "C00.80A", externalFactor: 1, quantity: 1 }, { code: "C01.00Z" }, { code: "NOPE" }]);
  assert.equal(v.validatedServices.length, 1);
  assert.equal(v.validatedServices[0].amount, 3839.26);
  assert.match(v.addResults[1].abortInfo!, /non évalué/);
  assert.equal(v.addResults[2].success, false);
}

// --- CPTMA / LKAAT gestures (TMA). ---
{
  const p = searchTmaLocal("C00.BA.0010").services[0];
  assert.equal(p.tmaType, 3);
  assert.equal(p.isGrouperRelevant, true);
  assert.equal(p.chapterCode, "Prae-Cap");
  const ez = searchTmaLocal("AA.00.0020").services[0];
  assert.equal(ez.needsRefCode, true);
  assert.equal(ez.referenceCode, "AA.00.0010");
  assert.ok((ez.serviceProperties & 32) !== 0, "IsNeedsRefCode bit");
  assert.ok(searchTmaSlavesLocal("AA.00.0010").services.some((s) => s.code === "AA.00.0020"));
  assert.ok(searchTmaLocal("*", "", "", 0, true).services.every((s) => s.isGrouperRelevant));
  assert.ok(tmaChaptersLocal().length > 10);
}

console.log("oaatCatalog: all assertions passed");
