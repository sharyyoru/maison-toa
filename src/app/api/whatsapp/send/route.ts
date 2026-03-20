import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappFromEnv = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886" or "+14155238886"

if (!accountSid || !authToken || !whatsappFromEnv) {
  throw new Error(
    "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_FROM environment variables",
  );
}

const whatsappFrom = whatsappFromEnv as string;

function normalizeWhatsAppAddress(value: string): string {
  let v = value.trim();

  // Remove leading whatsapp: prefix if present
  if (v.toLowerCase().startsWith("whatsapp:")) {
    v = v.slice("whatsapp:".length);
  }

  // Strip spaces and common formatting, keep only digits and an optional leading +
  const cleaned = v.replace(/[^\d+]/g, "");
  if (!cleaned) return "";

  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;

  return `whatsapp:${withPlus}`;
}

export async function POST(request: Request) {
  try {
    const { patientId, to, toNumber, body, message, templateSid, templateVariables } =
      (await request.json()) as {
        patientId?: string | null;
        to?: string;
        toNumber?: string;
        body?: string;
        message?: string;
        templateSid?: string | null;
        templateVariables?: Record<string, string> | null;
      };

    const toRaw = (toNumber || to || "").trim();
    const messageBody = (message || body || "").trim();
    const template = (templateSid ?? "").trim() || null;
    const templateVars =
      templateVariables && typeof templateVariables === "object"
        ? templateVariables
        : null;

    if (!toRaw) {
      return NextResponse.json(
        { error: "Missing required field: to" },
        { status: 400 },
      );
    }

    if (!template && !messageBody) {
      return NextResponse.json(
        { error: "Missing message body for non-template WhatsApp send" },
        { status: 400 },
      );
    }

    const fromAddress = normalizeWhatsAppAddress(whatsappFrom);
    const toAddress = normalizeWhatsAppAddress(toRaw);

    const params = new URLSearchParams();
    params.append("From", fromAddress);
    params.append("To", toAddress);
    if (template) {
      params.append("ContentSid", template);
      if (templateVars && Object.keys(templateVars).length > 0) {
        params.append("ContentVariables", JSON.stringify(templateVars));
      }
    } else {
      params.append("Body", messageBody);
    }

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const twilioBody = (await twilioResponse.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!twilioResponse.ok) {
      console.error(
        "Error sending WhatsApp message via Twilio",
        twilioResponse.status,
        twilioBody,
      );
      return NextResponse.json(
        {
          error: "Failed to send WhatsApp message via Twilio",
          twilioStatus: twilioResponse.status,
          twilioBody,
        },
        { status: 502 },
      );
    }

    const sid = (twilioBody?.sid as string | undefined) ?? null;
    const dateCreatedRaw = twilioBody?.date_created as string | undefined;

    let sentAtIso: string | null = null;
    if (dateCreatedRaw) {
      const parsed = new Date(dateCreatedRaw);
      if (!Number.isNaN(parsed.getTime())) {
        sentAtIso = parsed.toISOString();
      }
    }
    if (!sentAtIso) {
      sentAtIso = new Date().toISOString();
    }

    const displayBody = messageBody || (template ? `WhatsApp template ${template}` : "");

    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({
        patient_id: patientId ?? null,
        to_number: toRaw,
        from_number: whatsappFrom,
        body: displayBody,
        status: "sent",
        direction: "outbound",
        message_sid: sid,
        sent_at: sentAtIso,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Failed to insert whatsapp_messages row", error);
      return NextResponse.json(
        { error: "Failed to store WhatsApp message" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, id: (data as any).id as string });
  } catch (error) {
    console.error("Unexpected error in /api/whatsapp/send", error);
    return NextResponse.json(
      { error: "Unexpected error sending WhatsApp message" },
      { status: 500 },
    );
  }
}
