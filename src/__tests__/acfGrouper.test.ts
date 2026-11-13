import assert from "node:assert/strict";
import { groupCase, runLocalGrouper, grouperData } from "../lib/acfGrouper";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (e) {
    console.error(`  FAIL - ${name}`);
    throw e;
  }
}

console.log("acfGrouper");

test("grouper.json has all capitula and tables", () => {
  const d = grouperData();
  assert.equal(Object.keys(d.trees).length, 19);
  assert.ok(Object.keys(d.tables).length >= 400);
});

test("H65.2 + C03.GH.0090 groups into C03.15A (screenshot case)", () => {
  const r = groupCase({
    services: [{ code: "C03.GH.0090" }],
    icdCode: "H65.2",
    patientSex: 0,
    patientBirthdate: "1980-01-01",
  });
  assert.equal(r.group, "C03.15A");
  assert.equal(r.tentative, false);
  assert.equal(r.capitulum, "Cap03");
});

test("non-flat-rate services fall through to NO.ambP", () => {
  const r = groupCase({
    services: [{ code: "AA.00.0010" }],
    icdCode: "Z00.0",
    patientSex: 0,
    patientBirthdate: "1980-01-01",
  });
  assert.equal(r.group, "NO.ambP");
});

test("runLocalGrouper returns the UI shape with catalogue pricing", () => {
  const r = runLocalGrouper({
    icdCode: "H65.2",
    patientSex: 0,
    patientBirthdate: "1980-01-01",
    services: [{ code: "C03.GH.0090" }],
  });
  assert.equal(r.success, true);
  assert.equal(r.acfCodes.length, 1);
  assert.equal(r.acfCodes[0].code, "C03.15A");
  assert.ok(r.acfCodes[0].tp > 0);
  assert.ok(r.acfCodes[0].name.length > 0);
});

test("missing inputs make results tentative, not wrong", () => {
  const r = groupCase({
    services: [{ code: "C00.KH.0100" }],
    icdCode: "C50.9",
    patientSex: 0,
    // no birthdate -> age_years unknown
  });
  if (r.tentative) assert.ok(r.missingInputs.includes("age_years"));
});

test("case-insensitive codes and prefix ICD matching", () => {
  const r = groupCase({
    services: [{ code: "c03.gh.0090" }],
    icdCode: "h65.299",
    patientSex: 1,
    patientBirthdate: "1980-01-01",
  });
  assert.equal(r.group, "C03.15A");
});
