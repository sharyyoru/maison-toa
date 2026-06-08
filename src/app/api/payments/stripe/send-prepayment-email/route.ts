import { NextRequest, NextResponse } from "next/server";
import { brandedEmail, infoRow, infoTable, LOGO_URL } from "@/utils/emailTemplate";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const { patientEmail, patientFirstName, patientLastName, stripeUrl, invoiceNumber, serviceName, depositAmount, invoiceId } = await req.json();

  if (!patientEmail || !stripeUrl) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (!isEmailConfigured()) return NextResponse.json({ error: "Email service not configured" }, { status: 500 });

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

  const result = await sendEmail({
    to: patientEmail,
    subject: `Acompte de consultation – Maison Tóā`,
    html,
  });

  if (!result.success) return NextResponse.json({ error: "Failed to send email" }, { status: 500 });

  // Set deposit_deadline_at = now() + 48h if conditions are met (only for linked-appointment deposits)
  if (invoiceId) {
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("status, appointment_id, deposit_deadline_at")
      .eq("id", invoiceId)
      .single();

    if (inv?.status === "OPEN" && inv?.appointment_id && !inv?.deposit_deadline_at) {
      const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin
        .from("invoices")
        .update({ deposit_deadline_at: deadline })
        .eq("id", invoiceId)
        .is("deposit_deadline_at", null);
    }
  }

  return NextResponse.json({ sent: true });
}
