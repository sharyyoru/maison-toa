import assert from "node:assert/strict";
import { generateInvoiceEmailContent } from "@/lib/invoiceEmailContent";

const base = {
  invoiceNumber: "INV-2026-0042",
  providerName: "Maison TOA",
  patientName: "Marie Dupont",
};

// --- Reminder, nothing paid yet: should ask for the full remaining amount (= total) ---
{
  const { subject, html } = generateInvoiceEmailContent({
    ...base,
    documentType: "reminder",
    status: "UNPAID",
    totalAmount: 500,
    paidAmount: 0,
  });
  assert.match(subject, /Rappel de paiement/);
  assert.match(html, /CHF 500\.00/);
  assert.doesNotMatch(html, /Montant déjà réglé/);
}

// --- Reminder, deposit already paid: must chase the remaining balance, NOT the total ---
{
  const { html } = generateInvoiceEmailContent({
    ...base,
    documentType: "reminder",
    status: "PARTIAL_PAID",
    totalAmount: 500,
    paidAmount: 200,
  });
  assert.match(html, /Solde restant dû : <strong>CHF 300\.00<\/strong>/);
  assert.match(html, /Montant déjà réglé : <strong>CHF 200\.00<\/strong>/);
  // The email must never quote the full CHF 500.00 total as the amount owed.
  assert.doesNotMatch(html, /concernant la facture <strong>INV-2026-0042<\/strong> d'un montant de <strong>CHF 500\.00/);
}

// --- Reminder where paid_amount happens to equal (or exceed) total: no negative balance ---
{
  const { html } = generateInvoiceEmailContent({
    ...base,
    documentType: "reminder",
    status: "PARTIAL_PAID",
    totalAmount: 500,
    paidAmount: 500,
  });
  assert.match(html, /Solde restant dû : <strong>CHF 0\.00<\/strong>/);
}
{
  const { html } = generateInvoiceEmailContent({
    ...base,
    documentType: "reminder",
    status: "PARTIAL_PAID",
    totalAmount: 500,
    paidAmount: 650, // overpaid — should clamp to 0, never go negative
  });
  assert.match(html, /Solde restant dû : <strong>CHF 0\.00<\/strong>/);
}

// --- Receipt (fully paid): shows the full total, not a "remaining" figure ---
{
  const { subject, html, pdfFilePrefix } = generateInvoiceEmailContent({
    ...base,
    documentType: "receipt",
    status: "PAID",
    totalAmount: 500,
    paidAmount: 500,
  });
  assert.match(subject, /^Receipt /);
  assert.match(html, /fully paid invoice of <strong>CHF 500\.00<\/strong>/);
  assert.equal(pdfFilePrefix, "receipt");
}

// --- Status alone (no documentType) also triggers the receipt wording when PAID/OVERPAID ---
{
  const { html } = generateInvoiceEmailContent({
    ...base,
    documentType: undefined,
    status: "OVERPAID",
    totalAmount: 500,
    paidAmount: 520,
  });
  assert.match(html, /fully paid invoice/);
}

// --- Plain partial-payment invoice email (not a reminder) ---
{
  const { subject, html } = generateInvoiceEmailContent({
    ...base,
    documentType: "tg",
    status: "PARTIAL_PAID",
    totalAmount: 500,
    paidAmount: 150,
  });
  assert.match(subject, /Partial Payment/);
  assert.match(html, /Amount paid so far: <strong>CHF 150\.00<\/strong>/);
  assert.match(html, /Remaining balance: <strong>CHF 350\.00<\/strong>/);
}

// --- Plain, fully-unpaid invoice email ---
{
  const { subject, html, pdfFilePrefix } = generateInvoiceEmailContent({
    ...base,
    documentType: "tp",
    status: "UNPAID",
    totalAmount: 500,
    paidAmount: 0,
  });
  assert.match(subject, /^Invoice INV-2026-0042 — Maison TOA$/);
  assert.match(html, /invoice for <strong>CHF 500\.00<\/strong>/);
  assert.equal(pdfFilePrefix, "invoice-tp");
}

// --- Missing/garbage numeric input never produces NaN in the output ---
{
  const { html } = generateInvoiceEmailContent({
    ...base,
    documentType: "reminder",
    status: "PARTIAL_PAID",
    totalAmount: Number.NaN,
    paidAmount: Number.NaN,
  });
  assert.doesNotMatch(html, /NaN/);
  assert.match(html, /CHF 0\.00/);
}

console.log("Invoice email content tests passed");
