/**
 * BILL-010 sanity/mock test.
 *
 * Verifies that deposit invoices ("Acompte 50%") created via
 * /api/payments/stripe/create-prepayment-invoice are assigned to the
 * correct billing entity per doctor:
 *   - Plakalo, Koltunova, Guarino, Benani -> their DOCTOR (medical) entity
 *   - Miles, Nordback                     -> their SOINS (aesthetic) entity
 *   - any other doctor                    -> unchanged default (prefer aesthetic)
 *
 * Uses the pre-existing "Ralf Mutant" test patient and a real service row
 * (only used for its price/name; not modified). Creates one temporary
 * deposit invoice per doctor, checks provider_id/provider_name, then
 * deletes everything it created.
 *
 * Usage: npx tsx scripts/bill-010-mock-test.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const APP_URL = process.env.MOCK_TEST_APP_URL || "http://localhost:3001";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const RALF_PATIENT_ID = "f4f24671-4b0b-4d0f-9829-41623291d5c8";

const cases: Array<{ label: string; doctorName: string; expectedEntityName: string }> = [
  { label: "Dr Plakalo -> Dr Adnan Plakalo (medical)", doctorName: "Dr. Adnan Plakalo", expectedEntityName: "Dr Adnan Plakalo" },
  { label: "Dr Koltunova -> Dr Koltunova Natalia (medical)", doctorName: "Dr Natalia Koltunova", expectedEntityName: "Dr Koltunova Natalia" },
  { label: "Dr Guarino -> Dr Guarino (medical)", doctorName: "Dr Laetitia Guarino", expectedEntityName: "Dr Guarino" },
  { label: "Dr Benani -> Dr Benani Reda (medical)", doctorName: "Dr Reda Benani", expectedEntityName: "Dr Benani Reda" },
  { label: "Dr Miles -> Soins Miles (aesthetic)", doctorName: "Dr Alexandra Miles", expectedEntityName: "Soins Miles" },
  { label: "Dr Nordback -> Soins Nordback (aesthetic)", doctorName: "Dr Sophie Nordback", expectedEntityName: "Soins Nordback" },
  { label: "Control: Juliette -> Soins Assistantes (unchanged default, single entity)", doctorName: "Juliette", expectedEntityName: "Soins Assistantes" },
];

let failures = 0;
const cleanupIds: string[] = [];

function log(...args: unknown[]) {
  console.log("[BILL-010 mock test]", ...args);
}

async function fetchJson(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  log(`App URL: ${APP_URL}`);

  const { data: service } = await supabase
    .from("services")
    .select("id, name, base_price")
    .not("base_price", "is", null)
    .gt("base_price", 0)
    .limit(1)
    .single();
  if (!service) throw new Error("No service with a base_price found for testing");
  log(`Using service "${service.name}" (${service.id})`);

  for (const c of cases) {
    log(`\n--- ${c.label} ---`);
    const { data: doctor } = await supabase.from("providers").select("id, name").eq("role", "doctor").ilike("name", `%${c.doctorName.replace(/^Dr\.?\s*/i, "")}%`).limit(1).single();
    if (!doctor) {
      log(`❌ FAILED: could not find doctor matching "${c.doctorName}"`);
      failures++;
      continue;
    }
    log(`Resolved doctor: "${doctor.name}" (${doctor.id})`);

    const { ok, status, data } = await fetchJson(`${APP_URL}/api/payments/stripe/create-prepayment-invoice`, {
      method: "POST",
      body: JSON.stringify({ patientId: RALF_PATIENT_ID, serviceId: service.id, doctorId: doctor.id }),
    });

    if (!ok || !data.invoiceId) {
      log(`❌ FAILED (HTTP ${status}):`, JSON.stringify(data));
      failures++;
      continue;
    }
    cleanupIds.push(data.invoiceId);

    const { data: invoiceRow } = await supabase.from("invoices").select("id, provider_id, provider_name").eq("id", data.invoiceId).single();
    log(`Created deposit invoice ${data.invoiceNumber} -> provider_name="${invoiceRow?.provider_name}"`);

    if (invoiceRow?.provider_name === c.expectedEntityName) {
      log(`✅ Correct billing entity: "${c.expectedEntityName}"`);
    } else {
      log(`❌ FAILED: expected "${c.expectedEntityName}", got "${invoiceRow?.provider_name}"`);
      failures++;
    }
  }

  log(`\n${failures === 0 ? "✅ ALL TESTS PASSED" : `❌ ${failures} TEST(S) FAILED`}`);

  log("\nRunning cleanup...");
  for (const id of cleanupIds) {
    await supabase.from("invoice_line_items").delete().eq("invoice_id", id);
    await supabase.from("invoices").delete().eq("id", id);
  }
  log(`Deleted ${cleanupIds.length} test invoice(s).`);

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  log("❌ Unhandled error:", err);
  process.exit(1);
});
