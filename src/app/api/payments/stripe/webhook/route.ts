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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { type, invoice_id } = session.metadata || {};

    if (type === "invoice" && invoice_id) {
      const paidAmount = (session.amount_total || 0) / 100;

      await supabase
        .from("invoices")
        .update({
          status: "PAID",
          paid_amount: paidAmount,
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: session.payment_intent as string,
          stripe_session_id: null,
          stripe_session_expires_at: null,
        })
        .eq("id", invoice_id);

      console.log(`[Stripe Webhook] Invoice ${invoice_id} marked PAID — CHF ${paidAmount}`);
    }
  }

  return NextResponse.json({ received: true });
}

// Stripe requires raw body — disable Next.js body parsing
export const config = { api: { bodyParser: false } };
