import assert from "node:assert/strict";
import { formatDepositPaymentMethod, generateDepositConfirmationEmail } from "@/lib/depositConfirmationEmail";

const paymentDate = new Date("2026-02-20T12:00:00.000Z");

const french = generateDepositConfirmationEmail({
  patientName: "Marie <Martin>",
  amount: 250,
  paidAt: paymentDate,
  paymentMethod: formatDepositPaymentMethod("card", "fr"),
  language: "fr",
});

assert.equal(french.subject, "Confirmation de votre acompte | Maison Tóā");
assert.match(french.html, /Marie &lt;Martin&gt;/);
assert.match(french.html, /CHF 250\.00/);
assert.match(french.html, /Carte bancaire/);
assert.match(french.html, /votre acompte sera perdu/);

const english = generateDepositConfirmationEmail({
  patientName: "John Smith",
  amount: 450.5,
  paidAt: paymentDate,
  paymentMethod: formatDepositPaymentMethod("twint", "en"),
  language: "en",
});

assert.equal(english.subject, "Confirmation of your deposit | Maison Tóā");
assert.match(english.html, /CHF 450\.50/);
assert.match(english.html, /\sTWINT\s/);
assert.match(english.html, /your deposit will be forfeited/);
assert.equal(formatDepositPaymentMethod("unknown", "fr"), "Paiement en ligne");

console.log("Deposit confirmation email tests passed");
