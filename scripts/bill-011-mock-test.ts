/**
 * BILL-011 sanity/mock test.
 *
 * Simulates a real, signed Stripe "checkout.session.completed" webhook for
 * the manual "Acompte 50%" deposit flow (type=invoice_deposit) against the
 * actual /api/payments/stripe/webhook endpoint, to verify that once a
 * deposit is paid, invoice_date is updated to the payment date rather than
 * staying frozen at the (earlier) invoice creation date.
 *
 * Usage: npx tsx scripts/bill-011-mock-test.ts
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env.local"), override: true });

// This environment has no real Stripe test credentials configured
// (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are empty in .env.local).
// Signature verification is pure local HMAC — it works fine with any
// matching secret on both ends, so a fake-but-consistent value lets us
// exercise the real webhook route end-to-end. The dev server this test
// targets must be started with the SAME STRIPE_WEBHOOK_SECRET value, e.g.:
//   STRIPE_WEBHOOK_SECRET="whsec_fake_for_local_testing_only" \
//   STRIPE_SECRET_KEY="sk_test_fake_for_local_testing_only" PORT=3001 npm run dev
const APP_URL = process.env.MOCK_TEST_APP_URL || "http://localhost:3001";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_fake_for_local_testing_only";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_fake_for_local_testing_only";
const stripe = new Stripe(STRIPE_KEY);

const RALF_PATIENT_ID = "f4f24671-4b0b-4d0f-9829-41623291d5c8";

function log(...args: unknown[]) {
  console.log("[BILL-011 mock test]", ...args);
}

async function main() {
  log(`App URL: ${APP_URL}`);
  if (!WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET not set");

  // 1. Create a temp deposit invoice as if it was created 10 days ago (OPEN,
  // not yet paid) — mirrors a real "Acompte 50%" invoice sitting unpaid
  // while the patient has the payment link.
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const backdatedDate = tenDaysAgo.toISOString().split("T")[0];
  const invoiceNumber = `BILL011-TEST-${Date.now()}`;

  const { data: invoice, error: insertError } = await supabase
    .from("invoices")
    .insert({
      patient_id: RALF_PATIENT_ID,
      invoice_number: invoiceNumber,
      title: "Acompte 50% – Test treatment",
      invoice_date: backdatedDate,
      created_at: tenDaysAgo.toISOString(),
      total_amount: 75,
      subtotal: 75,
      paid_amount: 0,
      status: "OPEN",
      payment_method: "online",
      is_archived: false,
      is_demo: true,
    })
    .select("id, invoice_number, invoice_date")
    .single();

  if (insertError || !invoice) throw new Error(`Failed to create test invoice: ${insertError?.message}`);
  log(`Created test invoice ${invoice.invoice_number} (${invoice.id}) with invoice_date=${invoice.invoice_date} (backdated 10 days, status OPEN)`);

  try {
    // 2. Build a realistic checkout.session.completed event for this invoice,
    // matching what create-prepayment-invoice's Stripe checkout would send.
    const fakeSession = {
      id: `cs_test_${Date.now()}`,
      object: "checkout.session",
      amount_total: 7500, // CHF 75.00 in cents
      currency: "chf",
      payment_intent: `pi_test_${Date.now()}`,
      payment_method_types: ["card"],
      metadata: {
        type: "invoice_deposit",
        invoice_id: invoice.id,
        full_price: "150",
      },
    };
    const fakeEvent = {
      id: `evt_test_${Date.now()}`,
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: { object: fakeSession },
    };

    const payload = JSON.stringify(fakeEvent);
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });

    log(`Sending signed checkout.session.completed webhook to ${APP_URL}/api/payments/stripe/webhook ...`);
    const res = await fetch(`${APP_URL}/api/payments/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": header },
      body: payload,
    });
    const resText = await res.text();
    log(`Webhook response: HTTP ${res.status} — ${resText}`);

    if (!res.ok) {
      log("❌ FAILED: webhook did not return 200");
      process.exitCode = 1;
      return;
    }

    // 3. Re-fetch the invoice and verify invoice_date now reflects today
    // (the payment date), not the original backdated creation date.
    const { data: updated } = await supabase
      .from("invoices")
      .select("invoice_date, status, paid_at, paid_amount")
      .eq("id", invoice.id)
      .single();

    const today = new Date().toISOString().split("T")[0];
    log(`After payment: invoice_date=${updated?.invoice_date} | status=${updated?.status} | paid_at=${updated?.paid_at} | paid_amount=${updated?.paid_amount}`);

    let failed = false;
    if (updated?.status !== "PAID") {
      log("❌ FAILED: status is not PAID");
      failed = true;
    }
    if (updated?.invoice_date !== today) {
      log(`❌ FAILED: expected invoice_date to be today (${today}), got ${updated?.invoice_date}`);
      failed = true;
    } else {
      log(`✅ invoice_date correctly updated to payment date (${today}), no longer the backdated creation date (${backdatedDate})`);
    }

    process.exitCode = failed ? 1 : 0;
    log(failed ? "\n❌ TEST FAILED" : "\n✅ TEST PASSED");
  } finally {
    // Cleanup
    await supabase.from("stripe_transactions").delete().eq("invoice_id", invoice.id);
    await supabase.from("invoices").delete().eq("id", invoice.id);
    log(`Cleaned up test invoice ${invoice.invoice_number}`);
  }
}

main().catch((err) => {
  log("❌ Unhandled error:", err);
  process.exit(1);
});
