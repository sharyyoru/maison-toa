/**
 * OAAT TarifMatcher HTTP wrapper.
 *
 * The ambulatory flat-rate grouper (gestures + ICD-10 -> flat rate) is a Java
 * library. Vercel's Node runtime has no JVM, so /api/acf/sumex cannot call it
 * in-process — the same reason the old Sumex1 validator lived on its own box.
 * This is a small service around the official jar, deployed the same way the
 * WhatsApp server is.
 *
 * It shells out to the batch grouper rather than binding the Java API: the
 * CLI is the vendor's supported entry point, so the grouping semantics stay
 * theirs rather than becoming a reimplementation we would have to keep
 * correct against 483 decision-tree expressions.
 *
 *   POST /group  { serviceDate: "2026-03-01" | applicationYear: 2026,
 *                  services: ["C09.AC.0140" | { code, side?, number? }],
 *                  diagnoses: ["N64.8"], ageYears?: 45, sex?: "M" | "W",
 *                  drugs?: [], caseId?: "inv-1009515" }
 *     -> { ok, applicationYear: 2026,
 *          results: [{ caseId, flatRate: "C09.41B", costWeight: 5652.25, mappedTardocs: [] }] }
 *   GET  /health -> { ok, supportedYears, missing }
 */
const http = require("node:http");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 8080;
const DIR = __dirname;
const JAR = path.join(DIR, "tarifmatcher-1.2.1-standalone.jar");
const T = (f) => path.join(DIR, "tariffs", f);

// The jar ships with a broken manifest — Main-Class is declared as
// "...Batchgrouper.java", with the .java suffix, so `java -jar` cannot find
// the class. Invoke it on the classpath instead.
const MAIN_CLASS = "ch.oaat_otma.grouper.batchgrouper.Batchgrouper";

/**
 * One tariff set per application year. A treatment must be grouped with the
 * tariff in force on its own service date: pricing 2026 work with the 2027
 * system produces the wrong flat rate, which is worse than not grouping.
 *
 * The 2026 bundle predates `min_tarifmatcher_version` (introduced in 1.2.0),
 * so that key is absent and the 1.2.1 jar reads it without complaint — one
 * engine serves both years.
 */
const TARIFFS = {
  2026: {
    system: T("system_ambP_11c_260402_lkaat.json"),
    catalogue: T("catalog_ambP_11c.csv"),
    lkaat: T("lkaat_1.0c_251128.json"),
    tardoc: T("tardoc_TARDOC_1.4c_251128_fr.json"),
  },
  2027: {
    system: T("system_ambP_12_lkaat.json"),
    catalogue: T("catalog_ambP_12.csv"),
    lkaat: T("lkaat_1.1.json"),
    tardoc: T("tardoc_TARDOC_1.5_fr.json"),
  },
};

const SUPPORTED_YEARS = Object.keys(TARIFFS).map(Number).sort();

/**
 * Tariff year of a treatment date, on the Swiss calendar: a timestamp of
 * 2026-12-31T23:30Z is 1 January 2027 in Zurich. There is deliberately no
 * default year — guessing "the newest tariff" prices old work wrongly.
 */
function yearOf(body) {
  if (body.applicationYear !== undefined && body.applicationYear !== null && body.applicationYear !== "") {
    return Number(body.applicationYear);
  }
  const d = String(body.serviceDate || "").trim();
  if (/^\d{4}(-\d{2}-\d{2})?$/.test(d)) return Number(d.slice(0, 4));
  const t = new Date(d);
  if (!d || Number.isNaN(t.getTime())) return NaN;
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric" }).format(t));
}

function tariffsFor(year) {
  return TARIFFS[year] || null;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

/**
 * The grouper reads a semicolon-separated file whose header names the PCS
 * variables. List values are separated by "|" inside their field (Guava
 * splitter on '|' in DynamicPatientCaseParser — a comma is NOT a separator,
 * "A,B" is read as one unknown code). A service is
 * code:side:date:number:session. Codes are validated rather than escaped: a
 * tariff code never contains ; | or :.
 */
const CODE_RE = /^[A-Za-z0-9._-]{1,32}$/;
const SIDES = new Set(["", "L", "R", "B"]);

function serviceField(s) {
  const o = typeof s === "string" ? { code: s } : s || {};
  const code = String(o.code || "").trim().toUpperCase();
  if (!CODE_RE.test(code)) return null;
  const side = SIDES.has(String(o.side || "").toUpperCase()) ? String(o.side || "").toUpperCase() : "";
  const number = Number.isInteger(Number(o.number)) && Number(o.number) > 0 ? Number(o.number) : 1;
  return `${code}:${side}::${number}`;
}

const codes = (list) => (list || []).map((d) => String(d).trim().toUpperCase()).filter((d) => CODE_RE.test(d));

// tarpos (2026: mapped TARDOC / drug positions) is sent empty, as the app records no drugs.
const BASE_COLUMNS = ["id", "age_years", "sex", "services", "diagnoses", "drugs", "tarpos"];
const columnsCache = {};

/** Only the columns the year's PCS declares: the jar warns on unknown ones (2027 has no "sex"). */
function columnsFor(t) {
  if (!columnsCache[t.system]) {
    const declared = new Set((JSON.parse(fs.readFileSync(t.system, "utf8")).variables || []).map((v) => v.field_name));
    columnsCache[t.system] = BASE_COLUMNS.filter((c) => c === "id" || declared.has(c));
  }
  return columnsCache[t.system];
}

function buildInputCsv(cases, columns = BASE_COLUMNS) {
  const rows = [columns.join(";")];
  cases.forEach((c, i) => {
    const services = (c.services || []).map(serviceField).filter(Boolean);
    const id = CODE_RE.test(String(c.caseId ?? "")) ? String(c.caseId) : `case${i + 1}`;
    const age = c.ageYears !== null && c.ageYears !== "" && Number.isFinite(Number(c.ageYears)) ? Math.trunc(Number(c.ageYears)) : "";
    const sex = c.sex === "M" || c.sex === "W" ? c.sex : "";
    const value = { id, age_years: age, sex, services: services.join("|"), diagnoses: codes(c.diagnoses).join("|"), drugs: codes(c.drugs).join("|"), tarpos: "" };
    rows.push(columns.map((col) => value[col]).join(";"));
  });
  return rows.join("\n") + "\n";
}

function runGrouper(csv, t) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `tm-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
    fs.writeFileSync(tmp, csv, "utf8");
    execFile(
      "java",
      ["-cp", JAR, MAIN_CLASS, "-cat", t.catalogue, "-lkaat", t.lkaat, "-tardoc", t.tardoc, "-map", t.system, tmp],
      { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        fs.unlink(tmp, () => {});
        if (err) return reject(new Error(`${err.message} ${String(stderr).slice(0, 400)}`));
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/**
 * Output is `ID;KaP;tax_points;mapped_tardocs`, one row per case.
 * mapped_tardocs is "|"-separated code:...:number:points entries.
 */
function parseOutput(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  const header = (lines.shift() || "").split(";").map((h) => h.trim().toLowerCase());
  const idx = (n) => header.indexOf(n);
  return lines.map((line) => {
    const cols = line.split(";");
    const weight = Number(cols[idx("tax_points")]);
    return {
      caseId: cols[idx("id")] ?? null,
      flatRate: cols[idx("kap")] || null,
      costWeight: Number.isFinite(weight) ? weight : null,
      mappedTardocs: (cols[idx("mapped_tardocs")] || "").split("|").map((s) => s.trim()).filter(Boolean),
    };
  });
}

function sameSecret(given, expected) {
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  // A shared secret keeps this from being an open grouping endpoint once it
  // is on the public internet. Unset = open, which is fine locally only.
  const secret = process.env.TARIFMATCHER_SECRET;
  if (secret && req.url !== "/health" && !sameSecret(req.headers["x-tarifmatcher-secret"], secret)) {
    return send(res, 401, { ok: false, error: "Unauthorized" });
  }

  if (req.method === "GET" && req.url === "/health") {
    const missing = [JAR, ...SUPPORTED_YEARS.flatMap((y) => Object.values(TARIFFS[y]))].filter((f) => !fs.existsSync(f));
    return send(res, missing.length ? 503 : 200, {
      ok: missing.length === 0,
      supportedYears: SUPPORTED_YEARS,
      missing: missing.map((f) => path.basename(f)),
    });
  }

  if (req.method === "POST" && req.url === "/group") {
    try {
      const body = await readJson(req);
      const cases = Array.isArray(body.cases) ? body.cases : [body];
      if (!cases.length || cases.length > 500 || !cases.every((c) => c && Array.isArray(c.services) && c.services.length)) {
        return send(res, 400, { ok: false, error: "Each case needs at least one service code (max 500 cases)" });
      }
      // The tariff in force on the service date, not "the newest we have".
      const requested = yearOf(body);
      if (!Number.isInteger(requested)) {
        return send(res, 400, { ok: false, error: "serviceDate (YYYY-MM-DD) or applicationYear is required", supportedYears: SUPPORTED_YEARS });
      }
      const tariffs = tariffsFor(requested);
      if (!tariffs) {
        return send(res, 400, {
          ok: false,
          error: `No tariff loaded for application year ${requested}. Loaded: ${SUPPORTED_YEARS.join(", ")}.`,
          supportedYears: SUPPORTED_YEARS,
        });
      }
      const { stdout, stderr } = await runGrouper(buildInputCsv(cases, columnsFor(tariffs)), tariffs);
      const results = parseOutput(stdout);
      return send(res, 200, {
        ok: true,
        applicationYear: requested,
        results,
        // Surfaced rather than swallowed: the grouper reports unknown codes
        // and unusable rows here, and that is exactly what a biller needs.
        warnings: stderr.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(NOTE: )?Picked up (JDK_JAVA|JAVA_TOOL)_OPTIONS/.test(l)).slice(0, 20),
      });
    } catch (e) {
      return send(res, 500, { ok: false, error: String(e.message).slice(0, 500) });
    }
  }

  return send(res, 404, { ok: false, error: "Not found" });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`[tarifmatcher] listening on ${PORT}`));
}

module.exports = { server, buildInputCsv, columnsFor, parseOutput, yearOf, TARIFFS };
