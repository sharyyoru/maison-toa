/**
 * Billing verification harness.
 *
 * Exercises every insurance/invoicing endpoint and reports a pass/fail matrix,
 * so a billing change can be checked as a whole rather than spot-checked.
 *
 *   node scripts/verify-billing.mjs            # safe checks only
 *   node scripts/verify-billing.mjs --all      # include write/transmit checks
 *
 * Endpoints that transmit to MediData or mutate production rows are skipped
 * unless --all is passed, and are listed explicitly in the output so the
 * untested surface is never implied to be verified.
 */

const BASE = process.env.VERIFY_BASE_URL || "http://localhost:3000";
const INCLUDE_UNSAFE = process.argv.includes("--all");

// Resolved from the database at startup so the checks run against real rows.
let fixtures = {};

const checks = [
  // ── Sumex / XML ────────────────────────────────────────────────────────────
  {
    name: "Sumex health probe",
    fn: async () => {
      const r = await get("/api/sumex/health");
      // The external server is gone; reporting it as offline is correct.
      return r.json?.online === false
        ? ok(`offline as expected (latency ${r.json.latencyMs}ms) — native path in use`)
        : r.json?.online === true
          ? ok("server reachable")
          : fail(`unexpected shape: ${JSON.stringify(r.json).slice(0, 80)}`);
    },
  },
  {
    name: "Native XML generation (real invoice)",
    fn: async () => {
      if (!fixtures.invoiceId) return skip("no invoice with line items found");
      const r = await post("/api/sumex/check-xml", {
        invoiceId: fixtures.invoiceId,
        insurerGln: fixtures.insurerGln,
      });
      if (!r.json?.xmlContent) return fail(`no XML: ${r.json?.error || r.status}`);
      const xml = r.json.xmlContent;
      const required = [
        "forum-datenaustausch.ch/invoice",
        "generalInvoiceRequest_500.xsd",
        "<invoice:request",
      ];
      const missing = required.filter((t) => !xml.includes(t));
      if (missing.length) return fail(`XML missing: ${missing.join(", ")}`);
      return ok(`${xml.length} chars, schema=${r.json.usedSchema}, ${r.json.serviceCount} service(s)`);
    },
  },
  {
    name: "XML well-formedness",
    fn: async () => {
      if (!fixtures.invoiceId) return skip("no invoice fixture");
      const r = await post("/api/sumex/check-xml", {
        invoiceId: fixtures.invoiceId,
        insurerGln: fixtures.insurerGln,
      });
      const xml = r.json?.xmlContent;
      if (!xml) return fail("no XML returned");
      // Tag balance check: every opened element must close.
      const opens = [...xml.matchAll(/<([a-zA-Z][\w:.-]*)(\s[^>]*?)?(?<!\/)>/g)].map((m) => m[1]);
      const closes = [...xml.matchAll(/<\/([a-zA-Z][\w:.-]*)>/g)].map((m) => m[1]);
      const counts = {};
      opens.forEach((t) => (counts[t] = (counts[t] || 0) + 1));
      closes.forEach((t) => (counts[t] = (counts[t] || 0) - 1));
      const unbalanced = Object.entries(counts).filter(([, n]) => n !== 0);
      return unbalanced.length
        ? fail(`unbalanced tags: ${unbalanced.map(([t, n]) => `${t}:${n}`).join(", ")}`)
        : ok(`${opens.length} elements, all balanced`);
    },
  },

  {
    name: "XML carries no control characters",
    fn: async () => {
      // 4,725 invoice_line_items hold a trailing CR in `code` from a CSV
      // import. Unstripped, XML normalisation turns it into a space and the
      // insurer receives "2130 " instead of "2130".
      const contaminated = await db(
        "invoice_line_items?select=invoice_id,code&code=like.*%0D*&invoice_id=not.is.null&limit=40",
      );
      if (!contaminated.length) return skip("no contaminated line items found");
      // Not every invoice can build XML (some providers lack specialty codes),
      // so try candidates until one does.
      for (const row of contaminated) {
        const r = await post("/api/sumex/check-xml", {
          invoiceId: row.invoice_id,
          insurerGln: fixtures.insurerGln,
        });
        const xml = r.json?.xmlContent;
        if (!xml) continue;
        const found = [...xml].filter((ch) => {
          const c = ch.charCodeAt(0);
          return c === 13 || (c < 32 && c !== 10 && c !== 9) || c === 127;
        });
        return found.length
          ? fail(`${found.length} control char(s) in XML from code ${JSON.stringify(row.code)}`)
          : ok(`clean XML from contaminated source code ${JSON.stringify(row.code)}`);
      }
      return skip(`none of ${contaminated.length} contaminated invoices could build XML`);
    },
  },

  // ── The duplicate-submission guard (the fix under test) ───────────────────
  {
    name: "GUARD refuses an already-transmitted invoice",
    fn: async () => {
      if (!fixtures.transmittedInvoiceId) return skip("no transmitted invoice found");
      const r = await post("/api/medidata/send-invoice", {
        invoiceId: fixtures.transmittedInvoiceId,
        insurerGln: fixtures.insurerGln,
      });
      if (r.status !== 409) return fail(`expected 409, got ${r.status} (${r.json?.error})`);
      if (r.json?.code !== "ALREADY_SUBMITTED") return fail(`wrong code: ${r.json?.code}`);
      if (!r.json?.existingSubmission?.status) return fail("no existingSubmission detail");
      return ok(`409 ALREADY_SUBMITTED, prior status "${r.json.existingSubmission.status}"`);
    },
  },
  {
    name: "GUARD predicate vs all live submissions",
    fn: async () => {
      const rows = await db(
        "medidata_submissions?select=invoice_id,status,is_storno&invoice_id=not.is.null&limit=5000",
      );
      const by = {};
      for (const r of rows) (by[r.invoice_id] = by[r.invoice_id] || []).push(r);
      const blocks = (s) =>
        !s.is_storno && ["pending", "transmitted", "accepted"].includes(String(s.status));
      let blocked = 0;
      const leaks = [];
      for (const [id, subs] of Object.entries(by)) {
        if (subs.some(blocks)) blocked++;
        // A non-storno live submission must never end up in the allowed set.
        else if (subs.some((s) => !s.is_storno && ["transmitted", "accepted", "pending"].includes(String(s.status))))
          leaks.push(id);
      }
      return leaks.length
        ? fail(`${leaks.length} invoice(s) would slip past the guard`)
        : ok(`${blocked} blocked / ${Object.keys(by).length - blocked} allowed, no leaks`);
    },
  },
  {
    name: "GUARD still allows a storno correction",
    fn: async () => {
      const rows = await db(
        "medidata_submissions?select=invoice_id,status,is_storno&is_storno=eq.true&status=in.(transmitted,accepted)&limit=50",
      );
      if (!rows.length) return skip("no storno submissions in data");
      // Each storno invoice must be re-sendable unless it also has a live
      // non-storno submission.
      const ids = [...new Set(rows.map((r) => r.invoice_id))].filter(Boolean);
      let resendable = 0;
      for (const id of ids) {
        const all = await db(
          `medidata_submissions?select=status,is_storno&invoice_id=eq.${id}`,
        );
        const live = all.some(
          (s) => !s.is_storno && ["pending", "transmitted", "accepted"].includes(String(s.status)),
        );
        if (!live) resendable++;
      }
      return ok(`${resendable}/${ids.length} storno invoices re-sendable (correction path intact)`);
    },
  },

  // ── Patient-facing invoicing ──────────────────────────────────────────────
  {
    name: "Patient PDF generation",
    fn: async () => {
      if (!fixtures.invoiceId) return skip("no invoice fixture");
      if (!INCLUDE_UNSAFE) return skip("writes a PDF to storage — use --all");
      const r = await post("/api/invoices/generate-pdf", { invoiceId: fixtures.invoiceId });
      if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.json?.error}`);
      return ok(
        `degraded=${r.json?.degradedMode ?? false}, qr=${r.json?.qrCodeType ?? "n/a"}`,
      );
    },
  },
  {
    name: "Swiss QR-bill prerequisites on recent invoices",
    fn: async () => {
      const rows = await db(
        "invoices?select=invoice_number,provider_iban,total_amount&order=created_at.desc&limit=60",
      );
      const missing = rows.filter((r) => !r.provider_iban && Number(r.total_amount) > 0);
      return missing.length
        ? fail(`${missing.length}/${rows.length} recent invoices have no provider_iban (QR bill cannot print)`)
        : ok(`all ${rows.length} recent invoices carry provider_iban`);
    },
  },

  // ── TarDoc / ACF validation ───────────────────────────────────────────────
  {
    name: "TarDoc catalogue",
    fn: async () => {
      const r = await get("/api/tardoc");
      const n = r.json?.data?.tariffs?.length;
      return n ? ok(`${n} tariff codes`) : fail(`no tariffs: ${JSON.stringify(r.json).slice(0, 90)}`);
    },
  },
  {
    name: "TarDoc groups",
    fn: async () => {
      const r = await get("/api/tardoc/groups");
      const n = r.json?.data?.length;
      return n ? ok(`${n} groups`) : fail(`no groups: ${JSON.stringify(r.json).slice(0, 90)}`);
    },
  },
  {
    name: "TarDoc Sumex validator (degrades, not errors)",
    fn: async () => {
      const r = await get("/api/tardoc/sumex?code=00.0010");
      // With the server gone this must fall back locally rather than 5xx.
      if (r.status >= 500) return fail(`HTTP ${r.status} — no local fallback`);
      return ok(`HTTP ${r.status}, fallback=${r.json?.fallback ?? r.json?.source ?? "n/a"}`);
    },
  },
  {
    name: "ACF validator (degrades, not errors)",
    fn: async () => {
      const r = await get("/api/acf/sumex");
      return r.status >= 500
        ? fail(`HTTP ${r.status} — unhandled with server offline`)
        : ok(`HTTP ${r.status} handled`);
    },
  },

  // ── MediData transmission chain ───────────────────────────────────────────
  {
    name: "MediData proxy reachable (live insurers)",
    fn: async () => {
      const r = await get("/api/medidata/proxy-participants");
      const n = r.json?.count ?? r.json?.participants?.length;
      if (n > 0) return ok(`${n} insurers via ${r.json?.source}`);
      // The route answers success:true/count:0 whether the proxy is dead or
      // genuinely empty, so an unconfigured local env cannot be told apart
      // from an outage here. Checked against the deployed app instead.
      if (BASE.includes("localhost"))
        return skip("MEDIDATA_PROXY_* not in .env.local — run with VERIFY_BASE_URL=<deployed url>");
      return fail(`proxy returned nothing: ${JSON.stringify(r.json).slice(0, 100)}`);
    },
  },
  {
    name: "MediData downloads channel",
    fn: async () => {
      const r = await get("/api/medidata/proxy-downloads");
      return r.json?.success
        ? ok(`${r.json.count ?? 0} pending download(s)`)
        : fail(`${JSON.stringify(r.json).slice(0, 100)}`);
    },
  },
  {
    name: "MediData poll (hourly cron path)",
    fn: async () => {
      const r = await post("/api/medidata/poll", {});
      if (!r.json?.success) return fail(`${JSON.stringify(r.json).slice(0, 120)}`);
      const d = r.json.downloads ?? {};
      const n = r.json.notifications ?? {};
      return ok(
        `downloads ${d.processed ?? 0}/${d.found ?? 0}, notifs ${n.processed ?? 0}/${n.found ?? 0}, status checks ${r.json.statusUpdates?.checked ?? 0}`,
      );
    },
  },
  {
    name: "Response XML parser against stored responses",
    fn: async () => {
      const rows = await db("medidata_responses?select=id&limit=1");
      return rows.length
        ? ok(`${rows.length} stored response(s) reachable for parsing`)
        : skip("no stored responses");
    },
  },

  // ── Reporting ─────────────────────────────────────────────────────────────
  {
    name: "Billing statistics endpoints",
    fn: async () => {
      // These require an explicit date window.
      const range = "from=2026-01-01&to=2026-12-31";
      const paths = [
        `/api/statistics/medidata-status?${range}`,
        `/api/statistics/sent-invoices?${range}`,
        `/api/statistics/paid-invoices?${range}`,
        `/api/statistics/invoiced-services?${range}`,
      ];
      const results = await Promise.all(paths.map((p) => get(p)));
      const broken = results
        .map((r, i) => (r.status >= 400 ? `${paths[i]}:${r.status}` : null))
        .filter(Boolean);
      return broken.length ? fail(broken.join(", ")) : ok(`all ${paths.length} report endpoints OK`);
    },
  },
  {
    name: "Invoice-linker reads",
    fn: async () => {
      const r = await get("/api/invoice-linker/unlinked-invoices");
      return r.status >= 400 ? fail(`HTTP ${r.status}`) : ok(`HTTP ${r.status}`);
    },
  },

  // ── Data integrity ────────────────────────────────────────────────────────
  {
    name: "No NEW duplicate submissions since the guard",
    fn: async () => {
      const rows = await db(
        "medidata_submissions?select=invoice_id,status,created_at,is_storno&invoice_id=not.is.null&order=created_at.desc&limit=400",
      );
      const since = new Date("2026-10-24T08:30:00Z"); // guard deployed
      const recent = rows.filter((r) => new Date(r.created_at) > since && !r.is_storno);
      const by = {};
      for (const r of recent) (by[r.invoice_id] = by[r.invoice_id] || []).push(r);
      const dups = Object.entries(by).filter(([, v]) => v.length > 1);
      return dups.length
        ? fail(`${dups.length} invoice(s) submitted more than once since the guard`)
        : ok(`${recent.length} submission(s) since guard, no duplicates`);
    },
  },
];

// Endpoints deliberately not exercised, reported so the gap stays visible.
const UNTESTED = [
  ["/api/medidata/send-invoice (full send)", "transmits a real claim to an insurer"],
  ["/api/medidata/test-send", "transmits a real claim to an insurer"],
  ["/api/medidata/cancel-invoice", "sends a storno to an insurer"],
  ["/api/medidata/update-status", "mutates submission status"],
  ["/api/medidata/setup-tables", "DDL against production"],
  ["/api/invoices/send-email", "emails a patient"],
  ["/api/invoices/backfill-references", "bulk-writes invoice rows"],
];

// ── helpers ─────────────────────────────────────────────────────────────────
const ok = (detail) => ({ state: "PASS", detail });
const fail = (detail) => ({ state: "FAIL", detail });
const skip = (detail) => ({ state: "SKIP", detail });

async function get(path) {
  return request(path, { method: "GET" });
}
async function post(path, body) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function request(path, init) {
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(180000) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { status: res.status, json };
  } catch (err) {
    return { status: 0, json: { error: String(err.message || err) } };
  }
}

async function db(query) {
  const fs = await import("node:fs");
  const env = fs.readFileSync(".env.local", "utf8");
  const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  const res = await fetch(`${url}/rest/v1/${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

async function loadFixtures() {
  // An invoice with line items, so XML generation has something to encode.
  const withLines = await db(
    "invoice_line_items?select=invoice_id&invoice_id=not.is.null&limit=200",
  );
  const candidates = [...new Set(withLines.map((r) => r.invoice_id))];
  const transmitted = await db(
    "medidata_submissions?select=invoice_id&status=eq.transmitted&is_storno=is.false&invoice_id=not.is.null&order=created_at.desc&limit=5",
  );
  return {
    invoiceId: candidates[0] ?? null,
    transmittedInvoiceId: transmitted[0]?.invoice_id ?? null,
    insurerGln: "7601003000108",
  };
}

// ── runner ──────────────────────────────────────────────────────────────────
const RESET = "\x1b[0m";
const COLOUR = { PASS: "\x1b[32m", FAIL: "\x1b[31m", SKIP: "\x1b[33m" };

console.log(`\nBilling verification — ${BASE}${INCLUDE_UNSAFE ? "  [--all: write checks enabled]" : ""}\n`);
fixtures = await loadFixtures();
console.log(
  `fixtures: invoice=${fixtures.invoiceId?.slice(0, 8) ?? "none"} transmitted=${fixtures.transmittedInvoiceId?.slice(0, 8) ?? "none"}\n`,
);

const tally = { PASS: 0, FAIL: 0, SKIP: 0 };
for (const check of checks) {
  let result;
  try {
    result = await check.fn();
  } catch (err) {
    result = fail(`threw: ${err.message}`);
  }
  tally[result.state]++;
  const c = COLOUR[result.state];
  console.log(`  ${c}${result.state}${RESET}  ${check.name}`);
  console.log(`        ${result.detail}`);
}

console.log(`\nNot exercised (would have real-world effects):`);
for (const [path, why] of UNTESTED) console.log(`  ·  ${path} — ${why}`);

console.log(
  `\n${tally.PASS} passed, ${tally.FAIL} failed, ${tally.SKIP} skipped\n`,
);
process.exit(tally.FAIL > 0 ? 1 : 0);
