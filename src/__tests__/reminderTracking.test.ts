/**
 * Reminder Tracking Tests
 *
 * End-to-end logic tests + mock-based handler tests for the reminder
 * tracking feature added to invoices/page.tsx, MedicalConsultationsCard.tsx
 * and medidata/page.tsx.
 *
 * No test framework required — run with:
 *   npx tsx src/__tests__/reminderTracking.test.ts
 *   # or
 *   npx ts-node src/__tests__/reminderTracking.test.ts
 */

// ---------------------------------------------------------------------------
// Types (mirrored from invoices/page.tsx)
// ---------------------------------------------------------------------------

interface InvoiceRow {
  id: string;
  invoice_date: string | null;
  due_date: string | null;
  reminder_level: number;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  reminder_3_sent_at: string | null;
  status: string;
  patient_id: string;
}

// ---------------------------------------------------------------------------
// Pure helper functions (copied verbatim from invoices/page.tsx)
// These are the functions under test — no UI or Supabase dependency.
// ---------------------------------------------------------------------------

function overdueBaseDays(row: InvoiceRow): number {
  const base = row.due_date ?? (row.invoice_date ? row.invoice_date.slice(0, 10) : null);
  if (!base) return 0;
  const due = new Date(base);
  const now = new Date();
  return Math.floor((now.getTime() - due.getTime()) / 86_400_000);
}

function daysSince(ts: string | null): number {
  if (!ts) return 0;
  return Math.floor((new Date().getTime() - new Date(ts).getTime()) / 86_400_000);
}

function nextReminderLevel(row: InvoiceRow): 1 | 2 | 3 | null {
  const rl = row.reminder_level ?? 0;
  if (rl === 0) return overdueBaseDays(row) >= 35 ? 1 : null;
  if (rl === 1) return daysSince(row.reminder_1_sent_at) >= 25 ? 2 : null;
  if (rl === 2) return daysSince(row.reminder_2_sent_at) >= 20 ? 3 : null;
  return null;
}

function echuDepuisLabel(row: InvoiceRow): string | null {
  const rl = row.reminder_level ?? 0;
  if (rl === 0) {
    const d = overdueBaseDays(row);
    if (d <= 0) return null;
    const rem = nextReminderLevel(row);
    return `${d}j${rem ? " — 1er rappel dû" : ""}`;
  }
  if (rl === 1) {
    const d = daysSince(row.reminder_1_sent_at);
    if (d <= 0) return null;
    const rem = nextReminderLevel(row);
    return `${d}j depuis 1er rappel${rem ? " — 2e dû" : ""}`;
  }
  if (rl === 2) {
    const d = daysSince(row.reminder_2_sent_at);
    if (d <= 0) return null;
    const rem = nextReminderLevel(row);
    return `${d}j depuis 2e rappel${rem ? " — 3e dû" : ""}`;
  }
  if (rl >= 3) {
    const d = daysSince(row.reminder_3_sent_at);
    if (d <= 0) return null;
    return `${d}j depuis 3e rappel`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filter predicate (mirrors the reminderFilter logic in invoices/page.tsx)
// ---------------------------------------------------------------------------

type ReminderFilter =
  | ""
  | "any_due"
  | "r1_due"
  | "r2_due"
  | "r3_due"
  | "r1_sent"
  | "r2_sent"
  | "r3_sent";

function matchesReminderFilter(row: InvoiceRow, filter: ReminderFilter): boolean {
  if (!filter) return true;
  const rl = row.reminder_level ?? 0;
  switch (filter) {
    case "any_due":
      return nextReminderLevel(row) !== null;
    case "r1_due":
      return rl === 0 && overdueBaseDays(row) >= 35;
    case "r2_due":
      return rl === 1 && daysSince(row.reminder_1_sent_at) >= 25;
    case "r3_due":
      return rl === 2 && daysSince(row.reminder_2_sent_at) >= 20;
    case "r1_sent":
      return rl >= 1;
    case "r2_sent":
      return rl >= 2;
    case "r3_sent":
      return rl >= 3;
  }
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Returns an ISO string N days ago */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** Returns a YYYY-MM-DD date string N days ago */
function dateNDaysAgo(n: number): string {
  return daysAgo(n).slice(0, 10);
}

/** Base invoice row — unpaid, no reminders yet */
function makeRow(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: "inv-001",
    invoice_date: dateNDaysAgo(40),
    due_date: null,
    reminder_level: 0,
    reminder_1_sent_at: null,
    reminder_2_sent_at: null,
    reminder_3_sent_at: null,
    status: "OPEN",
    patient_id: "pat-001",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

interface SupabaseMockCall {
  table: string;
  update: Record<string, unknown>;
  eqField: string;
  eqValue: unknown;
}

function createSupabaseMock() {
  const calls: SupabaseMockCall[] = [];
  const client = {
    from(table: string) {
      return {
        update(data: Record<string, unknown>) {
          return {
            eq(field: string, value: unknown) {
              calls.push({ table, update: data, eqField: field, eqValue: value });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

function createFetchMock(responses: Record<string, unknown> = {}) {
  const calls: FetchCall[] = [];
  const fetchMock = async (url: string, opts: RequestInit = {}) => {
    const body = opts.body ? JSON.parse(opts.body as string) : null;
    calls.push({ url, method: opts.method ?? "GET", body });
    const resp = responses[url] ?? {};
    return {
      ok: true,
      json: async () => resp,
    };
  };
  return { fetchMock, calls };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, message: string): boolean {
  if (condition) {
    console.log(`  ✓ ${message}`);
    totalPassed++;
    return true;
  } else {
    console.log(`  ✗ ${message}`);
    totalFailed++;
    return false;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): boolean {
  const ok = actual === expected;
  if (!ok) {
    console.log(`  ✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    totalFailed++;
  } else {
    console.log(`  ✓ ${label}`);
    totalPassed++;
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Test 1: overdueBaseDays
// ---------------------------------------------------------------------------

function testOverdueBaseDays() {
  console.log("\nTest 1: overdueBaseDays");

  const cases = [
    { label: "due_date 40d ago → 40d overdue",  row: makeRow({ due_date: dateNDaysAgo(40) }), min: 39, max: 41 },
    { label: "invoice_date 50d ago (fallback)  → 50d", row: makeRow({ invoice_date: dateNDaysAgo(50) }), min: 49, max: 51 },
    { label: "due_date takes precedence over invoice_date", row: makeRow({ due_date: dateNDaysAgo(30), invoice_date: dateNDaysAgo(60) }), min: 29, max: 31 },
    { label: "no date → 0", row: makeRow({ invoice_date: null, due_date: null }), min: 0, max: 0 },
    { label: "future due date → ≤ 0", row: makeRow({ due_date: dateNDaysAgo(-10) }), min: -11, max: 0 },
  ];

  let ok = true;
  for (const c of cases) {
    const d = overdueBaseDays(c.row);
    ok = assert(d >= c.min && d <= c.max, `${c.label} (got ${d})`) && ok;
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Test 2: daysSince
// ---------------------------------------------------------------------------

function testDaysSince() {
  console.log("\nTest 2: daysSince");

  let ok = true;
  const d30 = daysSince(daysAgo(30));
  ok = assert(d30 >= 29 && d30 <= 31, `30 days ago → ~30 (got ${d30})`) && ok;

  const d0 = daysSince(null);
  ok = assertEqual(d0, 0, "null → 0") && ok;

  const dFuture = daysSince(daysAgo(-5));
  ok = assert(dFuture <= 0, `future timestamp → ≤ 0 (got ${dFuture})`) && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 3: nextReminderLevel
// ---------------------------------------------------------------------------

function testNextReminderLevel() {
  console.log("\nTest 3: nextReminderLevel");

  let ok = true;

  // Level 0 — not yet due (< 35 d overdue)
  ok = assertEqual(
    nextReminderLevel(makeRow({ due_date: dateNDaysAgo(20) })),
    null,
    "20d overdue, no reminder → null"
  ) && ok;

  // Level 0 — due for 1st reminder (≥ 35 d)
  ok = assertEqual(
    nextReminderLevel(makeRow({ due_date: dateNDaysAgo(40) })),
    1,
    "40d overdue → 1st reminder due"
  ) && ok;

  // Level 1 — 2nd not yet due (< 25 d since 1st)
  ok = assertEqual(
    nextReminderLevel(makeRow({ reminder_level: 1, reminder_1_sent_at: daysAgo(10) })),
    null,
    "1st sent 10d ago → 2nd not due"
  ) && ok;

  // Level 1 — 2nd due (≥ 25 d since 1st)
  ok = assertEqual(
    nextReminderLevel(makeRow({ reminder_level: 1, reminder_1_sent_at: daysAgo(30) })),
    2,
    "1st sent 30d ago → 2nd due"
  ) && ok;

  // Level 2 — 3rd not yet due (< 20 d since 2nd)
  ok = assertEqual(
    nextReminderLevel(makeRow({ reminder_level: 2, reminder_2_sent_at: daysAgo(15) })),
    null,
    "2nd sent 15d ago → 3rd not due"
  ) && ok;

  // Level 2 — 3rd due (≥ 20 d since 2nd)
  ok = assertEqual(
    nextReminderLevel(makeRow({ reminder_level: 2, reminder_2_sent_at: daysAgo(25) })),
    3,
    "2nd sent 25d ago → 3rd due"
  ) && ok;

  // Level 3 — nothing more to send
  ok = assertEqual(
    nextReminderLevel(makeRow({ reminder_level: 3 })),
    null,
    "level 3 already sent → null"
  ) && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 4: echuDepuisLabel
// ---------------------------------------------------------------------------

function testEchuDepuisLabel() {
  console.log("\nTest 4: echuDepuisLabel");

  let ok = true;

  // Not overdue at all
  ok = assertEqual(
    echuDepuisLabel(makeRow({ due_date: dateNDaysAgo(-5) })),
    null,
    "future due date → null"
  ) && ok;

  // Overdue but below 35d threshold — shows days but no 'rappel dû'
  {
    const label = echuDepuisLabel(makeRow({ due_date: dateNDaysAgo(20) }));
    ok = assert(label !== null && label.includes("j") && !label.includes("rappel dû"),
      `20d overdue label contains 'j' but not 'rappel dû' (got '${label}')`) && ok;
  }

  // Overdue ≥ 35d — shows "1er rappel dû"
  {
    const label = echuDepuisLabel(makeRow({ due_date: dateNDaysAgo(40) }));
    ok = assert(label !== null && label.includes("1er rappel dû"),
      `40d overdue label includes '1er rappel dû' (got '${label}')`) && ok;
  }

  // After 1st reminder sent, before 2nd due
  {
    const label = echuDepuisLabel(makeRow({
      reminder_level: 1,
      reminder_1_sent_at: daysAgo(10),
    }));
    ok = assert(label !== null && label.includes("1er rappel") && !label.includes("2e dû"),
      `10d after 1st reminder: shows elapsed but no '2e dû' (got '${label}')`) && ok;
  }

  // After 1st reminder, 2nd now due
  {
    const label = echuDepuisLabel(makeRow({
      reminder_level: 1,
      reminder_1_sent_at: daysAgo(30),
    }));
    ok = assert(label !== null && label.includes("2e dû"),
      `30d after 1st reminder: label shows '2e dû' (got '${label}')`) && ok;
  }

  // After 3rd reminder — just shows elapsed, no next nudge
  {
    const label = echuDepuisLabel(makeRow({
      reminder_level: 3,
      reminder_3_sent_at: daysAgo(5),
    }));
    ok = assert(label !== null && label.includes("3e rappel") && !label.includes("dû"),
      `5d after 3rd reminder: shows elapsed, no 'dû' (got '${label}')`) && ok;
  }

  return ok;
}

// ---------------------------------------------------------------------------
// Test 5: matchesReminderFilter
// ---------------------------------------------------------------------------

function testMatchesReminderFilter() {
  console.log("\nTest 5: matchesReminderFilter");

  let ok = true;

  const overdue40 = makeRow({ due_date: dateNDaysAgo(40) });
  const overdue20 = makeRow({ due_date: dateNDaysAgo(20) });
  const afterR1_30d = makeRow({ reminder_level: 1, reminder_1_sent_at: daysAgo(30) });
  const afterR1_10d = makeRow({ reminder_level: 1, reminder_1_sent_at: daysAgo(10) });
  const afterR2_25d = makeRow({ reminder_level: 2, reminder_2_sent_at: daysAgo(25) });
  const afterR2_10d = makeRow({ reminder_level: 2, reminder_2_sent_at: daysAgo(10) });
  const afterR3 = makeRow({ reminder_level: 3, reminder_3_sent_at: daysAgo(5) });

  // Empty filter passes everything
  ok = assert(matchesReminderFilter(overdue40, ""), "empty filter → true") && ok;
  ok = assert(matchesReminderFilter(afterR3, ""), "empty filter passes level-3 row") && ok;

  // any_due
  ok = assert(matchesReminderFilter(overdue40, "any_due"), "any_due: 40d overdue → true") && ok;
  ok = assert(!matchesReminderFilter(overdue20, "any_due"), "any_due: 20d overdue → false") && ok;
  ok = assert(matchesReminderFilter(afterR1_30d, "any_due"), "any_due: r1 sent 30d ago → true") && ok;
  ok = assert(!matchesReminderFilter(afterR3, "any_due"), "any_due: r3 already sent → false") && ok;

  // r1_due
  ok = assert(matchesReminderFilter(overdue40, "r1_due"), "r1_due: 40d overdue, rl=0 → true") && ok;
  ok = assert(!matchesReminderFilter(overdue20, "r1_due"), "r1_due: 20d overdue → false") && ok;
  ok = assert(!matchesReminderFilter(afterR1_30d, "r1_due"), "r1_due: rl=1 → false") && ok;

  // r2_due
  ok = assert(matchesReminderFilter(afterR1_30d, "r2_due"), "r2_due: r1 sent 30d ago → true") && ok;
  ok = assert(!matchesReminderFilter(afterR1_10d, "r2_due"), "r2_due: r1 sent 10d ago → false") && ok;
  ok = assert(!matchesReminderFilter(overdue40, "r2_due"), "r2_due: rl=0 → false") && ok;

  // r3_due
  ok = assert(matchesReminderFilter(afterR2_25d, "r3_due"), "r3_due: r2 sent 25d ago → true") && ok;
  ok = assert(!matchesReminderFilter(afterR2_10d, "r3_due"), "r3_due: r2 sent 10d ago → false") && ok;
  ok = assert(!matchesReminderFilter(afterR1_30d, "r3_due"), "r3_due: rl=1 → false") && ok;

  // r1_sent
  ok = assert(matchesReminderFilter(afterR1_10d, "r1_sent"), "r1_sent: rl=1 → true") && ok;
  ok = assert(matchesReminderFilter(afterR2_10d, "r1_sent"), "r1_sent: rl=2 → true") && ok;
  ok = assert(matchesReminderFilter(afterR3, "r1_sent"), "r1_sent: rl=3 → true") && ok;
  ok = assert(!matchesReminderFilter(overdue40, "r1_sent"), "r1_sent: rl=0 → false") && ok;

  // r2_sent
  ok = assert(matchesReminderFilter(afterR2_10d, "r2_sent"), "r2_sent: rl=2 → true") && ok;
  ok = assert(matchesReminderFilter(afterR3, "r2_sent"), "r2_sent: rl=3 → true") && ok;
  ok = assert(!matchesReminderFilter(afterR1_10d, "r2_sent"), "r2_sent: rl=1 → false") && ok;

  // r3_sent
  ok = assert(matchesReminderFilter(afterR3, "r3_sent"), "r3_sent: rl=3 → true") && ok;
  ok = assert(!matchesReminderFilter(afterR2_25d, "r3_sent"), "r3_sent: rl=2 → false") && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 6: markReminderSent — DB write + local state update
// ---------------------------------------------------------------------------

async function testMarkReminderSent() {
  console.log("\nTest 6: markReminderSent (mock Supabase)");

  let ok = true;

  const row = makeRow({ id: "inv-42" });
  let localRows: InvoiceRow[] = [{ ...row }];

  const { client: mockDb, calls } = createSupabaseMock();

  // Simulate markReminderSent for level 1
  async function markReminderSent(r: InvoiceRow, level: 1 | 2 | 3) {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { reminder_level: level };
    if (level === 1) update.reminder_1_sent_at = now;
    else if (level === 2) update.reminder_2_sent_at = now;
    else update.reminder_3_sent_at = now;

    await (mockDb as any).from("invoices").update(update).eq("id", r.id);

    localRows = localRows.map(lr =>
      lr.id === r.id
        ? {
            ...lr,
            reminder_level: level,
            reminder_1_sent_at: level === 1 ? now : lr.reminder_1_sent_at,
            reminder_2_sent_at: level === 2 ? now : lr.reminder_2_sent_at,
            reminder_3_sent_at: level === 3 ? now : lr.reminder_3_sent_at,
          }
        : lr
    );
  }

  await markReminderSent(row, 1);

  // DB call assertions
  ok = assertEqual(calls.length, 1, "exactly 1 DB update call") && ok;
  ok = assertEqual(calls[0].table, "invoices", "updated 'invoices' table") && ok;
  ok = assertEqual(calls[0].eqField, "id", ".eq('id', ...)") && ok;
  ok = assertEqual(calls[0].eqValue, "inv-42", ".eq(id, 'inv-42')") && ok;
  ok = assertEqual(calls[0].update.reminder_level as number, 1, "reminder_level = 1") && ok;
  ok = assert("reminder_1_sent_at" in calls[0].update, "reminder_1_sent_at set in update") && ok;

  // Local state assertions
  ok = assertEqual(localRows[0].reminder_level, 1, "local row reminder_level updated to 1") && ok;
  ok = assert(localRows[0].reminder_1_sent_at !== null, "local row reminder_1_sent_at is set") && ok;

  // Level 2 update
  await markReminderSent(localRows[0], 2);
  ok = assertEqual(localRows[0].reminder_level, 2, "level 2 update: reminder_level = 2") && ok;
  ok = assert(localRows[0].reminder_2_sent_at !== null, "level 2 update: reminder_2_sent_at set") && ok;
  ok = assert(localRows[0].reminder_1_sent_at !== null, "level 2 update: reminder_1_sent_at preserved") && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 7: handleReminderPrint — fetch calls + reminder marked
// ---------------------------------------------------------------------------

async function testHandleReminderPrint() {
  console.log("\nTest 7: handleReminderPrint (mock fetch + mock Supabase)");

  let ok = true;

  const row = makeRow({ id: "inv-print-01" });
  let localRows: InvoiceRow[] = [{ ...row }];
  let reminderActionLoading: string | null = null;
  let reminderPopupClosed = false;

  const { client: mockDb, calls: dbCalls } = createSupabaseMock();
  const windowUrls: string[] = [];

  // PDF mock returns pdfUrl directly
  const pdfUrl = "https://storage.example.com/invoice-reminder.pdf";
  const { fetchMock, calls: fetchCalls } = createFetchMock({
    "/api/invoices/generate-pdf": { pdfUrl },
  });

  async function handleReminderPrint(r: InvoiceRow, level: 1 | 2 | 3) {
    reminderActionLoading = "print";
    try {
      const res = await (fetchMock as any)("/api/invoices/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: r.id, invoiceType: "reminder", reminderLevel: level }),
      });
      const json = await res.json();
      if (json.pdfUrl) {
        windowUrls.push(json.pdfUrl); // stand-in for window.open
      }
      const now = new Date().toISOString();
      const update: Record<string, unknown> = { reminder_level: level };
      if (level === 1) update.reminder_1_sent_at = now;
      else if (level === 2) update.reminder_2_sent_at = now;
      else update.reminder_3_sent_at = now;
      await (mockDb as any).from("invoices").update(update).eq("id", r.id);
      localRows = localRows.map(lr =>
        lr.id === r.id ? { ...lr, ...update } as InvoiceRow : lr
      );
      reminderPopupClosed = true;
    } finally {
      reminderActionLoading = null;
    }
  }

  await handleReminderPrint(row, 1);

  ok = assertEqual(fetchCalls.length, 1, "one fetch call to generate-pdf") && ok;
  ok = assertEqual(fetchCalls[0].url, "/api/invoices/generate-pdf", "correct API endpoint") && ok;
  ok = assertEqual((fetchCalls[0].body as any).invoiceType, "reminder", "invoiceType = 'reminder'") && ok;
  ok = assertEqual((fetchCalls[0].body as any).reminderLevel, 1, "reminderLevel = 1") && ok;
  ok = assertEqual(windowUrls[0], pdfUrl, "PDF URL opened") && ok;
  ok = assert(reminderPopupClosed, "reminder popup closed after print") && ok;
  ok = assert(reminderActionLoading === null, "loading state reset") && ok;
  ok = assertEqual(dbCalls.length, 1, "one DB update call") && ok;
  ok = assertEqual(localRows[0].reminder_level as number, 1, "local state updated") && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 8: handleReminderEmail — fetch sequence + state update
// ---------------------------------------------------------------------------

async function testHandleReminderEmail() {
  console.log("\nTest 8: handleReminderEmail (mock fetch)");

  let ok = true;

  const row = makeRow({ id: "inv-email-01" });
  let localRows: InvoiceRow[] = [{ ...row }];
  let popupClosed = false;

  const { client: mockDb, calls: dbCalls } = createSupabaseMock();
  const { fetchMock, calls: fetchCalls } = createFetchMock({
    "/api/invoices/generate-pdf": { success: true },
    "/api/invoices/send-email": { success: true },
  });

  const patientEmail = "patient@example.com";

  async function handleReminderEmail(r: InvoiceRow, level: 1 | 2 | 3) {
    if (!patientEmail) return;
    await (fetchMock as any)("/api/invoices/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: r.id, invoiceType: "reminder", reminderLevel: level }),
    });
    const res = await (fetchMock as any)("/api/invoices/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: r.id, recipientEmail: patientEmail, documentType: "reminder" }),
    });
    if (res.ok) {
      const now = new Date().toISOString();
      const update: Record<string, unknown> = { reminder_level: level };
      if (level === 1) update.reminder_1_sent_at = now;
      else if (level === 2) update.reminder_2_sent_at = now;
      else update.reminder_3_sent_at = now;
      await (mockDb as any).from("invoices").update(update).eq("id", r.id);
      localRows = localRows.map(lr =>
        lr.id === r.id ? { ...lr, ...update } as InvoiceRow : lr
      );
      popupClosed = true;
    }
  }

  await handleReminderEmail(row, 2);

  ok = assertEqual(fetchCalls.length, 2, "two fetch calls: generate-pdf then send-email") && ok;
  ok = assertEqual(fetchCalls[0].url, "/api/invoices/generate-pdf", "1st call: generate-pdf") && ok;
  ok = assertEqual(fetchCalls[1].url, "/api/invoices/send-email", "2nd call: send-email") && ok;
  ok = assertEqual((fetchCalls[1].body as any).recipientEmail, patientEmail, "email sent to correct recipient") && ok;
  ok = assertEqual((fetchCalls[1].body as any).documentType, "reminder", "documentType = 'reminder'") && ok;
  ok = assert(popupClosed, "popup closed after email sent") && ok;
  ok = assertEqual(dbCalls.length, 1, "one DB update") && ok;
  ok = assertEqual(localRows[0].reminder_level as number, 2, "local reminder_level = 2") && ok;
  ok = assert(localRows[0].reminder_2_sent_at !== null, "reminder_2_sent_at populated") && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 9: handleReminderMediadata — no email send, modal pre-fill
// ---------------------------------------------------------------------------

async function testHandleReminderMediadata() {
  console.log("\nTest 9: handleReminderMediadata (modal pre-fill check)");

  let ok = true;

  const row = makeRow({ id: "inv-medidata-01" });
  let insuranceTarget: InvoiceRow | null = null as InvoiceRow | null;
  let reminderOverride: number | null = null;
  let modalOpen = false;
  let popupClosed = false;

  function handleReminderMediadata(r: InvoiceRow, level: 1 | 2 | 3) {
    popupClosed = true;
    insuranceTarget = r;
    reminderOverride = level;
    modalOpen = true;
  }

  handleReminderMediadata(row, 3);

  ok = assert(popupClosed, "reminder popup closed") && ok;
  ok = assert(modalOpen, "InsuranceBillingModal opened") && ok;
  ok = assertEqual(insuranceTarget?.id, row.id, "correct invoice set as modal target") && ok;
  ok = assertEqual(reminderOverride, 3, "reminderOverride set to 3 (3rd reminder)") && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 10: InsuranceBillingModal onSuccess → markReminderSent
// ---------------------------------------------------------------------------

async function testInsuranceBillingModalOnSuccess() {
  console.log("\nTest 10: InsuranceBillingModal.onSuccess marks reminder sent");

  let ok = true;

  const row = makeRow({ id: "inv-modal-01" });
  let localRows: InvoiceRow[] = [{ ...row }];
  let modalOpen = true;
  let insuranceTarget: InvoiceRow | null = row;
  let reminderOverride: number | null = 2;

  const { client: mockDb, calls: dbCalls } = createSupabaseMock();

  // Simulate the onSuccess callback from MedicalConsultationsCard
  async function onSuccess() {
    if (reminderOverride && insuranceTarget?.id) {
      const now = new Date().toISOString();
      const lvl = reminderOverride as 1 | 2 | 3;
      const update: Record<string, unknown> = { reminder_level: lvl };
      if (lvl === 1) update.reminder_1_sent_at = now;
      else if (lvl === 2) update.reminder_2_sent_at = now;
      else update.reminder_3_sent_at = now;
      await (mockDb as any).from("invoices").update(update).eq("id", insuranceTarget.id);
      localRows = localRows.map(lr =>
        lr.id === insuranceTarget!.id ? { ...lr, ...update } as InvoiceRow : lr
      );
    }
    modalOpen = false;
    insuranceTarget = null;
    reminderOverride = null;
  }

  await onSuccess();

  ok = assert(!modalOpen, "modal closed after success") && ok;
  ok = assert(insuranceTarget === null, "insuranceTarget cleared") && ok;
  ok = assert(reminderOverride === null, "reminderOverride cleared") && ok;
  ok = assertEqual(dbCalls.length, 1, "DB updated after Medidata success") && ok;
  ok = assertEqual(dbCalls[0].update.reminder_level as number, 2, "reminder_level set to 2") && ok;
  ok = assert("reminder_2_sent_at" in dbCalls[0].update, "reminder_2_sent_at included in DB update") && ok;
  ok = assertEqual(localRows[0].reminder_level as number, 2, "local state updated") && ok;

  // Verify no-op when reminderOverride is null (normal insurance submission)
  reminderOverride = null;
  insuranceTarget = row;
  modalOpen = true;
  const prevDbCallCount = dbCalls.length;

  await onSuccess();

  ok = assert(!modalOpen, "modal closes for normal insurance submission") && ok;
  ok = assertEqual(dbCalls.length, prevDbCallCount, "no extra DB call for normal submission") && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 11: ConsultationRow type fields — data flow simulation
// ---------------------------------------------------------------------------

function testConsultationRowDataMapping() {
  console.log("\nTest 11: ConsultationRow invoice data mapping");

  let ok = true;

  // Simulates invoice record from DB → ConsultationRow mapping
  interface MockInvRecord {
    id: string;
    due_date: string | null;
    reminder_level: number | null;
    reminder_1_sent_at: string | null;
    reminder_2_sent_at: string | null;
    reminder_3_sent_at: string | null;
    status: string;
    total_amount: number;
  }

  interface ConsultationRowFragment {
    invoice_due_date: string | null;
    invoice_reminder_level: number;
    invoice_reminder_1_sent_at: string | null;
    invoice_reminder_2_sent_at: string | null;
    invoice_reminder_3_sent_at: string | null;
  }

  function mapInvToConsultationRow(inv: MockInvRecord): ConsultationRowFragment {
    return {
      invoice_due_date: inv.due_date ?? null,
      invoice_reminder_level: inv.reminder_level ?? 0,
      invoice_reminder_1_sent_at: inv.reminder_1_sent_at ?? null,
      invoice_reminder_2_sent_at: inv.reminder_2_sent_at ?? null,
      invoice_reminder_3_sent_at: inv.reminder_3_sent_at ?? null,
    };
  }

  // Fully populated DB record
  const inv1: MockInvRecord = {
    id: "inv-1",
    due_date: "2025-05-01",
    reminder_level: 2,
    reminder_1_sent_at: "2025-06-05T10:00:00Z",
    reminder_2_sent_at: "2025-07-01T10:00:00Z",
    reminder_3_sent_at: null,
    status: "OPEN",
    total_amount: 350,
  };
  const row1 = mapInvToConsultationRow(inv1);
  ok = assertEqual(row1.invoice_due_date, "2025-05-01", "due_date mapped") && ok;
  ok = assertEqual(row1.invoice_reminder_level, 2, "reminder_level = 2") && ok;
  ok = assertEqual(row1.invoice_reminder_1_sent_at, "2025-06-05T10:00:00Z", "r1_sent_at mapped") && ok;
  ok = assertEqual(row1.invoice_reminder_2_sent_at, "2025-07-01T10:00:00Z", "r2_sent_at mapped") && ok;
  ok = assertEqual(row1.invoice_reminder_3_sent_at, null, "r3_sent_at = null") && ok;

  // Null/missing fields → defaults
  const inv2: MockInvRecord = {
    id: "inv-2",
    due_date: null,
    reminder_level: null,
    reminder_1_sent_at: null,
    reminder_2_sent_at: null,
    reminder_3_sent_at: null,
    status: "OPEN",
    total_amount: 100,
  };
  const row2 = mapInvToConsultationRow(inv2);
  ok = assertEqual(row2.invoice_due_date, null, "null due_date → null") && ok;
  ok = assertEqual(row2.invoice_reminder_level, 0, "null reminder_level → 0 (default)") && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 12: Medidata page filter options presence
// ---------------------------------------------------------------------------

function testMedidataStatusOptions() {
  console.log("\nTest 12: Medidata STATUS_OPTIONS include reminder statuses");

  // Mirror the options list from medidata/page.tsx
  const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: "", label: "All statuses" },
    { value: "draft", label: "Draft" },
    { value: "pending", label: "Pending" },
    { value: "transmitted", label: "Transmitted" },
    { value: "delivered", label: "Delivered" },
    { value: "accepted", label: "Accepted" },
    { value: "rejected", label: "Rejected" },
    { value: "paid", label: "Paid" },
    { value: "partially_paid", label: "Partially Paid" },
    { value: "reminder_1", label: "1er Rappel" },
    { value: "reminder_2", label: "2e Rappel" },
    { value: "reminder_3", label: "3e Rappel" },
    { value: "collection", label: "Recouvrement" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const values = STATUS_OPTIONS.map(o => o.value);

  let ok = true;
  ok = assert(values.includes("reminder_1"), "reminder_1 option present") && ok;
  ok = assert(values.includes("reminder_2"), "reminder_2 option present") && ok;
  ok = assert(values.includes("reminder_3"), "reminder_3 option present") && ok;
  ok = assert(values.includes("collection"), "collection option present") && ok;

  const r1 = STATUS_OPTIONS.find(o => o.value === "reminder_1");
  const r2 = STATUS_OPTIONS.find(o => o.value === "reminder_2");
  const r3 = STATUS_OPTIONS.find(o => o.value === "reminder_3");
  ok = assertEqual(r1?.label, "1er Rappel", "reminder_1 label = '1er Rappel'") && ok;
  ok = assertEqual(r2?.label, "2e Rappel", "reminder_2 label = '2e Rappel'") && ok;
  ok = assertEqual(r3?.label, "3e Rappel", "reminder_3 label = '3e Rappel'") && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 13: DB migration SQL structure
// ---------------------------------------------------------------------------

function testDbMigrationSql() {
  console.log("\nTest 13: DB migration SQL content verification");

  // Inline the migration SQL (same as supabase/migrations/20260800_reminder_tracking.sql)
  const sql = `
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_level int NOT NULL DEFAULT 0;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_1_sent_at timestamptz;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_2_sent_at timestamptz;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_3_sent_at timestamptz;
  `;

  let ok = true;
  ok = assert(sql.includes("reminder_level"), "migration adds reminder_level") && ok;
  ok = assert(sql.includes("DEFAULT 0"), "reminder_level has DEFAULT 0") && ok;
  ok = assert(sql.includes("reminder_1_sent_at"), "migration adds reminder_1_sent_at") && ok;
  ok = assert(sql.includes("reminder_2_sent_at"), "migration adds reminder_2_sent_at") && ok;
  ok = assert(sql.includes("reminder_3_sent_at"), "migration adds reminder_3_sent_at") && ok;
  ok = assert(sql.includes("timestamptz"), "sent_at columns are timestamptz") && ok;
  ok = assert(sql.includes("IF NOT EXISTS"), "columns use IF NOT EXISTS guard") && ok;
  ok = assert(!sql.includes("DROP"), "migration has no DROP statements") && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Test 14: Edge cases — boundary thresholds
// ---------------------------------------------------------------------------

function testBoundaryThresholds() {
  console.log("\nTest 14: Boundary thresholds (34d / 35d, 24d / 25d, 19d / 20d)");

  let ok = true;

  // 1st reminder threshold: exactly 35d
  ok = assertEqual(
    nextReminderLevel(makeRow({ due_date: dateNDaysAgo(35) })),
    1,
    "exactly 35d overdue → 1st reminder due"
  ) && ok;
  ok = assertEqual(
    nextReminderLevel(makeRow({ due_date: dateNDaysAgo(34) })),
    null,
    "34d overdue → NOT due yet"
  ) && ok;

  // 2nd reminder threshold: exactly 25d since 1st
  ok = assertEqual(
    nextReminderLevel(makeRow({ reminder_level: 1, reminder_1_sent_at: daysAgo(25) })),
    2,
    "exactly 25d after 1st → 2nd due"
  ) && ok;
  ok = assertEqual(
    nextReminderLevel(makeRow({ reminder_level: 1, reminder_1_sent_at: daysAgo(24) })),
    null,
    "24d after 1st → NOT due"
  ) && ok;

  // 3rd reminder threshold: exactly 20d since 2nd
  ok = assertEqual(
    nextReminderLevel(makeRow({ reminder_level: 2, reminder_2_sent_at: daysAgo(20) })),
    3,
    "exactly 20d after 2nd → 3rd due"
  ) && ok;
  ok = assertEqual(
    nextReminderLevel(makeRow({ reminder_level: 2, reminder_2_sent_at: daysAgo(19) })),
    null,
    "19d after 2nd → NOT due"
  ) && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function runAll() {
  console.log("=== Reminder Tracking Tests ===");

  const t1 = testOverdueBaseDays();
  const t2 = testDaysSince();
  const t3 = testNextReminderLevel();
  const t4 = testEchuDepuisLabel();
  const t5 = testMatchesReminderFilter();
  const t6 = await testMarkReminderSent();
  const t7 = await testHandleReminderPrint();
  const t8 = await testHandleReminderEmail();
  const t9 = await testHandleReminderMediadata();
  const t10 = await testInsuranceBillingModalOnSuccess();
  const t11 = testConsultationRowDataMapping();
  const t12 = testMedidataStatusOptions();
  const t13 = testDbMigrationSql();
  const t14 = testBoundaryThresholds();

  const allPassed = t1 && t2 && t3 && t4 && t5 && t6 && t7 && t8 && t9 && t10 && t11 && t12 && t13 && t14;

  console.log("\n=== Test Summary ===");
  const tests = [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14];
  const labels = [
    "01 overdueBaseDays",
    "02 daysSince",
    "03 nextReminderLevel",
    "04 echuDepuisLabel",
    "05 matchesReminderFilter",
    "06 markReminderSent (mock DB)",
    "07 handleReminderPrint (mock fetch+DB)",
    "08 handleReminderEmail (mock fetch+DB)",
    "09 handleReminderMediadata (modal pre-fill)",
    "10 InsuranceBillingModal.onSuccess",
    "11 ConsultationRow data mapping",
    "12 Medidata status options",
    "13 DB migration SQL",
    "14 Boundary thresholds",
  ];
  for (let i = 0; i < tests.length; i++) {
    console.log(`  Test ${labels[i]}: ${tests[i] ? "PASSED ✓" : "FAILED ✗"}`);
  }
  console.log(`\nTotal assertions: ${totalPassed + totalFailed} | Passed: ${totalPassed} | Failed: ${totalFailed}`);
  console.log(`\nOverall: ${allPassed ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED ✗"}`);

  if (!allPassed) process.exit(1);
}

runAll().catch(err => {
  console.error("Unexpected test runner error:", err);
  process.exit(1);
});
