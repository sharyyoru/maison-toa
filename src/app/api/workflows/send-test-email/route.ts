import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SendTestEmailRequestBody = {
  to?: string;
  subjectTemplate?: string;
  bodyTemplate?: string | null;
  bodyHtmlTemplate?: string | null;
  useHtml?: boolean;
};

function resolvePath(object: unknown, path: string): unknown {
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);

  return parts.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    if (!(key in (current as Record<string, unknown>))) return undefined;
    return (current as Record<string, unknown>)[key];
  }, object);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#123;/g, "{")
    .replace(/&#125;/g, "}")
    .replace(/&lbrace;/g, "{")
    .replace(/&rbrace;/g, "}")
    .replace(/&#x7b;/gi, "{")
    .replace(/&#x7d;/gi, "}");
}

function renderTemplate(template: string, context: unknown): string {
  if (!template) return "";

  // First decode any HTML-encoded curly braces (from Unlayer or other editors)
  const decoded = decodeHtmlEntities(template);

  return decoded.replace(/{{\s*([^}]+?)\s*}}/g, (_match, rawPath) => {
    const value = resolvePath(context, String(rawPath));
    if (value === undefined || value === null) return "";
    return String(value);
  });
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

function sanitizeTelLinks(html: string): string {
  // First, decode any URL-encoded tel: protocols (tel%3A -> tel:)
  let result = html.replace(/href\s*=\s*(["'])tel%3A/gi, 'href=$1tel:');
  
  // Also handle %2B (URL-encoded +) at the start of phone numbers
  result = result.replace(/href\s*=\s*(["'])tel:%2B/gi, 'href=$1tel:+');
  
  // Now handle all tel: links and clean the phone numbers for iPhone compatibility
  result = result.replace(
    /href\s*=\s*["']tel:([^"']+)["']/gi,
    (_match, phoneNumber) => {
      // Decode any remaining URL encoding in the phone number
      let decoded = phoneNumber;
      try {
        decoded = decodeURIComponent(phoneNumber);
      } catch {
        // If decoding fails, use original
      }
      // Remove HTML entities first
      decoded = decoded
        .replace(/&nbsp;/gi, '')  // HTML nbsp entity
        .replace(/&#160;/g, '')   // Numeric nbsp entity
        .replace(/&amp;/gi, '&')  // Ampersand entity
        .replace(/&plus;/gi, '+') // Plus entity
        .replace(/\u00A0/g, '');  // Unicode nbsp
      
      // CRITICAL FOR iPHONE: Keep ONLY digits and leading + sign
      // Remove everything else (letters, spaces, dashes, dots, parens, etc.)
      const cleaned = decoded.replace(/[^0-9+]/g, '');
      
      return `href="tel:${cleaned}"`;
    }
  );
  
  return result;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendTestEmailRequestBody;
    const to = (body.to || "").trim();
    const subjectTemplate =
      (body.subjectTemplate || "Workflow test email from your clinic").trim();
    const bodyTemplate =
      body.bodyTemplate ??
      [
        "Hi {{patient.first_name}}",
        "",
        "This is a test email generated from your workflow template.",
        "",
        "Deal: {{deal.title}}",
        "Pipeline: {{deal.pipeline}}",
        "",
        "Best regards,",
        "Your clinic team",
      ].join("\n");
    const bodyHtmlTemplate = body.bodyHtmlTemplate ?? null;
    const useHtml = Boolean(body.useHtml);

    if (!to) {
      return NextResponse.json({ error: "to is required" }, { status: 400 });
    }

    const templateContext = {
      patient: {
        id: "test-patient-id",
        first_name: "Test",
        last_name: "Patient",
        email: to,
        phone: "+41000000000",
      },
      deal: {
        id: "test-deal-id",
        title: "Sample procedure",
        pipeline: "Test pipeline",
        notes: "Sample notes for test email.",
      },
      from_stage: {
        id: "from-stage-id",
        name: "Request for information",
        type: "lead",
      },
      to_stage: {
        id: "to-stage-id",
        name: "Appointment set",
        type: "consultation",
      },
    };

    const subject = renderTemplate(subjectTemplate, templateContext);

    let html: string;
    if (useHtml && bodyHtmlTemplate && bodyHtmlTemplate.trim().length > 0) {
      const rendered = renderTemplate(bodyHtmlTemplate, templateContext);
      html = rendered.trim().length > 0 ? rendered : "<p>(Empty HTML body)</p>";
    } else {
      const renderedText = renderTemplate(bodyTemplate, templateContext);
      html = textToHtml(renderedText || "(Empty body)");
    }

    html = sanitizeTelLinks(html);

    const sendUrl = new URL("/api/emails/send", request.url);

    const response = await fetch(sendUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        subject,
        html,
        fromUserEmail: null,
        emailId: null,
      }),
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.error ||
            "Failed to send test email via provider. Check MAILGUN configuration.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in /api/workflows/send-test-email", error);
    return NextResponse.json(
      { error: "Failed to send test email" },
      { status: 500 },
    );
  }
}
