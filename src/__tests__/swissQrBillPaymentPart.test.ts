import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  isQrIban,
  buildQrrReference,
  renderPaymentPartPdf,
  PAYMENT_PART_WIDTH_MM,
  PAYMENT_PART_HEIGHT_MM,
} from "@/lib/swissQrBillPaymentPart";
import { buildFallbackInvoicePdf } from "@/lib/fallbackInvoicePdf";

const MM = 72 / 25.4;

// Patients could not pay at the post office because the invoice carried a bare
// 38mm QR square instead of a payment part. These tests pin the things a bank
// counter actually checks.

// --- QR-IBAN detection. Pairing a QRR reference with a non-QR IBAN (or the
//     reverse) is itself a rejection cause, so this must not be guessed. ---
{
  // IID 30000-31999 => QR-IBAN
  assert.equal(isQrIban("CH44 3199 9123 0008 8901 2"), true);
  assert.equal(isQrIban("CH4431999123000889012"), true);
  // Ordinary IBAN (IID 00762) => not a QR-IBAN
  assert.equal(isQrIban("CH9300762011623852957"), false);
  // Non-CH/LI
  assert.equal(isQrIban("DE89370400440532013000"), false);
}

// --- QRR reference: 27 digits with a valid mod-10 recursive check digit. ---
{
  const ref = buildQrrReference("1009643");
  assert.equal(ref.length, 27, "QRR reference must be exactly 27 digits");
  assert.match(ref, /^\d{27}$/);

  // Recompute the check digit independently; the last digit must match.
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const ch of ref.slice(0, 26)) carry = table[(carry + Number(ch)) % 10];
  assert.equal(Number(ref[26]), (10 - carry) % 10, "check digit must be valid");

  // Deterministic for the same invoice.
  assert.equal(buildQrrReference("1009643"), ref);
  // Non-digits are stripped rather than corrupting the reference.
  assert.equal(buildQrrReference("INV-1009643").length, 27);
}

async function main() {
  // --- The payment part renders as one A4 overlay page, slip at the foot
  //     (210x105mm). The old inline code was 38x38mm, below the 46mm minimum. ---
  {
    const slip = await renderPaymentPartPdf({
      iban: "CH4431999123000889012",
      amount: 250.5,
      currency: "CHF",
      reference: buildQrrReference("1009643"),
      creditor: {
        name: "Maison TOA",
        street: "Voie du Chariot",
        buildingNumber: "6",
        postalCode: "1003",
        town: "Lausanne",
      },
      debtor: {
        name: "Test Patient",
        street: "Rue de Test",
        buildingNumber: "1",
        postalCode: "1000",
        town: "Lausanne",
      },
      message: "Facture 1009643",
      language: "FR",
    });

    assert.equal(slip.subarray(0, 5).toString(), "%PDF-");
    const doc = await PDFDocument.load(slip);
    assert.equal(doc.getPageCount(), 1, "payment part must fit on one page");
    const { width, height } = doc.getPage(0).getSize();
    assert.ok(Math.abs(width - PAYMENT_PART_WIDTH_MM * MM) < 0.5, `width ${width}pt`);
    assert.ok(Math.abs(height - 297 * MM) < 0.5, `A4 height expected, got ${height}pt`);
    assert.equal(PAYMENT_PART_HEIGHT_MM, 105);

    // In production every glyph printed as an empty box: the SVG asked for
    // Arial and the server has no fonts. The slip must use the PDF standard
    // Helvetica (no system font needed) and real text, not a picture of it.
    const raw = slip.toString("latin1");
    assert.match(raw, /\/BaseFont \/Helvetica/, "standard Helvetica");
    assert.doesNotMatch(raw, /Arial/, "must not depend on Arial");
    assert.doesNotMatch(raw, /\/Subtype \/Image/, "must not be a raster image");
  }

  // --- A normal (non-QR) IBAN must still produce a bill, without a QRR
  //     reference. Previously any IBAN was paired with a QRR reference. ---
  {
    const slip = await renderPaymentPartPdf({
      iban: "CH9300762011623852957",
      amount: 80,
      reference: buildQrrReference("42"), // supplied but must be ignored
      creditor: { name: "Maison TOA", postalCode: "1003", town: "Lausanne" },
      debtor: null,
      language: "FR",
    });
    assert.equal((await PDFDocument.load(slip)).getPageCount(), 1, "non-QR IBAN must still render a valid payment part");
  }

  // --- The invoice carries the slip across the bottom of its last page,
  //     stays small enough to e-mail, and a long invoice moves the slip to
  //     its own page instead of printing over the totals. ---
  {
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Prestation ${i}`, code: "5406", quantity: 1, unit_price: 100, total_price: 100 })) as never;
    const input = {
      invoice: { invoice_number: "1013156", total_amount: 3000, paid_amount: 0, invoice_date: "2026-11-04" } as never,
      patient: { first_name: "Mélissa", last_name: "Ziegenhagen", dob: null, street_address: "Ruelle du Moulin 3", postal_code: "1525", town: "Henniez" },
      biller: { name: "Maison TOA", street: "Voie du Chariot", streetNo: "6", postalCode: "1003", town: "Lausanne", iban: "CH9300762011623852957" },
      billingType: "TG",
      documentType: "tg" as const,
    };
    const short = await buildFallbackInvoicePdf({ ...input, lineItems: items(1) });
    assert.equal((await PDFDocument.load(short)).getPageCount(), 1);
    assert.ok(short.length < 150_000, `invoice too large to e-mail comfortably: ${short.length} bytes`);
    assert.doesNotMatch(short.toString("latin1"), /Arial/);

    const long = await buildFallbackInvoicePdf({ ...input, lineItems: items(14) });
    assert.equal((await PDFDocument.load(long)).getPageCount(), 2);
  }
}

main()
  .then(() => console.log("swissQrBillPaymentPart: all assertions passed"))
  .catch((e) => { console.error(e); process.exit(1); });
