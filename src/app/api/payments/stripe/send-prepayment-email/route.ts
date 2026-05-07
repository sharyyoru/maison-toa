import { NextRequest, NextResponse } from "next/server";
import { brandedEmail, infoRow, infoTable, LOGO_URL } from "@/utils/emailTemplate";

const mailgunApiKey = process.env.MAILGUN_API_KEY;
const mailgunDomain = process.env.MAILGUN_DOMAIN;
const mailgunFromEmail = process.env.MAILGUN_FROM_EMAIL;
const mailgunFromName = process.env.MAILGUN_FROM_NAME || "Maison Toa";
const mailgunApiBaseUrl = process.env.MAILGUN_API_BASE_URL || "https://api.mailgun.net";

export async function POST(req: NextRequest) {
  const { patientEmail, patientFirstName, patientLastName, stripeUrl, invoiceNumber, serviceName, depositAmount } = await req.json();

  if (!patientEmail || !stripeUrl) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (!mailgunApiKey || !mailgunDomain) return NextResponse.json({ error: "Mailgun not configured" }, { status: 500 });

  const html = brandedEmail(`
    <p style="margin:0 0 16px">Chère Madame / Cher Monsieur <strong>${patientLastName}</strong>,</p>
    <p style="margin:0 0 16px">Veuillez trouver ci-dessous le lien de paiement pour votre acompte de consultation.</p>
    ${infoTable([
      infoRow("Facture", `#${invoiceNumber}`),
      infoRow("Service", serviceName || "Consultation"),
      infoRow("Acompte (50%)", `CHF ${Number(depositAmount).toFixed(2)}`),
    ].join(""))}
    <p style="margin:24px 0 8px;font-size:13px;color:#64748b;">
      Le montant de la consultation est déductible de tout traitement réalisé dans les 3 mois suivants.
    </p>
    <div style="text-align:center;margin:24px 0">
      <a href="${stripeUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 32px;border-radius:999px;font-size:14px;font-weight:600;">
        Payer l'acompte →
      </a>
    </div>
  `);

  const formData = new FormData();
  formData.append("from", `${mailgunFromName} <${mailgunFromEmail || `no-reply@${mailgunDomain}`}>`);
  formData.append("to", patientEmail);
  formData.append("subject", `Acompte de consultation – Maison Tóā`);
  formData.append("html", html);

  const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64");
  const res = await fetch(`${mailgunApiBaseUrl}/v3/${mailgunDomain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body: formData,
  });

  if (!res.ok) return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  return NextResponse.json({ sent: true });
}
