import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail as sendEmailViaResend, isEmailConfigured } from "@/lib/email";
import { generatePatientReminderEmail } from "@/lib/appointmentEmails";
import { normalizePatientLanguage } from "@/lib/languagePreference";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.log("Resend not configured, skipping email send");
    return false;
  }

  try {
    const result = await sendEmailViaResend({
      to,
      subject,
      html,
    });

    if (!result.success) {
      console.error("Error sending email via Resend:", result.error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Error sending email:", err);
    return false;
  }
}

export async function GET(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all pending scheduled emails that are due (scheduled_for <= now)
    const now = new Date().toISOString();
    const { data: pendingEmails, error: fetchError } = await supabase
      .from("scheduled_emails")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .limit(50); // Process in batches

    if (fetchError) {
      console.error("Error fetching scheduled emails:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch scheduled emails", details: fetchError.message },
        { status: 500 }
      );
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return NextResponse.json({ message: "No pending emails to send", sent: 0 });
    }

    console.log(`Processing ${pendingEmails.length} scheduled emails`);

    let sentCount = 0;
    let failedCount = 0;

    // Process emails in parallel (batch of 10 at a time)
    const batchSize = 10;
    for (let i = 0; i < pendingEmails.length; i += batchSize) {
      const batch = pendingEmails.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (email) => {
          let subject = email.subject;
          let body = email.body;

          // Appointment reminder content is intentionally rebuilt at send time.
          // This is the final guard against stale queued content after a calendar
          // edit, and it also prevents reminders for cancelled/deleted visits.
          if (email.appointment_id && /rappel de votre rendez-vous|appointment reminder/i.test(email.subject || "")) {
            const { data: appointment, error: appointmentError } = await supabase
              .from("appointments")
              .select("id, patient_id, start_time, status, reason, tracking_params")
              .eq("id", email.appointment_id)
              .maybeSingle();

            if (appointmentError) {
              throw new Error(`Failed to validate appointment ${email.appointment_id}: ${appointmentError.message}`);
            }

            const displayStatus = typeof appointment?.reason === "string"
              ? appointment.reason.match(/\[Status:\s*([^\]]+)\]/i)?.[1]?.trim().toLowerCase()
              : "";
            const isCancelled =
              !appointment ||
              ["cancelled", "no_show"].includes(String(appointment.status || "").toLowerCase()) ||
              !!displayStatus?.match(/cancel|annul|no[ _-]?show/);

            if (isCancelled) {
              await supabase.from("scheduled_emails").delete().eq("id", email.id);
              return "skipped" as const;
            }

            const { data: patient } = await supabase
              .from("patients")
              .select("last_name, gender, language_preference")
              .eq("id", appointment.patient_id)
              .maybeSingle();
            const trackingParams = (appointment.tracking_params || {}) as Record<string, unknown>;
            const currentStart = new Date(
              typeof trackingParams.patient_appointment_start === "string"
                ? trackingParams.patient_appointment_start
                : appointment.start_time,
            );
            if (Number.isNaN(currentStart.getTime())) {
              await supabase.from("scheduled_emails").update({ status: "failed", error: "Invalid appointment start time" }).eq("id", email.id);
              return false;
            }

            const language = normalizePatientLanguage(patient?.language_preference, "en");
            subject = language === "fr" ? "Rappel de votre rendez-vous" : "Appointment reminder";
            body = generatePatientReminderEmail(
              patient?.last_name || "",
              patient?.gender || undefined,
              currentStart,
              appointment.reason || "",
              language,
              appointment.id,
            );
          }

          const success = await sendEmail(
            email.recipient_email,
            subject,
            body
          );

          // Update status in scheduled_emails
          const sentAt = new Date().toISOString();
          const newStatus = success ? "sent" : "failed";
          await supabase
            .from("scheduled_emails")
            .update({
              status: newStatus,
              sent_at: success ? sentAt : null,
              error: success ? null : "Failed to send via Resend",
            })
            .eq("id", email.id);

          // Log to emails table so it appears in /email-reports
          if (success) {
            await supabase.from("emails").insert({
              patient_id: email.patient_id ?? null,
              to_address: email.recipient_email,
              from_address: process.env.EMAIL_FROM_ADDRESS ?? "info@mail.maisontoa.com",
              subject,
              body,
              status: "sent",
              direction: "outbound",
              sent_at: sentAt,
              is_demo: false,
            });
          }

          return success;
        })
      );

      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value === "skipped") return;
        if (result.status === "fulfilled" && result.value) {
          sentCount++;
        } else {
          failedCount++;
        }
      });
    }

    console.log(`Scheduled emails processed: ${sentCount} sent, ${failedCount} failed`);

    return NextResponse.json({
      message: "Scheduled emails processed",
      sent: sentCount,
      failed: failedCount,
      total: pendingEmails.length,
    });
  } catch (error) {
    console.error("Error in cron job:", error);
    return NextResponse.json(
      { error: "Cron job failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility with different cron providers
export async function POST(request: Request) {
  return GET(request);
}
