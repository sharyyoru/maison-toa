import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { brandedEmail } from "@/utils/emailTemplate";

const CRON_SECRET = process.env.CRON_SECRET;

// Runs hourly via Vercel cron.
// Finds OPEN deposit invoices whose 48hr deadline has passed and whose
// appointment is still active — then cancels both and notifies the patient.
// Only affects invoices with: status=OPEN + appointment_id IS NOT NULL + deposit_deadline_at < now()
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const results = { cancelled: 0, errors: 0, skipped: 0 };

  try {
    // Fetch all OPEN deposit invoices past their deadline
    const { data: overdueInvoices, error: fetchErr } = await supabaseAdmin
      .from("invoices")
      .select(`
        id,
        invoice_number,
        patient_id,
        appointment_id,
        total_amount,
        title,
        deposit_deadline_at,
        payment_link_token
      `)
      .eq("status", "OPEN")
      .not("appointment_id", "is", null)
      .not("deposit_deadline_at", "is", null)
      .lt("deposit_deadline_at", now)
      .eq("is_demo", false)
      .limit(50);

    if (fetchErr) {
      console.error("[cancel-unpaid-deposits] fetch error:", fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return NextResponse.json({ message: "No overdue deposits found", ...results });
    }

    console.log(`[cancel-unpaid-deposits] Found ${overdueInvoices.length} overdue deposit(s)`);

    for (const invoice of overdueInvoices) {
      try {
        // Check appointment is still in a cancellable state
        const { data: appt } = await supabaseAdmin
          .from("appointments")
          .select("id, status, start_time, reason, title")
          .eq("id", invoice.appointment_id)
          .single();

        if (!appt || appt.status === "cancelled" || appt.status === "completed") {
          // Appointment already cancelled/done — just cancel the invoice
          await supabaseAdmin
            .from("invoices")
            .update({ status: "CANCELLED" })
            .eq("id", invoice.id);
          results.skipped++;
          continue;
        }

        // Cancel the appointment
        await supabaseAdmin
          .from("appointments")
          .update({ status: "cancelled" })
          .eq("id", invoice.appointment_id);

        // Cancel the invoice
        await supabaseAdmin
          .from("invoices")
          .update({ status: "CANCELLED" })
          .eq("id", invoice.id);

        // Fetch patient for notification email
        const { data: patient } = await supabaseAdmin
          .from("patients")
          .select("first_name, last_name, email")
          .eq("id", invoice.patient_id)
          .single();

        // Send cancellation email if patient has email
        if (patient?.email && isEmailConfigured()) {
          const apptDate = appt.start_time
            ? new Date(appt.start_time).toLocaleString("fr-CH", {
                weekday: "long", day: "numeric", month: "long",
                hour: "2-digit", minute: "2-digit",
                timeZone: "Europe/Zurich",
              })
            : "—";

          const html = brandedEmail(`
            <p style="margin:0 0 16px">Chère Madame / Cher Monsieur <strong>${patient.last_name}</strong>,</p>
            <p style="margin:0 0 16px">
              Votre rendez-vous du <strong>${apptDate}</strong> a été annulé automatiquement car le paiement de l'acompte n'a pas été reçu dans le délai imparti de 48 heures.
            </p>
            <p style="margin:0 0 16px">
              Si vous souhaitez reprendre rendez-vous, n'hésitez pas à nous contacter ou à réserver en ligne.
            </p>
            <p style="margin:0;font-size:12px;color:#94a3b8;">Facture réf. #${invoice.invoice_number}</p>
          `);

          await sendEmail({
            to: patient.email,
            subject: "Rendez-vous annulé – Acompte non reçu | Maison Tóā",
            html,
          });
        }

        console.log(`[cancel-unpaid-deposits] Cancelled invoice #${invoice.invoice_number} + appointment ${invoice.appointment_id}`);
        results.cancelled++;
      } catch (err: any) {
        console.error(`[cancel-unpaid-deposits] Error processing invoice ${invoice.id}:`, err);
        results.errors++;
      }
    }

    return NextResponse.json({
      message: "Done",
      ...results,
    });
  } catch (err: any) {
    console.error("[cancel-unpaid-deposits] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
