import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: skip if already processed
  const { data: existing } = await supabase
    .from("stripe_webhook_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .single();

  if (existing) {
    return NextResponse.json({ received: true, skipped: true });
  }

  let invoiceId: string | null = null;
  let error: string | null = null;
  let status = "processed";

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const { type, invoice_id } = session.metadata || {};

      if (type === "invoice" && invoice_id) {
        invoiceId = invoice_id;
        const paidAmount = (session.amount_total || 0) / 100;
        const paymentIntentId = session.payment_intent as string;

        // Mark invoice paid
        await supabase
          .from("invoices")
          .update({
            status: "PAID",
            paid_amount: paidAmount,
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentIntentId,
            stripe_session_id: null,
            stripe_session_expires_at: null,
          })
          .eq("id", invoice_id);

        // Fetch patient_id for transaction log
        const { data: inv } = await supabase
          .from("invoices")
          .select("patient_id")
          .eq("id", invoice_id)
          .single();

        // Log transaction
        await supabase.from("stripe_transactions").upsert({
          stripe_payment_intent_id: paymentIntentId,
          stripe_session_id: session.id,
          invoice_id,
          patient_id: inv?.patient_id || null,
          amount: paidAmount,
          currency: session.currency || "chf",
          status: "succeeded",
          metadata: { session_id: session.id, customer_email: session.customer_email },
        }, { onConflict: "stripe_payment_intent_id" });

        console.log(`[Stripe Webhook] Invoice ${invoice_id} marked PAID — CHF ${paidAmount}`);
      } else {
        status = "ignored";
      }
    } else {
      status = "ignored";
    }
  } catch (err: any) {
    error = err.message;
    status = "failed";
    console.error("[Stripe Webhook] Processing error:", err);
  }

  // Log webhook event
  await supabase.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event as any,
    status,
    error,
    related_invoice_id: invoiceId,
  });

  return NextResponse.json({ received: true });
}

export const config = { api: { bodyParser: false } };
