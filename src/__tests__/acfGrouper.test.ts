import assert from "node:assert/strict";
import { groupCase, runLocalGrouper, grouperData } from "../lib/acfGrouper";

// These tests pin the 2026 (1.4c / 1.1c / 1.0c) catalogue, which is the
// default for "today" only until 31 Dec 2026 — freeze today inside 2026.
{
  const RealDate = Date;
  const pinned = new RealDate("2026-06-15T12:00:00Z").getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) super(pinned);
      else super(...(args as ConstructorParameters<typeof Date>));
    }
    static now() { return pinned; }
  } as DateConstructor;
}


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
