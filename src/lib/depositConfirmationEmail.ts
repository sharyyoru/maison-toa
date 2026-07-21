import { brandedEmail, infoRow, infoTable } from "@/utils/emailTemplate";

type DepositConfirmationEmailInput = {
  patientName: string;
  amount: number;
  paidAt: Date;
  paymentMethod: string;
  language: "en" | "fr";
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPaymentDate(date: Date, language: "en" | "fr"): string {
  return date.toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Zurich",
  });
}

export function formatDepositPaymentMethod(type: string | null | undefined, language: "en" | "fr"): string {
  const normalized = type?.toLowerCase() ?? "";
  const labels = language === "fr"
    ? { card: "Carte bancaire", twint: "TWINT", sepa_debit: "Prélèvement bancaire", paypal: "PayPal", online: "Paiement en ligne" }
    : { card: "Bank card", twint: "TWINT", sepa_debit: "Bank debit", paypal: "PayPal", online: "Online payment" };

  return labels[normalized as keyof typeof labels] ?? labels.online;
}

export function generateDepositConfirmationEmail({
  patientName,
  amount,
  paidAt,
  paymentMethod,
  language,
}: DepositConfirmationEmailInput): { subject: string; html: string } {
  const isFrench = language === "fr";
  const name = escapeHtml(patientName.trim() || (isFrench ? "Madame, Monsieur" : "Sir or Madam"));
  const amountLabel = `CHF ${Number(amount).toFixed(2)}`;
  const paymentDate = escapeHtml(formatPaymentDate(paidAt, language));
  const method = escapeHtml(paymentMethod);
  const rows = isFrench
    ? infoRow("Montant de l'acompte", amountLabel) + infoRow("Date de réception", paymentDate) + infoRow("Mode de paiement", method)
    : infoRow("Deposit amount", amountLabel) + infoRow("Payment date", paymentDate) + infoRow("Payment method", method);

  const body = isFrench
    ? `
      <h1 style="margin:0 0 28px; color:#1a1a18; font-size:26px; line-height:1.3; text-align:center;">Confirmation de votre acompte</h1>
      <p style="margin:0 0 20px; color:#1a1a18;">Bonjour ${name},</p>
      <p style="margin:0 0 20px; color:#4a4742;">Nous vous confirmons la bonne réception de votre acompte pour votre rendez-vous au sein de Maison Tóā. Votre rendez-vous est désormais confirmé.</p>
      ${infoTable(rows)}
      <p style="margin:24px 0; color:#6b6760; font-style:italic;">Veuillez noter qu'en cas d'absence à votre premier rendez-vous sans en avoir informé la clinique à l'avance, votre acompte sera perdu. Toute nouvelle prise de premier rendez-vous nécessitera le paiement d'un nouvel acompte.</p>
      <p style="margin:24px 0 0; color:#4a4742;">Au plaisir de vous accueillir prochainement,</p>
      <p style="margin:8px 0 0; color:#1a1a18; font-weight:500;">L'équipe Maison Tóā</p>
    `
    : `
      <h1 style="margin:0 0 28px; color:#1a1a18; font-size:26px; line-height:1.3; text-align:center;">Confirmation of your deposit</h1>
      <p style="margin:0 0 20px; color:#1a1a18;">Dear ${name},</p>
      <p style="margin:0 0 20px; color:#4a4742;">We confirm receipt of the deposit for your appointment at Maison Tóā. Your appointment is now confirmed.</p>
      ${infoTable(rows)}
      <p style="margin:24px 0; color:#6b6760; font-style:italic;">Please note that if you do not attend your first appointment without informing the clinic in advance, your deposit will be forfeited. Any new first appointment will require a new deposit.</p>
      <p style="margin:24px 0 0; color:#4a4742;">We look forward to welcoming you soon,</p>
      <p style="margin:8px 0 0; color:#1a1a18; font-weight:500;">The Maison Tóā Team</p>
    `;

  return {
    subject: isFrench ? "Confirmation de votre acompte | Maison Tóā" : "Confirmation of your deposit | Maison Tóā",
    html: brandedEmail(body),
  };
}
