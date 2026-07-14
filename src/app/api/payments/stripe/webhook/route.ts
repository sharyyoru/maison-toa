import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { generatePatientConfirmationEmail } from "@/lib/appointmentEmails";
import { brandedEmail } from "@/utils/emailTemplate";
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

      if (type === "invoice_deposit" && invoice_id) {
        // Manual prepayment invoice — mark as PAID (invoice is for the deposit amount only)
        invoiceId = invoice_id;
        const paidAmount = (session.amount_total || 0) / 100;
        const fullPrice = parseFloat(session.metadata?.full_price || "0");
        const paymentIntentId = session.payment_intent as string;

        await supabase.from("invoices").update({
          status: "PAID",
          deposit_status: "paid",
          paid_amount: paidAmount,
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: paymentIntentId,
          stripe_session_id: null,
          stripe_session_expires_at: null,
        }).eq("id", invoice_id);

        const { data: inv } = await supabase.from("invoices").select("patient_id").eq("id", invoice_id).single();
        await supabase.from("stripe_transactions").upsert({
          stripe_payment_intent_id: paymentIntentId,
          stripe_session_id: session.id,
          invoice_id,
          patient_id: inv?.patient_id || null,
          amount: paidAmount,
          currency: session.currency || "chf",
          status: "succeeded",
          metadata: { type: "invoice_deposit", full_price: fullPrice },
        }, { onConflict: "stripe_payment_intent_id" });

        console.log(`[Stripe Webhook] Invoice deposit ${invoice_id} marked PAID — CHF ${paidAmount}`);

        // Send deposit-payment confirmation email to the patient
        try {
          const { data: inv } = await supabase
            .from("invoices")
            .select("patient_id, appointment_id, title")
            .eq("id", invoice_id)
            .single();

          if (inv?.patient_id && inv?.appointment_id) {
            const { data: patient } = await supabase
              .from("patients")
              .select("first_name, last_name, email, gender, language_preference")
              .eq("id", inv.patient_id)
              .single();

            const { data: appt } = await supabase
              .from("appointments")
              .select("start_time, end_time, reason, location")
              .eq("id", inv.appointment_id)
              .single();

            if (patient?.email && appt?.start_time) {
              const language = patient.language_preference === "fr" ? "fr" : "en";
              const doctorMatch = (appt.reason || "").match(/\[Doctor:\s*(.+?)\s*\]/i);
              const doctorName = doctorMatch?.[1] || "Maison Tóā";
              const serviceName = (appt.reason || "").split(" [Doctor:")[0].trim() || inv.title || "Consultation";
              const appointmentDate = new Date(appt.start_time);

              const html = generatePatientConfirmationEmail(
                patient.last_name || "",
                patient.gender || undefined,
                doctorName,
                appointmentDate,
                serviceName,
                appt.location || null,
                language,
                inv.appointment_id
              );

              await sendEmail({
                to: patient.email,
                subject: language === "fr"
                  ? "Acompte reçu – Votre rendez-vous est confirmé | Maison Tóā"
                  : "Deposit received – Your appointment is confirmed | Maison Tóā",
                html,
              });
              console.log(`[Stripe Webhook] Confirmation email sent to ${patient.email}`);
            }
          }
        } catch (emailErr) {
          console.error("[Stripe Webhook] Failed to send confirmation email:", emailErr);
        }

      } else if (type === "invoice" && invoice_id) {
        invoiceId = invoice_id;
        const paidAmount = (session.amount_total || 0) / 100;
        const paymentIntentId = session.payment_intent as string;
        const isDepositInvoice = !!session.metadata?.payment_token;

        // Mark invoice paid. If it was accessed via a payment_link_token (the
        // "Acompte 50%" flow), also sync deposit_status so the cockpit widget
        // reflects the paid state. The old invoice_deposit branch handled this
        // for a separate flow, but create-session uses type="invoice".
        await supabase
          .from("invoices")
          .update({
            status: "PAID",
            paid_amount: paidAmount,
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentIntentId,
            stripe_session_id: null,
            stripe_session_expires_at: null,
            ...(isDepositInvoice ? { deposit_status: "paid" } : {}),
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
          // Use the same DB function as manual invoices to avoid text-sort collision
          const { data: seqRow } = await supabase.rpc("generate_invoice_number");
          const nextNumber = String(seqRow ?? Date.now());

          const nowIso = new Date().toISOString();
          // Always use the treatment name (stored in Stripe metadata at session creation
          // time) for both the invoice title and the line-item description.
          // Many treatments share a single generic "Acompte consultation" service in the
          // DB, so m.service_name is unreliable and can show the wrong treatment.
          // m.treatment_name is set directly from the booking form's selected treatment.
          const displayName = m.treatment_name || m.service_label || m.service_name || "Traitement";
          const title = `Acompte 50% – ${displayName}`;

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
              subtotal: depositAmount,
              total_amount: depositAmount,
              paid_amount: depositAmount,
              status: "PAID",
              paid_at: nowIso,
              stripe_payment_intent_id: paymentIntentId,
              payment_method: "online",
              // Store the exact service name the patient selected on the booking
              // platform so it's visible in the CRM and on the invoice.
              notes: `Service réservé en ligne: ${displayName}`,
              is_archived: false,
              is_demo: false,
            })
            .select("id")
            .single();

          invoiceId = newInvoice?.id ?? null;

          // 5. Create line item for the deposit amount actually paid.
          // Use the treatment name (never the linked service name) so the invoice
          // always shows the correct treatment the patient booked.
          if (invoiceId) {
            await supabase.from("invoice_line_items").insert({
              invoice_id: invoiceId,
              name: displayName,
              quantity: 1,
              unit_price: depositAmount,
              total_price: depositAmount,
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
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const { type } = session.metadata || {};

      if (type === "booking_deposit") {
        const m = session.metadata || {};
        const email = m.email;
        const language = m.language === "en" ? "en" : "fr";
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";
        const rescheduleUrl = `${appUrl}/book-appointment`;

        if (email && isEmailConfigured()) {
          // If the patient rebooked and successfully paid for the same slot, skip the cancellation email.
          let rebooked = false;
          try {
            const appointmentDate = m.appointment_date ? new Date(m.appointment_date) : null;
            if (appointmentDate && !isNaN(appointmentDate.getTime())) {
              const windowStart = new Date(appointmentDate.getTime() - 60 * 1000).toISOString();
              const windowEnd = new Date(appointmentDate.getTime() + 60 * 1000).toISOString();

              const { data: patientRows } = await supabase
                .from("patients")
                .select("id")
                .ilike("email", email)
                .limit(1);
              const patientId = patientRows?.[0]?.id;

              if (patientId) {
                const { data: recentAppointments } = await supabase
                  .from("appointments")
                  .select("id")
                  .eq("patient_id", patientId)
                  .gte("start_time", windowStart)
                  .lte("start_time", windowEnd)
                  .neq("status", "cancelled")
                  .limit(1);
                if (recentAppointments && recentAppointments.length > 0) {
                  rebooked = true;
                  console.log(`[Stripe Webhook] Skipping expired booking-deposit email: patient ${email} already has a confirmed appointment for the same slot.`);
                }
              }
            }
          } catch (checkErr) {
            console.error("[Stripe Webhook] Error checking for rebooking:", checkErr);
          }

          if (!rebooked) try {
            const html = brandedEmail(`
              <p style="margin:0 0 16px">${language === "fr" ? "Chère Madame / Cher Monsieur" : "Dear Sir / Madam"} <strong>${m.last_name || ""}</strong>,</p>
              <p style="margin:0 0 16px">
                ${language === "fr"
                  ? "Votre rendez-vous n'a pas été confirmé car nous n'avons pas reçu l'acompte dans le délai imparti."
                  : "Your appointment was not confirmed because we did not receive the deposit within the required time."}
              </p>
              <p style="margin:0 0 24px">
                ${language === "fr"
                  ? "Si vous souhaitez reprendre rendez-vous, n'hésitez pas à réserver en ligne."
                  : "If you would like to reschedule, please book a new appointment online."}
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background-color:#1a1a18; border-radius:6px; text-align:center;">
                    <a href="${rescheduleUrl}" style="display:inline-block; padding:14px 28px; color:#ffffff; font-size:15px; text-decoration:none; font-weight:500;">
                      ${language === "fr" ? "Reprendre rendez-vous" : "Reschedule"}
                    </a>
                  </td>
                </tr>
              </table>
            `);

            await sendEmail({
              to: email,
              subject: language === "fr"
                ? "Rendez-vous non confirmé | Maison Tóā"
                : "Appointment not confirmed | Maison Tóā",
              html,
            });
            console.log(`[Stripe Webhook] Expired booking-deposit email sent to ${email}`);
          } catch (emailErr) {
            console.error("[Stripe Webhook] Failed to send expired booking-deposit email:", emailErr);
          }
        }
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
