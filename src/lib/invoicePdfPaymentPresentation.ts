import { GenerationAttribute, TiersMode } from "@/lib/sumexInvoice";

export type InvoicePdfPaymentInput = {
  status: string | null | undefined;
  totalAmount: number;
  paidAmount: number;
  tiersMode: TiersMode;
  /** Whether a valid QR-IBAN is configured — if not, the QR/ESR slip must be hidden. */
  hasValidQrIban: boolean;
  invoiceNotes?: string | null;
  /** Provider's regular (non-QR) IBAN, shown as a fallback payment instruction. */
  rawProviderIban?: string | null;
};

export type InvoicePdfPaymentPresentation = {
  /** French/German bilingual remark describing what's paid / still owed. */
  paymentRemark: string;
  /** Sumex generation attribute bit flags (e.g. hide the QR/ESR slip). */
  pdfGenAttrs: GenerationAttribute;
  /** Amount to report to Sumex as already prepaid (TG/Garant mode only — Sumex
   *  rejects this field outside Garant, error [926]). Sumex then prints the
   *  *remaining* amount due on the QR-bill, not the invoice's raw total. */
  amountPrepaid: number;
  /** Accountant-facing remark combining invoice notes + payment status + IBAN fallback. */
  combinedRemark: string | undefined;
};

/**
 * Computes what a generated invoice/reminder PDF should say about payment
 * status: the bilingual remark line, whether the QR-bill slip should be
 * printed, and the "amount already paid" fed to Sumex so it prints the
 * correct remaining amount due (not the original total) on the QR-bill.
 *
 * Pulled out of the /api/invoices/generate-pdf route (which previously
 * computed this identically in two separate code paths) so the "does a
 * partially-paid invoice/reminder actually show the remaining balance"
 * logic can be unit tested without calling the real Sumex1 service.
 */
export function computeInvoicePdfPaymentPresentation({
  status,
  totalAmount,
  paidAmount,
  tiersMode,
  hasValidQrIban,
  invoiceNotes,
  rawProviderIban,
}: InvoicePdfPaymentInput): InvoicePdfPaymentPresentation {
  const totalAmt = Number.isFinite(totalAmount) ? totalAmount : 0;
  const paidAmt = Number.isFinite(paidAmount) ? paidAmount : 0;

  const isFullyPaid = status === "PAID" || status === "OVERPAID" || (paidAmt > 0 && paidAmt >= totalAmt - 0.01);
  const isPartialPaid = !isFullyPaid && (status === "PARTIAL_PAID" || (paidAmt > 0 && paidAmt < totalAmt - 0.01));

  let paymentRemark = "";
  let pdfGenAttrs = GenerationAttribute.None;
  if (isFullyPaid) {
    paymentRemark = `ACQUITTÉ / BEZAHLT — Montant acquitté: ${totalAmt.toFixed(2)} CHF`;
    // Nothing left to pay — the QR/ESR slip would be misleading.
    pdfGenAttrs = GenerationAttribute.ExcludeESRInPrint;
  } else if (isPartialPaid) {
    const remaining = Math.max(totalAmt - paidAmt, 0);
    paymentRemark = `Acompte reçu / Anzahlung erhalten: ${paidAmt.toFixed(2)} CHF — Solde / Restbetrag: ${remaining.toFixed(2)} CHF`;
  }

  // Hide the ESR/QR slip when no valid QR-IBAN is available, so Sumex does
  // not print an incorrect default/fallback IBAN on the PDF.
  if (!hasValidQrIban) {
    pdfGenAttrs = GenerationAttribute.ExcludeESRInPrint;
  }

  const notes = (invoiceNotes || "").trim();
  let combinedRemark: string | undefined = notes && paymentRemark
    ? `${notes}\n${paymentRemark}`
    : notes || paymentRemark || undefined;

  if (!hasValidQrIban && !isFullyPaid && rawProviderIban) {
    const ibanNote = `Virement / Überweisung: ${rawProviderIban}`;
    combinedRemark = combinedRemark ? `${combinedRemark}\n${ibanNote}` : ibanNote;
  }

  // amountPrepaid is only allowed in Tiers Garant (TG) — Sumex error [926] if sent for TP/TS.
  // Sumex prints (total - amountPrepaid) as the amount due, so this is what
  // makes the QR-bill itself show the remaining balance rather than the total.
  const amountPrepaid = tiersMode === TiersMode.Garant ? paidAmt : 0;

  return { paymentRemark, pdfGenAttrs, amountPrepaid, combinedRemark };
}
