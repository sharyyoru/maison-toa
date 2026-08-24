/**
 * BILL-011 backfill: existing PAID deposit invoices ("Acompte...") whose
 * invoice_date does not match the date they were actually paid.
 *
 * Scope: only invoices identified as deposits (title starting with
 * "Acompte") that have already been paid (paid_at set) and whose
 * invoice_date differs from paid_at's date. Regular (non-deposit) invoices
 * are untouched — it's normal for those to be issued on one day and paid
 * on another.
 *
 * Usage:
 *   npx tsx scripts/bill-011-backfill-deposit-invoice-date.ts           # dry run (default)
 *   npx tsx scripts/bill-011-backfill-deposit-invoice-date.ts --apply   # actually update
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (will update rows)" : "DRY RUN (no changes will be made; pass --apply to update)"}`);

  const BATCH = 1000;
  let offset = 0;
  let totalChecked = 0;
  let totalMismatched = 0;
  let totalUpdated = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, title, invoice_date, paid_at, created_at")
      .ilike("title", "Acompte%")
      .not("paid_at", "is", null)
      .range(offset, offset + BATCH - 1)
      .order("id", { ascending: true });

    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    totalChecked += rows.length;

    for (const inv of rows) {
      const paidDate = (inv.paid_at as string).split("T")[0];
      if (inv.invoice_date === paidDate) continue; // already correct

      totalMismatched++;
      console.log(
        `${APPLY ? "UPDATING" : "WOULD UPDATE"}: ${inv.invoice_number} | invoice_date ${inv.invoice_date} -> ${paidDate} (paid_at date) | created_at=${(inv.created_at as string).split("T")[0]}`,
      );

      if (APPLY) {
        const { error: updateError } = await supabase.from("invoices").update({ invoice_date: paidDate }).eq("id", inv.id);
        if (updateError) {
          console.error(`  ERROR updating ${inv.invoice_number}:`, updateError.message);
        } else {
          totalUpdated++;
        }
      }
    }

    if (rows.length < BATCH) break;
    offset += BATCH;
  }

  console.log(`\nChecked ${totalChecked} deposit invoice(s) with paid_at set.`);
  console.log(`Found ${totalMismatched} with invoice_date != paid_at date.`);
  if (APPLY) console.log(`Updated ${totalUpdated}.`);
  else console.log(`Dry run only — re-run with --apply to update.`);
}

main();
