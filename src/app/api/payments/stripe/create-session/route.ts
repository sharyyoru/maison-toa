import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";
const SESSION_BUFFER_MINUTES = 30; // reuse session if it expires more than 30min from now

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    // Load invoice by payment_link_token
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, status, patient_id, stripe_session_id, stripe_session_expires_at")
      .eq("payment_link_token", token)
      .single();

    if (error || !invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoice.status === "PAID" || invoice.status === "OVERPAID") {
      return NextResponse.json({ error: "Invoice already paid" }, { status: 400 });
    }

    // Reuse existing session if still valid (expires > now + buffer)
    if (invoice.stripe_session_id && invoice.stripe_session_expires_at) {
      const expiresAt = new Date(invoice.stripe_session_expires_at);
      const bufferMs = SESSION_BUFFER_MINUTES * 60 * 1000;
      if (expiresAt.getTime() - Date.now() > bufferMs) {
        // Retrieve session URL from Stripe
        const existing = await stripe.checkout.sessions.retrieve(invoice.stripe_session_id);
        if (existing.status === "open" && existing.url) {
          return NextResponse.json({ url: existing.url });
        }
      }
    }

    // Load patient for prefill
    const { data: patient } = await supabase
      .from("patients")
      .select("first_name, last_name, email")
      .eq("id", invoice.patient_id)
      .single();

    // Create new Stripe Checkout Session (max 24h)
    const expiresAt = Math.floor(Date.now() / 1000) + 23 * 60 * 60; // 23h from now
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "chf",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "chf",
            unit_amount: Math.round(Number(invoice.total_amount) * 100), // cents
            product_data: {
              name: `Facture ${invoice.invoice_number}`,
              description: "Maison Tóā – Paiement en ligne",
            },
          },
        },
      ],
      customer_email: patient?.email || undefined,
      expires_at: expiresAt,
      metadata: {
        type: "invoice",
        invoice_id: invoice.id,
        payment_token: token,
      },
      success_url: `${APP_URL}/invoice/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/invoice/pay/${token}`,
    });

    // Save session info on invoice
    await supabase
      .from("invoices")
      .update({
        stripe_session_id: session.id,
        stripe_session_expires_at: new Date(expiresAt * 1000).toISOString(),
      })
      .eq("id", invoice.id);

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[Stripe] create-session error:", err);
    return NextResponse.json({ error: err.message || "Failed to create payment session" }, { status: 500 });
  }
}
