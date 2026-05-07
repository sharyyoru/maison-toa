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

      } else if (type === "booking_deposit") {
        const m = session.metadata!;
        const depositAmount = (session.amount_total || 0) / 100;
        const fullPrice = parseFloat(m.full_price || "0");
        const paymentIntentId = session.payment_intent as string;

        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";

        // 1. Create appointment via existing API (handles patient, provider, email, workflow)
        const bookRes = await fetch(`${APP_URL}/api/public/book-appointment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: m.first_name,
            lastName: m.last_name,
            email: m.email,
            phone: m.phone || undefined,
            appointmentDate: m.appointment_date,
            service: m.service_label,
            doctorSlug: m.doctor_slug,
            doctorName: m.doctor_name,
            doctorEmail: "info@maisontoa.com",
            notes: m.notes || undefined,
            location: m.location || "Lausanne",
            patientType: "new",
            treatmentId: m.treatment_id,
            language: m.language || "fr",
          }),
        });

        if (!bookRes.ok) {
          const bookErr = await bookRes.text();
          throw new Error(`book-appointment failed: ${bookErr}`);
        }

        // 2. Look up the patient by email
        const { data: patients } = await supabase
          .from("patients")
          .select("id")
          .ilike("email", m.email)
          .limit(1);
        const patientId = patients?.[0]?.id ?? null;

        // 3. Look up provider by doctor slug/name for billing
        const doctorSlug = m.doctor_slug || "";
        const doctorName = m.doctor_name || "";
        let provider: any = null;

        const { data: providerBySlug } = await supabase
          .from("providers")
          .select("id, name, iban, gln, zsr")
          .ilike("name", `%${doctorName.replace(/^Dr\.\s*/i, "").split(" ")[0]}%`)
          .in("role", ["provider", "billing_entity"])
          .limit(1)
          .single();
        provider = providerBySlug;

        // 4. Create PARTIAL_PAID invoice with proper fields
        if (patientId && fullPrice > 0) {
          const { data: maxRow } = await supabase
            .from("invoices")
            .select("invoice_number")
            .order("invoice_number", { ascending: false })
            .limit(1)
            .single();
          const nextNumber = String((parseInt(maxRow?.invoice_number || "1000000") + 1));

          const nowIso = new Date().toISOString();
          const title = `Acompte – ${m.treatment_name}`;

          const { data: newInvoice } = await supabase
            .from("invoices")
            .insert({
              patient_id: patientId,
              invoice_number: nextNumber,
              title,
              invoice_date: nowIso.split("T")[0],
              treatment_date: m.appointment_date?.split("T")[0] ?? nowIso.split("T")[0],
              doctor_name: doctorName,
              provider_id: provider?.id ?? null,
              provider_name: provider?.name ?? null,
              provider_iban: provider?.iban ?? null,
              provider_gln: provider?.gln ?? null,
              provider_zsr: provider?.zsr ?? null,
              subtotal: fullPrice,
              total_amount: fullPrice,
              paid_amount: depositAmount,
              status: "PARTIAL_PAID",
              paid_at: nowIso,
              stripe_payment_intent_id: paymentIntentId,
              payment_method: "card",
              is_archived: false,
              is_demo: false,
            })
            .select("id")
            .single();

          invoiceId = newInvoice?.id ?? null;

          // 5. Create line item for the consultation service
          if (invoiceId && m.service_id) {
            await supabase.from("invoice_line_items").insert({
              invoice_id: invoiceId,
              name: m.service_name || m.treatment_name,
              quantity: 1,
              unit_price: fullPrice,
              total_price: fullPrice,
            });
          }

          // 6. Log transaction
          await supabase.from("stripe_transactions").upsert({
            stripe_payment_intent_id: paymentIntentId,
            stripe_session_id: session.id,
            invoice_id: invoiceId,
            patient_id: patientId,
            amount: depositAmount,
            currency: session.currency || "chf",
            status: "succeeded",
            metadata: { type: "booking_deposit", treatment: m.treatment_name, session_id: session.id },
          }, { onConflict: "stripe_payment_intent_id" });
        }

        console.log(`[Stripe Webhook] Booking deposit processed — ${m.first_name} ${m.last_name}, CHF ${depositAmount} deposit for ${m.treatment_name}`);

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
