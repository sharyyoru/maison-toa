import assert from "node:assert/strict";
import { computeInvoicePdfPaymentPresentation } from "@/lib/invoicePdfPaymentPresentation";
import { GenerationAttribute, TiersMode } from "@/lib/sumexInvoice";
import { generateInvoiceEmailContent } from "@/lib/invoiceEmailContent";

// --- Partially-paid, Tiers Garant: PDF remark must show the remaining balance,
//     and Sumex must be told the prepaid amount so the QR-bill total due is
//     reduced accordingly (not the full invoice total). ---
{
  const result = computeInvoicePdfPaymentPresentation({
    status: "PARTIAL_PAID",
    totalAmount: 500,
    paidAmount: 200,
    tiersMode: TiersMode.Garant,
    hasValidQrIban: true,
  });
  assert.match(result.paymentRemark, /Acompte reçu \/ Anzahlung erhalten: 200\.00 CHF/);
  assert.match(result.paymentRemark, /Solde \/ Restbetrag: 300\.00 CHF/);
  // This is what actually makes the printed QR-bill show CHF 300, not CHF 500.
  assert.equal(result.amountPrepaid, 200);
  assert.equal(result.pdfGenAttrs, GenerationAttribute.None);
}

// --- amountPrepaid must NOT be sent for TP/TS — Sumex rejects it (error [926]) ---
{
  const resultTP = computeInvoicePdfPaymentPresentation({
    status: "PARTIAL_PAID",
    totalAmount: 500,
    paidAmount: 200,
    tiersMode: TiersMode.Payant,
    hasValidQrIban: true,
  });
  assert.equal(resultTP.amountPrepaid, 0);

  const resultTS = computeInvoicePdfPaymentPresentation({
    status: "PARTIAL_PAID",
    totalAmount: 500,
    paidAmount: 200,
    tiersMode: TiersMode.Soldant,
    hasValidQrIban: true,
  });
  assert.equal(resultTS.amountPrepaid, 0);
}

// --- Fully paid: QR/ESR slip hidden, no leftover balance quoted ---
{
  const result = computeInvoicePdfPaymentPresentation({
    status: "PAID",
    totalAmount: 500,
    paidAmount: 500,
    tiersMode: TiersMode.Garant,
    hasValidQrIban: true,
  });
  assert.match(result.paymentRemark, /ACQUITTÉ \/ BEZAHLT — Montant acquitté: 500\.00 CHF/);
  assert.equal(result.pdfGenAttrs, GenerationAttribute.ExcludeESRInPrint);
}

// --- Overpaid clamps to zero remaining, never negative ---
{
  const result = computeInvoicePdfPaymentPresentation({
    status: "PARTIAL_PAID",
    totalAmount: 500,
    paidAmount: 650,
    tiersMode: TiersMode.Garant,
    hasValidQrIban: true,
  });
  // paidAmount >= total - 0.01 => treated as fully paid, not "partial with negative balance"
  assert.match(result.paymentRemark, /ACQUITTÉ \/ BEZAHLT/);
  assert.doesNotMatch(result.paymentRemark, /-/);
}

// --- No valid QR-IBAN: slip hidden regardless of payment status, provider IBAN
//     appended as a fallback note when something is still owed ---
{
  const result = computeInvoicePdfPaymentPresentation({
    status: "UNPAID",
    totalAmount: 500,
    paidAmount: 0,
    tiersMode: TiersMode.Garant,
    hasValidQrIban: false,
    rawProviderIban: "CH9300762011623852957",
  });
  assert.equal(result.pdfGenAttrs, GenerationAttribute.ExcludeESRInPrint);
  assert.match(result.combinedRemark ?? "", /Virement \/ Überweisung: CH9300762011623852957/);
}

// --- No valid QR-IBAN + fully paid: no IBAN fallback note needed ---
{
  const result = computeInvoicePdfPaymentPresentation({
    status: "PAID",
    totalAmount: 500,
    paidAmount: 500,
    tiersMode: TiersMode.Garant,
    hasValidQrIban: false,
    rawProviderIban: "CH9300762011623852957",
  });
  assert.doesNotMatch(result.combinedRemark ?? "", /Virement/);
}

// --- Invoice notes are preserved alongside the payment remark ---
{
  const result = computeInvoicePdfPaymentPresentation({
    status: "PARTIAL_PAID",
    totalAmount: 500,
    paidAmount: 200,
    tiersMode: TiersMode.Garant,
    hasValidQrIban: true,
    invoiceNotes: "Follow-up consultation",
  });
  assert.match(result.combinedRemark ?? "", /^Follow-up consultation\n/);
  assert.match(result.combinedRemark ?? "", /Solde \/ Restbetrag: 300\.00 CHF/);
}

// --- Garbage numeric input never produces NaN ---
{
  const result = computeInvoicePdfPaymentPresentation({
    status: "PARTIAL_PAID",
    totalAmount: Number.NaN,
    paidAmount: Number.NaN,
    tiersMode: TiersMode.Garant,
    hasValidQrIban: true,
  });
  assert.doesNotMatch(result.paymentRemark, /NaN/);
}

// --- Cross-check: the PDF's "Solde/Restbetrag" and the reminder email's
//     "Solde restant dû" must agree on the same remaining balance for the
//     same invoice, since they're sent together. ---
{
  const totalAmount = 780.5;
  const paidAmount = 300;

  const pdf = computeInvoicePdfPaymentPresentation({
    status: "PARTIAL_PAID",
    totalAmount,
    paidAmount,
    tiersMode: TiersMode.Garant,
    hasValidQrIban: true,
  });
  const email = generateInvoiceEmailContent({
    invoiceNumber: "INV-2026-0099",
    providerName: "Maison TOA",
    patientName: "Jean Rossier",
    documentType: "reminder",
    status: "PARTIAL_PAID",
    totalAmount,
    paidAmount,
  });

  const expectedRemaining = (totalAmount - paidAmount).toFixed(2);
  assert.match(pdf.paymentRemark, new RegExp(`Solde / Restbetrag: ${expectedRemaining} CHF`));
  assert.match(email.html, new RegExp(`Solde restant dû : <strong>CHF ${expectedRemaining}</strong>`));
}

console.log("Invoice PDF payment presentation tests passed");
