/**
 * End-to-end checks against the real jar: `node test.js` (needs java on PATH).
 * Expected values come from the official Batchgrouper itself.
 */
process.env.TARIFMATCHER_SECRET = "test-secret\n"; // as stored by `openssl rand | gcloud secrets create`
const assert = require("node:assert/strict");
const { server, buildInputCsv, columnsFor, yearOf, TARIFFS } = require("./server.js");

async function main() {
  assert.equal(yearOf({ serviceDate: "2026-12-31" }), 2026);
  assert.equal(yearOf({ serviceDate: "2026-12-31T23:30:00Z" }), 2027, "Zurich calendar");
  assert.ok(Number.isNaN(yearOf({})), "no default year");
  assert.equal(
    buildInputCsv([{ services: ["c09.ac.0140", { code: "AA.00.0020", side: "L", number: 5 }, "x;y"], diagnoses: ["N64.8"], sex: "W", ageYears: 45 }]).split("\n")[1],
    "case1;45;W;C09.AC.0140:::1|AA.00.0020:L::5;N64.8;;",
  );

  assert.deepEqual(columnsFor(TARIFFS[2026]), ["id", "age_years", "sex", "services", "diagnoses", "drugs", "tarpos"]);
  assert.deepEqual(columnsFor(TARIFFS[2027]), ["id", "age_years", "services", "diagnoses", "drugs"]);

  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, secret = "test-secret") =>
    fetch(`${base}/group`, { method: "POST", headers: { "Content-Type": "application/json", "x-tarifmatcher-secret": secret }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, json: await r.json() }));

  const health = await fetch(`${base}/health`).then((r) => r.json());
  assert.deepEqual(health, { ok: true, supportedYears: [2026, 2027], missing: [] });

  assert.equal((await post({ serviceDate: "2026-03-01", services: ["C09.AC.0140"] }, "wrong")).status, 401);
  assert.equal((await post({ services: ["C09.AC.0140"], diagnoses: ["N64.8"] })).status, 400, "date required");
  const y2025 = await post({ serviceDate: "2025-06-01", services: ["C09.AC.0140"], diagnoses: ["N64.8"] });
  assert.equal(y2025.status, 400);
  assert.match(y2025.json.error, /No tariff loaded for application year 2025/);

  const g = (serviceDate, c) => post({ serviceDate, ...c }).then((r) => (assert.equal(r.status, 200, JSON.stringify(r.json)), r.json));

  const r26 = await g("2026-03-01", { services: ["C09.AC.0140"], diagnoses: ["N64.8"], ageYears: 45, sex: "W" });
  assert.deepEqual(r26.warnings, [], "input header matches the 2026 PCS");
  assert.equal(r26.applicationYear, 2026);
  assert.equal(r26.results[0].flatRate, "C09.41B");
  assert.equal(r26.results[0].costWeight, 5652.25);

  const r27 = await g("2027-03-01", { services: ["C09.AC.0140"], diagnoses: ["N64.8"], ageYears: 45, sex: "W" });
  assert.equal(r27.applicationYear, 2027);
  assert.deepEqual(r27.warnings, [], "input header matches the 2027 PCS");
  assert.equal(r27.results[0].flatRate, "C09.18B");
  assert.equal(r27.results[0].costWeight, 4525.22);

  // 2026 PCS has sex-specific chapters: prostate diagnosis groups differently for M and W.
  const sex = await post({
    serviceDate: "2026-03-01",
    cases: [
      { caseId: "m", services: ["C09.AC.0140"], diagnoses: ["N40"], ageYears: 60, sex: "M" },
      { caseId: "w", services: ["C09.AC.0140"], diagnoses: ["N40"], ageYears: 60, sex: "W" },
    ],
  });
  assert.deepEqual(sex.json.results.map((x) => [x.caseId, x.flatRate]), [["m", "C90.01B"], ["w", "C99.80Z"]]);

  // Several services: "|"-separated, mapped to TARDOC with their quantity.
  const multi = await g("2026-03-01", { services: ["AA.00.0010", { code: "AA.00.0020", number: 5 }], diagnoses: ["Z00.0"], ageYears: 45, sex: "M" });
  assert.equal(multi.results[0].flatRate, "NO.ambP");
  assert.equal(multi.results[0].costWeight, 38.4);
  assert.equal(multi.results[0].mappedTardocs.length, 2);

  server.close();
  console.log("tarifmatcher-server: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
