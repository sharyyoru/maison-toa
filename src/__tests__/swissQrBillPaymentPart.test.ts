import assert from "node:assert/strict";
import {
  isQrIban,
  buildQrrReference,
  renderPaymentPartPng,
  PAYMENT_PART_WIDTH_MM,
  PAYMENT_PART_HEIGHT_MM,
} from "@/lib/swissQrBillPaymentPart";

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
  // --- The payment part renders, and at the mandated proportions.
  //     210x105mm => aspect ratio 2:1. The old inline code was 38x38mm, below
  //     the 46mm minimum, which is why it may not have scanned at all. ---
  {
    const png = await renderPaymentPartPng({
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

    assert.ok(Buffer.isBuffer(png) && png.length > 5000, "expected a rendered PNG");
    assert.equal(png.subarray(1, 4).toString(), "PNG", "must be a PNG");

    // Dimensions from the IHDR chunk.
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const ratio = width / height;
    const expected = PAYMENT_PART_WIDTH_MM / PAYMENT_PART_HEIGHT_MM; // 2.0
    assert.ok(
      Math.abs(ratio - expected) < 0.05,
      `payment part must be ${PAYMENT_PART_WIDTH_MM}x${PAYMENT_PART_HEIGHT_MM}mm (ratio ${expected}), got ${ratio.toFixed(3)}`,
    );
    // 300dpi across 210mm is ~2480px; anything much smaller will not scan in print.
    assert.ok(width > 2000, `raster too small for print: ${width}px`);
  }

  // --- A normal (non-QR) IBAN must still produce a bill, without a QRR
  //     reference. Previously any IBAN was paired with a QRR reference. ---
  {
    const png = await renderPaymentPartPng({
      iban: "CH9300762011623852957",
      amount: 80,
      reference: buildQrrReference("42"), // supplied but must be ignored
      creditor: { name: "Maison TOA", postalCode: "1003", town: "Lausanne" },
      debtor: null,
      language: "FR",
    });
    assert.ok(png.length > 5000, "non-QR IBAN must still render a valid payment part");
  }
}

main()
  .then(() => console.log("swissQrBillPaymentPart: all assertions passed"))
  .catch((e) => { console.error(e); process.exit(1); });
