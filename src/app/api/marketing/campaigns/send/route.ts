import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  fetchAudience,
  substitutePatientVariables,
  type MarketingFilter,
  type PatientRow,
  MAX_CAMPAIGN_RECIPIENTS,
} from "@/lib/marketingFilters";
import { sendEmail as sendEmailViaResend, isEmailConfigured, addTrackingPixel } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 300;

type SendRequestBody = {
  campaignName?: string;
  templateId?: string;
  subject?: string;              // overrides template subject if provided
  filter?: MarketingFilter;
  listId?: string | null;
  testEmail?: string | null;     // when set, only send a single test to this address
  userId?: string | null;
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maisontoa.vercel.app";

// Marketing emails ALWAYS come from the clinic's branded address for
// deliverability (DKIM/SPF alignment) and consistent branding.
const MARKETING_FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || "info@mail.maisontoa.com";
const MARKETING_FROM_NAME = process.env.EMAIL_FROM_NAME || "Maison Toa";

type ResendSendArgs = {
  to: string;
  subject: string;
  html: string;
  emailIdForTracking?: string | null;
};

async function sendViaResend(args: ResendSendArgs): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "Resend not configured (missing RESEND_API_KEY)" };
  }

  let html = args.html;
  if (args.emailIdForTracking) {
    html = addTrackingPixel(html, args.emailIdForTracking, appUrl);
  }

  try {
    const result = await sendEmailViaResend({
      to: args.to,
      subject: args.subject,
      html,
      from: MARKETING_FROM_EMAIL,
      fromName: MARKETING_FROM_NAME,
      tags: [
        ...(args.emailIdForTracking ? [{ name: "email_id", value: args.emailIdForTracking }] : []),
        { name: "source", value: "marketing_campaign" },
      ],
    });

    if (!result.success) {
      console.error("[marketing/send] Resend rejected send", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error || "Resend send failed" };
    }

    console.log("[marketing/send] Resend accepted", { to: args.to, messageId: result.messageId });
    return { ok: true, messageId: result.messageId };
  } catch (err) {
    console.error("[marketing/send] Resend fetch threw", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function loadTemplate(templateId: string): Promise<{ subject: string; html: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("email_templates")
    .select("subject_template, html_content, body_template")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) return null;
  const html = (data.html_content as string | null) || (data.body_template as string | null) || "";
  return {
    subject: (data.subject_template as string) || "",
    html,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendRequestBody;
    if (!body.templateId) {
      return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    }
    if (!body.filter && !body.listId) {
      return NextResponse.json({ error: "filter or listId is required" }, { status: 400 });
    }

    const template = await loadTemplate(body.templateId);
    if (!template || (!template.html && !template.subject)) {
      return NextResponse.json({ error: "Template not found or empty" }, { status: 404 });
    }

    // Resolve filter (prefer saved list when provided)
    let filter: MarketingFilter = body.filter ?? {};
    if (body.listId) {
      const { data: list } = await supabaseAdmin
        .from("marketing_lists")
        .select("filter")
        .eq("id", body.listId)
        .maybeSingle();
      if (list?.filter) {
        filter = list.filter as MarketingFilter;
      }
    }

    const subjectToUse = (body.subject && body.subject.trim()) || template.subject;

    // ----- TEST MODE: send a single rendered preview to testEmail -----
    if (body.testEmail && body.testEmail.trim()) {
      const { rows: sample } = await fetchAudience(supabaseAdmin, filter, { limit: 1 });
      const samplePatient: PatientRow =
        sample[0] ?? {
          id: "test",
          first_name: "Test",
          last_name: "Recipient",
          email: body.testEmail,
          phone: null,
          dob: null,
          source: null,
          contact_owner_name: null,
          created_at: null,
        };

      const subject = substitutePatientVariables(subjectToUse, samplePatient);
      const html = substitutePatientVariables(template.html, samplePatient);
      console.log("[marketing/send] Test send", {
        to: body.testEmail.trim(),
        subject: `[TEST] ${subject}`,
        samplePatient: samplePatient.id,
      });
      const result = await sendViaResend({
        to: body.testEmail.trim(),
        subject: `[TEST] ${subject}`,
        html,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error || "Test send failed" }, { status: 502 });
      }
      return NextResponse.json({ ok: true, test: true, messageId: result.messageId });
    }

    // ----- REAL CAMPAIGN: fan out to all recipients -----
    const { rows: recipients } = await fetchAudience(supabaseAdmin, filter, {
      limit: MAX_CAMPAIGN_RECIPIENTS,
    });
    console.log("[marketing/send] Campaign start", {
      campaignName: body.campaignName,
      templateId: body.templateId,
      subject: subjectToUse,
      recipientCount: recipients.length,
      sampleEmails: recipients.slice(0, 3).map((r) => r.email),
    });
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No recipients match this filter" },
        { status: 400 },
      );
    }

    // Create campaign header
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("marketing_campaigns")
      .insert({
        name: (body.campaignName || `Campaign ${new Date().toISOString().slice(0, 10)}`).trim(),
        list_id: body.listId ?? null,
        filter_snapshot: filter,
        template_id: body.templateId,
        subject: subjectToUse,
        html_snapshot: template.html,
        status: "sending",
        total_recipients: recipients.length,
        created_by: body.userId ?? null,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: `Failed to create campaign: ${campaignError?.message ?? "unknown"}` },
        { status: 500 },
      );
    }

    // Insert all recipient rows up front (pending)
    const recipientRows = recipients.map((r) => ({
      campaign_id: campaign.id,
      patient_id: r.id,
      email: (r.email ?? "").trim(),
      status: r.email ? "pending" : "skipped",
    }));
    // Chunk inserts to stay within Supabase row limits
    for (let i = 0; i < recipientRows.length; i += 500) {
      const slice = recipientRows.slice(i, i + 500);
      await supabaseAdmin.from("marketing_campaign_recipients").insert(slice);
    }

    // Send in batches with a small delay between batches
    const BATCH_SIZE = 20;
    const BATCH_DELAY_MS = 300;
    let sent = 0;
    let failed = 0;
    let firstError: string | null = null;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (patient) => {
          if (!patient.email) {
            failed += 1;
            return;
          }

          // Create an email record in CRM for tracking (best-effort)
          let emailId: string | null = null;
          try {
            const { data: emailRow, error: emailErr } = await supabaseAdmin
              .from("emails")
              .insert({
                patient_id: patient.id,
                to_address: patient.email,
                from_address: MARKETING_FROM_EMAIL,
                subject: substitutePatientVariables(subjectToUse, patient),
                body: substitutePatientVariables(template.html, patient),
                direction: "outbound",
                status: "sending",
              })
              .select("id")
              .single();
            if (emailErr) {
              console.warn("[marketing/send] emails row insert failed", {
                patientId: patient.id,
                error: emailErr.message,
              });
            }
            emailId = emailRow?.id ?? null;
          } catch (err) {
            console.warn("[marketing/send] emails row insert threw", err);
          }

          const result = await sendViaResend({
            to: patient.email,
            subject: substitutePatientVariables(subjectToUse, patient),
            html: substitutePatientVariables(template.html, patient),
            emailIdForTracking: emailId,
          });

          const now = new Date().toISOString();
          if (result.ok) {
            sent += 1;
            if (emailId) {
              await supabaseAdmin
                .from("emails")
                .update({ status: "sent", sent_at: now })
                .eq("id", emailId);
            }
            await supabaseAdmin
              .from("marketing_campaign_recipients")
              .update({
                status: "sent",
                sent_at: now,
                email_id: emailId,
              })
              .eq("campaign_id", campaign.id)
              .eq("patient_id", patient.id);
          } else {
            failed += 1;
            if (!firstError) firstError = result.error ?? "Unknown error";
            console.error("[marketing/send] recipient failed", {
              to: patient.email,
              error: result.error,
            });
            if (emailId) {
              await supabaseAdmin
                .from("emails")
                .update({ status: "failed" })
                .eq("id", emailId);
            }
            await supabaseAdmin
              .from("marketing_campaign_recipients")
              .update({
                status: "failed",
                error: result.error ?? "Unknown error",
                email_id: emailId,
              })
              .eq("campaign_id", campaign.id)
              .eq("patient_id", patient.id);
          }
        }),
      );

      // Update running totals on the campaign
      await supabaseAdmin
        .from("marketing_campaigns")
        .update({ total_sent: sent, total_failed: failed })
        .eq("id", campaign.id);

      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    // Finalise status
    const finalStatus = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
    await supabaseAdmin
      .from("marketing_campaigns")
      .update({
        status: finalStatus,
        total_sent: sent,
        total_failed: failed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    console.log("[marketing/send] Campaign complete", {
      campaignId: campaign.id,
      totalRecipients: recipients.length,
      sent,
      failed,
      status: finalStatus,
      firstError,
    });

    return NextResponse.json({
      ok: true,
      campaignId: campaign.id,
      totalRecipients: recipients.length,
      sent,
      failed,
      status: finalStatus,
      firstError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/marketing/campaigns/send] Error:", error);
    return NextResponse.json(
      { error: `Campaign send failed: ${message}` },
      { status: 500 },
    );
  }
}
