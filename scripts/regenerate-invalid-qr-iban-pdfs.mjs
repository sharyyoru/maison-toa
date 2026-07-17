#!/usr/bin/env node
/*
 * Identify (and optionally regenerate) all invoice PDFs whose provider/billing
 * IBAN is not a valid Swiss QR-IBAN. After the generate-pdf fallback change,
 * these PDFs would have shown an incorrect default QR-IBAN; regenerating them
 * with ExcludeESRInPrint hides the QR/ESR section.
 *
 * Usage:
 *   NEXT_PUBLIC_APP_URL=http://localhost:3000 node scripts/regenerate-invalid-qr-iban-pdfs.mjs [--regenerate]
 *
 * Without --regenerate it only prints the list of affected invoices.
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env.local") });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REGENERATE = process.argv.includes("--regenerate");

const sanitizeQrIban = (raw) => {
  if (!raw) return null;
  const stripped = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^CH[0-9A-Z]{19}$/.test(stripped)) return null;
  const iid = parseInt(stripped.slice(4, 9), 10);
  if (Number.isNaN(iid) || iid < 30000 || iid > 31999) return null;
  return stripped;
};

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: providers, error: providersError } = await supabase
    .from("providers")
    .select("id, iban");
  if (providersError) throw providersError;

  const providerIbanById = new Map(providers.map((p) => [p.id, p.iban]));

  const pdfFilter =
    "pdf_path.not.is.null,pdf_path_tg.not.is.null,pdf_path_tp.not.is.null,pdf_path_reminder.not.is.null,pdf_path_receipt.not.is.null";
  let invoices = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: pageData, error: pageError } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, provider_id, provider_iban, billing_type, status, pdf_path, pdf_path_tg, pdf_path_tp, pdf_path_reminder, pdf_path_receipt"
      )
      .or(pdfFilter)
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (pageError) throw pageError;
    if (!pageData || pageData.length === 0) break;
    invoices = invoices.concat(pageData);
    if (pageData.length < pageSize) break;
    page += 1;
  }

  const affected = [];
  for (const inv of invoices) {
    const providerIban = providerIbanById.get(inv.provider_id) || null;
    const effectiveIban = providerIban || inv.provider_iban;
    if (sanitizeQrIban(effectiveIban)) continue;

    const pdfTypes = [];
    if (inv.pdf_path_tg) pdfTypes.push("tg");
    if (inv.pdf_path_tp) pdfTypes.push("tp");
    if (inv.pdf_path_reminder) pdfTypes.push("reminder");
    if (inv.pdf_path_receipt) pdfTypes.push("receipt");
    if (!pdfTypes.length && inv.pdf_path) {
      const derived = inv.billing_type?.toLowerCase();
      pdfTypes.push(["tg", "tp", "reminder", "receipt"].includes(derived) ? derived : "tp");
    }

    if (pdfTypes.length) {
      affected.push({ ...inv, effective_iban: effectiveIban, pdfTypes });
    }
  }

  console.log(`Found ${affected.length} invoices with invalid/non-QR provider IBANs and existing PDFs.`);
  for (const inv of affected) {
    console.log(
      `- ${inv.invoice_number} (${inv.id}): effective IBAN=${inv.effective_iban || "(none)"}, types=${inv.pdfTypes.join(",")}`
    );
  }

  if (!REGENERATE) {
    console.log("\nRun with --regenerate to regenerate these PDFs.");
    return;
  }

  console.log("\nRegenerating PDFs...");
  let ok = 0;
  let fail = 0;
  for (const inv of affected) {
    for (const type of inv.pdfTypes) {
      try {
        const res = await fetch(`${APP_URL}/api/invoices/generate-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: inv.id,
            invoiceType: type,
            reminderLevel: type === "reminder" ? 1 : undefined,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          console.log(`  OK ${inv.invoice_number} (${type}): ${data.pdfPath}`);
          ok += 1;
        } else {
          console.error(`  FAIL ${inv.invoice_number} (${type}): ${data.error} — ${data.details || ""}`);
          fail += 1;
        }
      } catch (err) {
        console.error(`  FAIL ${inv.invoice_number} (${type}): ${err.message}`);
        fail += 1;
      }
    }
  }
  console.log(`\nDone: ${ok} regenerated, ${fail} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
