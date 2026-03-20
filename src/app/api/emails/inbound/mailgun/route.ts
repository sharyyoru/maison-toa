import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function extractFirstEmail(input: string | null): string | null {
  if (!input) return null;
  const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\r?\n/g)
    .map((line) => (line.length === 0 ? "<br />" : line))
    .join("<br />");
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let recipient: string | null = null;
    let sender: string | null = null;
    let subject: string | null = null;
    let bodyHtml: string | null = null;
    let bodyText: string | null = null;
    let timestamp: string | null = null;

    if (contentType.includes("application/json")) {
      const json = (await request.json()) as Record<string, unknown>;
      recipient = (json["recipient"] as string) ?? null;
      sender = (json["sender"] as string) ?? null;
      subject = (json["subject"] as string) ?? null;
      bodyHtml =
        (json["stripped-html"] as string | undefined) ??
        (json["body-html"] as string | undefined) ??
        null;
      bodyText =
        (json["stripped-text"] as string | undefined) ??
        (json["body-plain"] as string | undefined) ??
        null;
      timestamp = (json["timestamp"] as string | undefined) ?? null;
    } else {
      const form = await request.formData();
      recipient = (form.get("recipient") as string) ?? null;
      sender = (form.get("sender") as string) ?? null;
      subject = (form.get("subject") as string) ?? null;
      bodyHtml =
        ((form.get("stripped-html") as string) ||
          (form.get("body-html") as string)) ?? null;
      bodyText =
        ((form.get("stripped-text") as string) ||
          (form.get("body-plain") as string)) ?? null;
      timestamp = (form.get("timestamp") as string) ?? null;
    }

    const recipientEmail = extractFirstEmail(recipient);
    let originalEmailId: string | null = null;

    if (recipientEmail) {
      const localPart = recipientEmail.split("@")[0];
      if (localPart.startsWith("reply+")) {
        originalEmailId = localPart.slice("reply+".length) || null;
      }
    }

    let patientId: string | null = null;
    let dealId: string | null = null;

    let originalSenderId: string | null = null;

    if (originalEmailId) {
      const { data: original, error: originalError } = await supabaseAdmin
        .from("emails")
        .select("id, patient_id, deal_id, sent_by_user_id")
        .eq("id", originalEmailId)
        .single();

      if (!originalError && original) {
        patientId = (original as any).patient_id ?? null;
        dealId = (original as any).deal_id ?? null;
        originalSenderId = (original as any).sent_by_user_id ?? null;
      }
    }

    const finalBodyHtml =
      bodyHtml && bodyHtml.trim().length > 0
        ? bodyHtml
        : bodyText && bodyText.trim().length > 0
          ? textToHtml(bodyText)
          : "<p>(no content)</p>";

    let sentAtIso: string | null = null;
    if (timestamp && !Number.isNaN(Number(timestamp))) {
      const tsMillis = Number(timestamp) * 1000;
      if (Number.isFinite(tsMillis)) {
        sentAtIso = new Date(tsMillis).toISOString();
      }
    }
    if (!sentAtIso) {
      sentAtIso = new Date().toISOString();
    }

    const inboundSubject = subject && subject.trim().length > 0 ? subject : "(no subject)";

    // Extract sender email address
    const senderEmail = extractFirstEmail(sender);
    
    // IMPORTANT: Check if sender is a clinic user - if so, this is a CC'd copy of an outbound email
    // We should NOT log this as an inbound email (it would create a duplicate)
    if (senderEmail) {
      const { data: senderIsClinicUser } = await supabaseAdmin
        .from("users")
        .select("id")
        .ilike("email", senderEmail)
        .maybeSingle();
      
      if (senderIsClinicUser) {
        console.log("Skipping CC'd copy - sender is a clinic user:", senderEmail);
        return NextResponse.json({ 
          ok: true, 
          message: "Skipped CC copy from clinic user",
          reason: "sender_is_clinic_user"
        });
      }
    }

    const insertPayload: Record<string, unknown> = {
      patient_id: patientId,
      deal_id: dealId,
      to_address: recipientEmail ?? recipient ?? "",
      from_address: sender ?? null,
      subject: inboundSubject,
      body: finalBodyHtml,
      status: "sent",
      direction: "inbound",
      sent_at: sentAtIso,
    };

    const { data, error } = await supabaseAdmin
      .from("emails")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error || !data) {
      console.error("Failed to insert inbound email", error);
      return NextResponse.json({ error: "Failed to store inbound email" }, { status: 500 });
    }

    const replyEmailId = (data as { id: string }).id;

    // Create email reply notification for the original sender
    if (originalSenderId && originalEmailId && patientId) {
      try {
        await supabaseAdmin
          .from("email_reply_notifications")
          .insert({
            user_id: originalSenderId,
            patient_id: patientId,
            original_email_id: originalEmailId,
            reply_email_id: replyEmailId,
            read_at: null,
          });
      } catch (notifError) {
        console.error("Failed to create email reply notification", notifError);
        // Don't fail the request if notification creation fails
      }
    }

    return NextResponse.json({ ok: true, emailId: replyEmailId });
  } catch (error) {
    console.error("Error handling inbound Mailgun email", error);
    return NextResponse.json({ error: "Failed to process inbound email" }, { status: 500 });
  }
}
