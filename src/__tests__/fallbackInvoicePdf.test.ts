import assert from "node:assert/strict";
import { shouldPrintPaymentSlip, fallbackDocumentTitle, formatSwissDate } from "@/lib/fallbackInvoicePdf";

const IBAN = "CH9300762011623852957";

// --- Tiers Payant: the insurer pays. A payable slip on the patient copy
//     invites the patient to pay the same amount a second time. ---
{
  assert.equal(shouldPrintPaymentSlip({ billingType: "TP", documentType: "tp", remaining: 120, iban: IBAN }), false);
  assert.equal(shouldPrintPaymentSlip({ billingType: "tp", documentType: "tg", remaining: 120, iban: IBAN }), false,
    "invoice billing_type is authoritative, not the requested documentType");
  assert.equal(shouldPrintPaymentSlip({ billingType: "TP", documentType: "reminder", remaining: 120, iban: IBAN }), false);
}

// --- Patient-paid documents keep the slip. ---
{
  assert.equal(shouldPrintPaymentSlip({ billingType: "TG", documentType: "tg", remaining: 120, iban: IBAN }), true);
  assert.equal(shouldPrintPaymentSlip({ billingType: null, documentType: "tp", remaining: 50, iban: IBAN }), true,
    "cash invoice requested with the route's default 'tp' type still gets a slip");
  assert.equal(shouldPrintPaymentSlip({ billingType: "TG", documentType: "reminder", remaining: 50, iban: IBAN }), true);
}

// --- Nothing to pay, no IBAN, or a receipt => no slip. ---
{
  assert.equal(shouldPrintPaymentSlip({ billingType: "TG", documentType: "tg", remaining: 0, iban: IBAN }), false);
  assert.equal(shouldPrintPaymentSlip({ billingType: "TG", documentType: "tg", remaining: 0.001, iban: IBAN }), false);
  assert.equal(shouldPrintPaymentSlip({ billingType: "TG", documentType: "tg", remaining: 10, iban: null }), false);
  assert.equal(shouldPrintPaymentSlip({ billingType: "TG", documentType: "receipt", remaining: 10, iban: IBAN }), false);
}

// --- Titles. Reminders used to print as "FACTURE". ---
{
  assert.equal(fallbackDocumentTitle({ documentType: "reminder", reminderLevel: 1, remaining: 10 }), "1er rappel");
  assert.equal(fallbackDocumentTitle({ documentType: "reminder", reminderLevel: 2, remaining: 10 }), "2e rappel");
  assert.equal(fallbackDocumentTitle({ documentType: "reminder", reminderLevel: 3, remaining: 10 }), "3e rappel");
  assert.equal(fallbackDocumentTitle({ documentType: "receipt", remaining: 10 }), "Quittance");
  assert.equal(fallbackDocumentTitle({ documentType: "tg", remaining: 0 }), "Quittance");
  assert.equal(fallbackDocumentTitle({ billingType: "TP", documentType: "tp", remaining: 10 }), "Facture tiers payant");
  assert.equal(fallbackDocumentTitle({ billingType: "TG", documentType: "tg", remaining: 10 }), "Facture");
}


// --- Dates print as dd.mm.yyyy regardless of the server timezone. ---
{
  assert.equal(formatSwissDate("1999-11-14"), "14.11.1999");
  assert.equal(formatSwissDate(null), "");
  assert.equal(formatSwissDate("not a date"), "");
}

console.log("fallbackInvoicePdf: all assertions passed");
