export type InvoiceDocumentType = "tg" | "tp" | "reminder" | "receipt" | undefined;

export type InvoiceEmailInput = {
  invoiceNumber: string;
  providerName: string;
  patientName: string;
  documentType?: InvoiceDocumentType | string;
  status: string | null | undefined;
  totalAmount: number;
  paidAmount: number;
};

export type InvoiceEmailContent = {
  subject: string;
  html: string;
  /** File name prefix used for the attached PDF, e.g. "reminder", "receipt". */
  pdfFilePrefix: string;
};

/**
 * Builds the subject/body for the email sent alongside an invoice PDF
 * (regular invoice, partial-payment invoice, payment reminder, or receipt).
 *
 * Kept as a pure function (no Supabase/email-provider calls) so the amount
 * logic — in particular "a reminder must chase the remaining balance, not
 * the original total" — can be unit tested directly.
 */
export function generateInvoiceEmailContent({
  invoiceNumber,
  providerName,
  patientName,
  documentType,
  status,
  totalAmount,
  paidAmount,
}: InvoiceEmailInput): InvoiceEmailContent {
  const totalAmt = Number.isFinite(totalAmount) ? totalAmount : 0;
  const paidAmt = Number.isFinite(paidAmount) ? paidAmount : 0;

  const isPaid = status === "PAID" || status === "OVERPAID";
  const isPartial = status === "PARTIAL_PAID" || status === "PARTIAL_LOSS";
  const isReminder = documentType === "reminder";
  const isReceipt = documentType === "receipt" || isPaid;

  // A reminder should always chase what's actually still owed, not the
  // original invoice total — otherwise a patient who already paid a
  // deposit/partial amount gets asked to pay the full amount all over again.
  const remainingAmt = Math.max(totalAmt - paidAmt, 0);

  let subject = `Invoice ${invoiceNumber} — ${providerName}`;
  if (isReceipt) subject = `Receipt ${invoiceNumber} — ${providerName}`;
  else if (isReminder) subject = `Rappel de paiement — Facture ${invoiceNumber} — ${providerName}`;
  else if (isPartial) subject = `Invoice ${invoiceNumber} (Partial Payment) — ${providerName}`;

  const docLabel = isReceipt ? "Payment Receipt" : isReminder ? "Rappel de paiement" : "Invoice";

  const messageParagraph = isReceipt
    ? `Please find attached the receipt for your fully paid invoice of <strong>CHF ${totalAmt.toFixed(2)}</strong>.`
    : isReminder
      ? paidAmt > 0
        ? `Veuillez trouver ci-joint un rappel de paiement concernant la facture <strong>${invoiceNumber}</strong>. Montant déjà réglé : <strong>CHF ${paidAmt.toFixed(2)}</strong>. Solde restant dû : <strong>CHF ${remainingAmt.toFixed(2)}</strong>.<br/><br/>Nous vous remercions de bien vouloir procéder au règlement du solde dans les meilleurs délais.`
        : `Veuillez trouver ci-joint un rappel de paiement concernant la facture <strong>${invoiceNumber}</strong> d'un montant de <strong>CHF ${remainingAmt.toFixed(2)}</strong>.<br/><br/>Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.`
      : isPartial
        ? `Please find attached your invoice. Amount paid so far: <strong>CHF ${paidAmt.toFixed(2)}</strong>. Remaining balance: <strong>CHF ${remainingAmt.toFixed(2)}</strong>.`
        : `Please find attached your invoice for <strong>CHF ${totalAmt.toFixed(2)}</strong>.`;

  const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1e293b; font-size: 18px; margin-bottom: 16px;">${docLabel} ${invoiceNumber}</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">${isReminder ? "Bonjour Madame / Monsieur" : `Dear ${patientName}`},</p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          ${messageParagraph}
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">${isReminder ? "Nous vous remercions de votre confiance." : "Thank you for your trust."}</p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">${isReminder ? "Meilleures salutations" : "Kind regards"},<br/>${providerName}</p>
      </div>
    `;

  const pdfFilePrefix = isReceipt ? "receipt" : isReminder ? "reminder" : documentType === "tp" ? "invoice-tp" : "invoice";

  return { subject, html, pdfFilePrefix };
}
