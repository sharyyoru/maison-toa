/**
 * BILL-012 sanity/mock test.
 *
 * Verifies that the billing-entity display fix did not break invoice PDF
 * generation, for both the TARDOC/insurance (TP) and non-insurance (TG)
 * Sumex1 code paths in /api/invoices/generate-pdf.
 *
 * Uses the pre-existing "Ralf Mutant" test patient:
 *  - Tests A/B: regenerate PDFs for two ALREADY-VERIFIED, pre-existing test
 *    invoices (previously generated on 2026-06-12) to confirm old working
 *    generations still work.
 *  - Tests C/D: create new temporary (is_demo) test invoices covering the
 *    other mapping branch (SOINS/aesthetic entity) and the TP/insurance
 *    Sumex code path, then clean them up afterward.
 *
 * Usage: npx tsx scripts/bill-012-mock-test.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const APP_URL = process.env.MOCK_TEST_APP_URL || "http://localhost:3001";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const RALF_PATIENT_ID = "f4f24671-4b0b-4d0f-9829-41623291d5c8";

const cleanupTasks: Array<() => Promise<void>> = [];
let failures = 0;

function log(...args: unknown[]) {
  console.log("[BILL-012 mock test]", ...args);
}

async function fetchJson(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const { data, error } = await supabase.storage.from("invoice-pdfs").download(pdfPath);
  if (error || !data) throw new Error(`Failed to download PDF ${pdfPath}: ${error?.message}`);
  const buffer = new Uint8Array(await data.arrayBuffer());
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

async function generateAndVerify(opts: {
  label: string;
  invoiceId: string;
  invoiceType: "tg" | "tp";
  expectedNameFragment: string;
  notExpectedFragment?: string;
}) {
  log(`\n--- ${opts.label} ---`);
  log(`Calling POST ${APP_URL}/api/invoices/generate-pdf for invoice ${opts.invoiceId} (type=${opts.invoiceType})`);

  const { ok, status, data } = await fetchJson(`${APP_URL}/api/invoices/generate-pdf`, {
    method: "POST",
    body: JSON.stringify({ invoiceId: opts.invoiceId, invoiceType: opts.invoiceType }),
  });

  if (!ok) {
    log(`❌ FAILED (HTTP ${status}):`, JSON.stringify(data));
    failures++;
    return;
  }

  log(`✅ HTTP ${status} OK. Response keys: ${Object.keys(data).join(", ")}`);

  // Re-fetch invoice row to find the pdf_path that was just written.
  const pdfColumn = opts.invoiceType === "tg" ? "pdf_path_tg" : "pdf_path_tp";
  const { data: invRow } = await supabase.from("invoices").select(`id, ${pdfColumn}, provider_name`).eq("id", opts.invoiceId).single();
  const pdfPath = (invRow as any)?.[pdfColumn];
  if (!pdfPath) {
    log(`❌ FAILED: no ${pdfColumn} set on invoice after generation`);
    failures++;
    return;
  }
  log(`PDF stored at: ${pdfPath}`);
  log(`invoices.provider_name = "${(invRow as any).provider_name}"`);

  const text = await extractPdfText(pdfPath);
  const normalized = text.replace(/\s+/g, " ");

  if (normalized.includes(opts.expectedNameFragment)) {
    log(`✅ PDF text contains expected billing entity name: "${opts.expectedNameFragment}"`);
  } else {
    log(`❌ FAILED: PDF text does NOT contain expected "${opts.expectedNameFragment}"`);
    log(`   PDF text excerpt: ${normalized.slice(0, 400)}`);
    failures++;
  }

  if (opts.notExpectedFragment) {
    if (!normalized.includes(opts.notExpectedFragment)) {
      log(`✅ PDF text correctly does NOT contain "${opts.notExpectedFragment}"`);
    } else {
      log(`❌ FAILED: PDF text unexpectedly contains "${opts.notExpectedFragment}"`);
      failures++;
    }
  }
}

// Real, previously-verified TARDOC line item (from invoice 1003057) used as a
// template so synthetic test invoices have valid Sumex-compatible line items
// (correct "AA.xx.xxxx" code format, catalog_name casing, GLNs, tp_al/tp_tl
// tax-point values, etc.) instead of a hand-rolled/incomplete row.
const REAL_LINE_ITEM_TEMPLATE_INVOICE_ID = "9b64ef00-0985-4b81-adde-289c4cc95c03";

async function createTestInvoice(opts: {
  providerId: string;
  providerName: string;
  doctorGln: string;
  billingType: "TG" | "TP";
}) {
  const invoiceNumber = `SANITY-TEST-${Date.now()}`;
  const now = new Date().toISOString();
  const invoiceDate = now.split("T")[0];

  const { data: templateLines } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", REAL_LINE_ITEM_TEMPLATE_INVOICE_ID)
    .order("sort_order");
  if (!templateLines || templateLines.length === 0) {
    throw new Error("Could not load real line-item template — did the source test invoice get deleted?");
  }
  const total = templateLines.reduce((sum, li: any) => sum + Number(li.total_price || 0), 0);

  const { data: provider } = await supabase
    .from("providers")
    .select("id, name, gln, zsr, iban")
    .eq("id", opts.providerId)
    .single();

  const { data: insurance } = await supabase
    .from("patient_insurances")
    .select("insurer_gln, insurer_id, law_type")
    .eq("patient_id", RALF_PATIENT_ID)
    .eq("is_primary", true)
    .maybeSingle();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      patient_id: RALF_PATIENT_ID,
      invoice_number: invoiceNumber,
      title: `[SANITY TEST] ${opts.providerName}`,
      invoice_date: invoiceDate,
      due_date: invoiceDate,
      treatment_date: now,
      total_amount: total,
      subtotal: total,
      vat_amount: 0,
      paid_amount: 0,
      status: "OPEN",
      payment_method: opts.billingType === "TP" ? "Insurance" : "Cash",
      is_archived: false,
      is_demo: true,
      is_complimentary: false,
      billing_type: opts.billingType,
      health_insurance_law: "KVG",
      treatment_canton: "VD",
      treatment_reason: "disease",
      insurer_id: opts.billingType === "TP" ? insurance?.insurer_id ?? null : null,
      insurance_gln: opts.billingType === "TP" ? insurance?.insurer_gln ?? null : null,
      created_at: now,
      updated_at: now,
      provider_id: provider?.id ?? null,
      provider_name: opts.providerName, // mirrors what MedicalConsultationsCard.tsx now writes
      provider_gln: provider?.gln ?? null,
      provider_zsr: provider?.zsr ?? null,
      provider_iban: provider?.iban ?? null,
      doctor_name: "Dr Alexandra Miles",
      doctor_gln: opts.doctorGln,
    })
    .select("id, invoice_number")
    .single();

  if (error || !invoice) throw new Error(`Failed to create test invoice: ${error?.message}`);
  log(`Created test invoice ${invoice.invoice_number} (${invoice.id}) for provider "${opts.providerName}"`);

  for (const template of templateLines) {
    const { id: _id, invoice_id: _invoiceId, created_at: _createdAt, ...rest } = template as any;
    await supabase.from("invoice_line_items").insert({
      ...rest,
      invoice_id: invoice.id,
      provider_gln: opts.doctorGln,
      responsible_gln: opts.doctorGln,
    });
  }

  cleanupTasks.push(async () => {
    const { data: jobs } = await supabase.from("pdf_generation_jobs").select("pdf_path").eq("invoice_id", invoice.id);
    for (const job of jobs || []) {
      if (job.pdf_path) await supabase.storage.from("invoice-pdfs").remove([job.pdf_path]);
    }
    const { data: freshRow } = await supabase
      .from("invoices")
      .select("pdf_path, pdf_path_tg, pdf_path_tp")
      .eq("id", invoice.id)
      .single();
    const paths = [freshRow?.pdf_path, freshRow?.pdf_path_tg, freshRow?.pdf_path_tp].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from("invoice-pdfs").remove([...new Set(paths)]);
    await supabase.from("pdf_generation_jobs").delete().eq("invoice_id", invoice.id);
    await supabase.from("invoice_line_items").delete().eq("invoice_id", invoice.id);
    await supabase.from("invoices").delete().eq("id", invoice.id);
    log(`Cleaned up test invoice ${invoice.invoice_number} (${invoice.id})`);
  });

  return invoice;
}

async function main() {
  log(`App URL: ${APP_URL}`);

  try {
    // --- Tests A & B: regenerate PDFs for pre-existing, ALREADY-VERIFIED test invoices ---
    // These were originally generated (and presumably manually verified) on 2026-06-12,
    // well before the BILL-012 fix. Regenerating them now confirms the fix does not
    // break previously-working generations.
    await generateAndVerify({
      label: "TEST A: regenerate pre-existing verified invoice 1003057 (TG, Dr Miles Alexandra)",
      invoiceId: "9b64ef00-0985-4b81-adde-289c4cc95c03",
      invoiceType: "tg",
      expectedNameFragment: "Miles",
      notExpectedFragment: "TOA SA",
    });

    await generateAndVerify({
      label: "TEST B: regenerate pre-existing verified invoice 1003056 (TG, Dr Miles Alexandra, 5 line items)",
      invoiceId: "facfffbd-c0d0-48ae-b89b-637e6b3a2cb9",
      invoiceType: "tg",
      expectedNameFragment: "Miles",
      notExpectedFragment: "TOA SA",
    });

    // --- Test C: new temp invoice, SOINS/aesthetic entity mapping, TG path ---
    const soinsEntity = await supabase
      .from("providers")
      .select("id, name")
      .eq("name", "Soins Miles")
      .eq("role", "billing_entity")
      .single();
    if (soinsEntity.data) {
      const invC = await createTestInvoice({
        providerId: soinsEntity.data.id,
        providerName: soinsEntity.data.name,
        doctorGln: "7601000942654", // Dr Alexandra Miles
        billingType: "TG",
      });
      await generateAndVerify({
        label: "TEST C: new invoice, SOINS/aesthetic entity (Soins Miles), TG path",
        invoiceId: invC.id,
        invoiceType: "tg",
        expectedNameFragment: "Soins Miles",
        notExpectedFragment: "TOA SA",
      });
    } else {
      log("⚠️  Could not find 'Soins Miles' billing entity, skipping Test C");
    }

    // --- Test D: new temp invoice, Doctor entity mapping, TP/insurance (TARDOC) path ---
    const nordbackEntity = await supabase
      .from("providers")
      .select("id, name")
      .eq("name", "Dr Nordback Sophie")
      .eq("role", "billing_entity")
      .single();
    if (nordbackEntity.data) {
      const invD = await createTestInvoice({
        providerId: nordbackEntity.data.id,
        providerName: nordbackEntity.data.name,
        doctorGln: "7601000731173", // Dr Sophie Nordback
        billingType: "TP",
      });
      await generateAndVerify({
        label: "TEST D: new invoice, Doctor entity (Dr Nordback Sophie), TP/insurance TARDOC path",
        invoiceId: invD.id,
        invoiceType: "tp",
        expectedNameFragment: "Nordback",
        notExpectedFragment: "TOA SA",
      });
    } else {
      log("⚠️  Could not find 'Dr Nordback Sophie' billing entity, skipping Test D");
    }

    log(`\n${failures === 0 ? "✅ ALL TESTS PASSED" : `❌ ${failures} TEST(S) FAILED`}`);
  } catch (err) {
    log("❌ Unhandled error:", err);
    failures++;
  } finally {
    log("\nRunning cleanup...");
    for (const task of cleanupTasks) {
      try {
        await task();
      } catch (err) {
        log("Cleanup task failed:", err);
      }
    }
    process.exit(failures > 0 ? 1 : 0);
  }
}

main();
