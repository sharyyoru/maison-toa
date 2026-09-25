import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { brandedEmail, LOGO_URL } from "@/utils/emailTemplate";
import { sendEmail as sendEmailViaResend, isEmailConfigured } from "@/lib/email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PATIENT_SELF_SERVICE_CC_EMAIL = "info@maisontoa.com";
// EMAIL-011: the address previously had a trailing dot ("...com.") which made
// it invalid — the internal cancellation notifications were never delivered.
const ADMIN_NOTIFICATION_EMAIL = "louise.goerig@maisontoa.com";
const ADMIN_NOTIFICATION_CC = "info@maisontoa.com";

async function sendEmail(to: string, subject: string, html: string, cc?: string) {
  if (!isEmailConfigured()) return;
  
  const result = await sendEmailViaResend({ to, subject, html, cc });
  if (!result.success) {
    console.error("Error sending email via Resend:", result.error);
  }
}

function getSalutation(lastName: string, gender: string | null, language: string): string {
  const fr = language === "fr";
  if (gender === "female") return fr ? `Chère Madame ${lastName}` : `Dear Ms. ${lastName}`;
  if (gender === "male") return fr ? `Cher Monsieur ${lastName}` : `Dear Mr. ${lastName}`;
  return fr ? "Madame, Monsieur," : "Dear Sir or Madam,";
}

function generateCancellationEmail(
  lastName: string,
  gender: string | null,
  language: string
): string {
  const fr = language === "fr";
  const salutation = getSalutation(lastName, gender, language);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";

  const body = `
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #1a1a18;">${salutation}</p>
    <p style="margin: 0 0 12px 0; color: #4a4742;">
      ${fr ? "Votre rendez-vous a été annulé." : "Your appointment has been cancelled."}
    </p>
    <p style="margin: 0 0 24px 0; color: #4a4742;">
      ${fr
        ? "Nous restons à votre disposition pour convenir d'un nouveau créneau."
        : "We remain at your disposal to arrange a new appointment."
      }
    </p>
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 0 0 24px 0;">
      <tr>
        <td>
          <a href="${appUrl}/book-appointment"
             style="display: block; background-color: #1a1a18; color: #ffffff; text-decoration: none;
                    padding: 14px 24px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 500;">
            ${fr ? "Prendre un rendez-vous" : "Book an appointment"}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; color: #4a4742;">
      ${fr ? "Nous vous prions d'agréer nos salutations distinguées." : "Yours sincerely,"}
    </p>
    <p style="margin: 0 0 0 0; color: #1a1a18; font-weight: 500;">Maison Tóā</p>
    <img src="${LOGO_URL}" alt="Maison Tóā" width="80"
         style="display: block; width: 80px; height: auto; margin: 16px 0 0 0;">
  `;

  return brandedEmail(body);
}

function parseLangFromReason(reason: string | null): string {
  if (!reason) return "fr";
  const match = reason.match(/\[Lang:\s*(fr|en)\s*\]/i);
  return match ? match[1].toLowerCase() : "fr";
}

// EMAIL-011: find a paid online deposit linked to the cancelled appointment.
// Prefers the direct appointment_id link; falls back to matching by patient +
// appointment date for historical deposit invoices created without the link.
async function findPaidDepositForAppointment(
  appointmentId: string,
  patientId: string | null,
  startTime: string,
): Promise<{ amount: number; methodLabel: string | null } | null> {
  try {
    let invoice: { paid_amount: number | null; total_amount: number | null; payment_method: string | null; stripe_payment_intent_id: string | null } | null = null;

    const { data: linked } = await supabase
      .from("invoices")
      .select("paid_amount, total_amount, payment_method, stripe_payment_intent_id")
      .eq("appointment_id", appointmentId)
      .in("deposit_status", ["paid", "applied"])
      .limit(1)
      .maybeSingle();
    invoice = linked ?? null;

    if (!invoice && patientId) {
      const apptDateStr = new Date(startTime).toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });
      const { data: fallback } = await supabase
        .from("invoices")
        .select("paid_amount, total_amount, payment_method, stripe_payment_intent_id")
        .eq("patient_id", patientId)
        .is("appointment_id", null)
        .eq("payment_method", "online")
        .eq("treatment_date", apptDateStr)
        .in("deposit_status", ["paid", "applied"])
        .limit(1)
        .maybeSingle();
      invoice = fallback ?? null;
    }

    if (!invoice) return null;
    const amount = Number(invoice.paid_amount ?? invoice.total_amount ?? 0);
    if (!(amount > 0)) return null;

    // Best effort: resolve the actual payment method (e.g. "Stripe – Visa", "TWINT")
    let methodLabel: string | null = null;
    if (invoice.stripe_payment_intent_id) {
      methodLabel = "Stripe";
      try {
        const { stripe } = await import("@/lib/stripe");
        const intent = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id, {
          expand: ["payment_method"],
        });
        const pm = intent.payment_method as { type?: string; card?: { brand?: string } } | null;
        if (pm?.type === "twint") {
          methodLabel = "TWINT";
        } else if (pm?.type === "card" && pm.card?.brand) {
          const brand = pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1);
          methodLabel = `Stripe – ${brand}`;
        } else if (pm?.type) {
          methodLabel = `Stripe – ${pm.type}`;
        }
      } catch (stripeErr) {
        console.error("[cancel] Failed to resolve Stripe payment method:", stripeErr);
      }
    } else if (invoice.payment_method && invoice.payment_method !== "online") {
      methodLabel = invoice.payment_method;
    }

    return { amount, methodLabel };
  } catch (err) {
    console.error("[cancel] Failed to look up deposit:", err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Missing appointment id" }, { status: 400 });
    }

    // Fetch appointment with patient info
    const { data: appt, error: apptError } = await supabase
      .from("appointments")
      .select("id, start_time, status, reason, location, patient_id, provider_id")
      .eq("id", id)
      .single();

    if (apptError || !appt) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const language = parseLangFromReason(appt.reason ?? null);

    if (appt.status === "cancelled") {
      return NextResponse.json({ error: "Appointment is already cancelled" }, { status: 410 });
    }

    // Fetch patient info
    const { data: patient } = await supabase
      .from("patients")
      .select("first_name, last_name, email, phone, gender")
      .eq("id", appt.patient_id)
      .single();

    // Cancel the appointment
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status: "cancelled", cancellation_source: "patient" })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to cancel appointment" }, { status: 500 });
    }

    // Send cancellation email
    if (patient?.email) {
      try {
        const html = generateCancellationEmail(
          patient.last_name ?? "",
          patient.gender ?? null,
          language
        );
        const subject = language === "fr"
          ? "Annulation de votre rendez-vous"
          : "Appointment cancellation";
        await sendEmail(patient.email, subject, html, PATIENT_SELF_SERVICE_CC_EMAIL);
      } catch (err) {
        console.error("Failed to send cancellation email:", err);
      }
    }

    // Notify admin
    try {
      const patientName = patient
        ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim()
        : "Unknown patient";
      const apptDateStr = new Date(appt.start_time).toLocaleString("en-GB", {
        timeZone: "Europe/Zurich", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const service = (appt.reason ?? "")
        .replace(/\s*\[Doctor:[^\]]*\]/gi, "")
        .replace(/\s*\[Online Booking\]/gi, "")
        .replace(/\s*\[Lang:[^\]]*\]/gi, "")
        .replace(/\s*-\s*$/, "")
        .trim() || "-";

      // EMAIL-011: detect a paid online deposit for this appointment so the
      // team immediately knows a manual refund may be required.
      const depositInfo = await findPaidDepositForAppointment(
        appt.id,
        appt.patient_id,
        appt.start_time,
      );

      const subjectPrefix = depositInfo ? "❌💵 " : "";
      const depositRows = depositInfo
        ? `<tr><td><b>Email:</b></td><td>${patient?.email ?? "-"}</td></tr>
           <tr><td><b>Phone:</b></td><td>${patient?.phone ?? "-"}</td></tr>
           <tr><td><b>Patient Online Payment:</b></td><td><b>${depositInfo.amount.toFixed(2)} CHF${depositInfo.methodLabel ? ` via ${depositInfo.methodLabel}` : ""}</b></td></tr>`
        : "";
      const depositWarning = depositInfo
        ? `<p style="color:#b45309;"><b>⚠️ This patient paid a deposit before cancelling — a manual refund may be required.</b></p>`
        : "";

      await sendEmail(
        ADMIN_NOTIFICATION_EMAIL,
        `${subjectPrefix}[Cancellation] ${patientName} – ${service}`,
        `<p>A patient has <strong>cancelled</strong> their appointment.</p>
         <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
           <tr><td><b>Patient:</b></td><td>${patientName}</td></tr>
           <tr><td><b>Service:</b></td><td>${service}</td></tr>
           <tr><td><b>Date:</b></td><td>${apptDateStr}</td></tr>
           <tr><td><b>Location:</b></td><td>${appt.location ?? "-"}</td></tr>
           ${depositRows}
         </table>
         ${depositWarning}`,
        ADMIN_NOTIFICATION_CC
      );
    } catch (err) {
      console.error("Failed to send admin cancellation notification:", err);
    }

    return NextResponse.json({ ok: true, message: "Appointment cancelled" });
  } catch (err) {
    console.error("Cancel error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
