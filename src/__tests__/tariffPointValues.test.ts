import assert from "node:assert/strict";
import { resolveTariffPointValue, type TariffPointValueRow } from "@/lib/tariffPointValues";

// The tax point value used to be CANTON_TAX_POINT_VALUES[canton] ?? 0.96.
// Swiss TPVs are negotiated per cost bearer AND per canton and change over
// time, so staff were correcting invoices by hand and insurers were rejecting
// with 59109 / eK6.T001. These tests pin the resolution order.

const row = (o: Partial<TariffPointValueRow>): TariffPointValueRow => ({
  insurer_gln: null,
  insurer_group: null,
  canton: "VD",
  law_type: null,
  tariff_type: "007",
  value: 0.93,
  valid_from: "2000-01-01",
  valid_to: null,
  ...o,
});

const CANTON_VD = row({ value: 0.93 });

// --- No rows at all: behaviour is exactly the old constant. Adding this table
//     must not change a single existing invoice until rates are entered. ---
{
  const r = resolveTariffPointValue([], { canton: "VD" }, 0.93);
  assert.equal(r.value, 0.93);
  assert.equal(r.source, "fallback");
}

// --- Canton default is used when no insurer rate exists. ---
{
  const r = resolveTariffPointValue([CANTON_VD], { canton: "VD", insurerGln: "7601003002294" }, 0.96);
  assert.equal(r.value, 0.93);
  assert.equal(r.source, "canton");
}

// --- An insurer-specific rate beats the canton default. This is the whole
//     point: Vladimir stops adjusting it by hand. ---
{
  const rows = [CANTON_VD, row({ insurer_gln: "7601003002294", value: 0.86 })];
  const r = resolveTariffPointValue(rows, { canton: "VD", insurerGln: "7601003002294" }, 0.96);
  assert.equal(r.value, 0.86);
  assert.equal(r.source, "insurer_gln");

  // A different insurer still gets the canton default.
  const other = resolveTariffPointValue(rows, { canton: "VD", insurerGln: "7601999999999" }, 0.96);
  assert.equal(other.value, 0.93);
  assert.equal(other.source, "canton");
}

// --- Specificity order: GLN+law > GLN > group+law > group > canton. ---
{
  const rows = [
    CANTON_VD,
    row({ insurer_group: "tarifsuisse", value: 0.9 }),
    row({ insurer_group: "tarifsuisse", law_type: "UVG", value: 0.91 }),
    row({ insurer_gln: "G1", value: 0.88 }),
    row({ insurer_gln: "G1", law_type: "UVG", value: 0.87 }),
  ];
  const q = { canton: "VD", insurerGln: "G1", insurerGroup: "tarifsuisse" };
  assert.equal(resolveTariffPointValue(rows, { ...q, lawType: "UVG" }, 0.96).value, 0.87);
  assert.equal(resolveTariffPointValue(rows, { ...q, lawType: "KVG" }, 0.96).value, 0.88);
  assert.equal(
    resolveTariffPointValue(rows, { canton: "VD", insurerGroup: "tarifsuisse", lawType: "UVG" }, 0.96).value,
    0.91,
  );
  assert.equal(
    resolveTariffPointValue(rows, { canton: "VD", insurerGroup: "tarifsuisse" }, 0.96).value,
    0.9,
  );
}

// --- Period handling: a rate change mid-year must not retro-apply, so old
//     invoices stay reproducible. ---
{
  const rows = [
    row({ value: 0.93, valid_from: "2020-01-01", valid_to: "2026-06-30" }),
    row({ value: 0.95, valid_from: "2026-07-01" }),
  ];
  assert.equal(resolveTariffPointValue(rows, { canton: "VD", on: "2026-03-15" }, 0.9).value, 0.93);
  assert.equal(resolveTariffPointValue(rows, { canton: "VD", on: "2026-09-15" }, 0.9).value, 0.95);
  // valid_to is inclusive of the final day.
  assert.equal(resolveTariffPointValue(rows, { canton: "VD", on: "2026-06-30" }, 0.9).value, 0.93);
  // Before any rate exists -> fallback, never a wrong number.
  assert.equal(resolveTariffPointValue(rows, { canton: "VD", on: "2019-01-01" }, 0.9).source, "fallback");
}

// --- Canton and tariff type must both match; TARMED (001) must not pick up a
//     TARDOC (007) rate. ---
{
  const rows = [row({ canton: "VD", tariff_type: "007", value: 0.93 })];
  assert.equal(resolveTariffPointValue(rows, { canton: "GE" }, 0.96).source, "fallback");
  assert.equal(resolveTariffPointValue(rows, { canton: "VD", tariffType: "001" }, 0.96).source, "fallback");
  assert.equal(resolveTariffPointValue(rows, { canton: "vd" }, 0.96).value, 0.93, "canton match is case-insensitive");
}

// --- A corrupt row must never produce a zero/negative rate on a claim. ---
{
  const rows = [row({ value: 0 as unknown as number }), row({ value: "not-a-number" })];
  assert.equal(resolveTariffPointValue(rows, { canton: "VD" }, 0.93).source, "fallback");
  assert.equal(resolveTariffPointValue(rows, { canton: "VD" }, 0.93).value, 0.93);
}

// --- Canton defaults: a law-specific canton row beats the generic one, and
//     a law-specific row never leaks onto a different law. ---
{
  const rows = [
    row({ canton: "VD", value: 0.93 }),
    row({ canton: "VD", law_type: "UVG", value: 0.89 }),
  ];
  assert.equal(resolveTariffPointValue(rows, { canton: "VD", lawType: "UVG" }, 0.9).value, 0.89);
  assert.equal(resolveTariffPointValue(rows, { canton: "VD", lawType: "KVG" }, 0.9).value, 0.93);
  assert.equal(resolveTariffPointValue(rows, { canton: "VD" }, 0.9).value, 0.93);
}

console.log("tariffPointValues: all assertions passed");
