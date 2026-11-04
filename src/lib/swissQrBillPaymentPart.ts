/**
 * Renders a SPEC-COMPLIANT Swiss QR-bill payment part.
 *
 * Why this exists
 * ---------------
 * The local invoice PDF previously drew a bare 38x38mm QR square inline next
 * to the IBAN. That is not a QR-bill. The Swiss Implementation Guidelines
 * (SIX) require a dedicated 210x105mm band across the bottom of the A4 page,
 * split into a 62mm "Récépissé / Empfangsschein" and a 148mm "Section paiement
 * / Zahlteil", with a 46x46mm QR code carrying the Swiss cross, fixed field
 * labels, fixed fonts and a perforation line.
 *
 * Banks and post office counters reject anything that does not match, which is
 * why patients reported being unable to pay at the post office. The 38mm code
 * was also below the mandatory 46mm minimum, so it may not have scanned at all.
 *
 * Implementation
 * --------------
 * The layout is NOT hand-drawn. Getting it subtly wrong produces a document
 * that looks right and is still refused at the counter, which is worse than
 * having none. `swissqrbill` implements the published guidelines and renders
 * it with PDFKit into a 210x105mm vector PDF page; the caller embeds that page
 * at the foot of the invoice.
 *
 * It used to render SVG and rasterise it with `sharp`. The SVG sets its text
 * in font-family="Arial", and the serverless runtime has no system fonts, so
 * in production every character came out as an empty box — the slip was
 * unreadable. PDFKit uses the PDF standard Helvetica (metrics bundled with
 * pdfkit), which needs no fonts on the machine.
 */
import PDFDocument from "pdfkit";

export type PaymentPartInput = {
  /** Creditor IBAN (QR-IBAN for QRR references, normal IBAN for SCOR/NON). */
  iban: string;
  amount: number;
  currency?: "CHF" | "EUR";
  creditor: {
    name: string;
    street?: string | null;
    buildingNumber?: string | null;
    postalCode?: string | null;
    town?: string | null;
    country?: string;
  };
  debtor?: {
    name: string;
    street?: string | null;
    buildingNumber?: string | null;
    postalCode?: string | null;
    town?: string | null;
    country?: string;
  } | null;
  /** Structured QRR reference (27 digits) when using a QR-IBAN. */
  reference?: string | null;
  /** Free-text shown under "Informations supplémentaires". */
  message?: string | null;
  /** Invoice language — drives the printed field labels. */
  language?: "DE" | "FR" | "IT" | "EN";
};

/** The payment part occupies the full page width, 105mm tall, at the bottom. */
export const PAYMENT_PART_WIDTH_MM = 210;
export const PAYMENT_PART_HEIGHT_MM = 105;

const MM_TO_PT = 72 / 25.4;

function cleanIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * A QR-IBAN (reference type QRR) is identified by an IID in 30000–31999.
 * Pairing the wrong reference type with the IBAN is itself a rejection cause,
 * so derive it rather than letting callers guess.
 */
export function isQrIban(iban: string): boolean {
  const normalised = cleanIban(iban);
  if (!/^CH|^LI/.test(normalised)) return false;
  const iid = Number(normalised.slice(4, 9));
  return Number.isFinite(iid) && iid >= 30000 && iid <= 31999;
}

/** Mod-10 recursive check digit, per the Swiss payment standard. */
function qrrCheckDigit(input: string): number {
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const ch of input.replace(/\D/g, "")) {
    carry = table[(carry + Number(ch)) % 10];
  }
  return (10 - carry) % 10;
}

/** Build a valid 27-digit QRR reference from an invoice number. */
export function buildQrrReference(invoiceNumber: string): string {
  const digits = (invoiceNumber || "").replace(/\D/g, "").slice(-26);
  const base = digits.padStart(26, "0");
  return base + String(qrrCheckDigit(base));
}

/**
 * Returns a one-page A4 PDF with the payment part placed by swissqrbill at the
 * foot of the page (vector), the rest of the page transparent so it can be
 * overlaid on an invoice page. Placing it on a full page — rather than on a
 * 210x105mm page — is what makes the library draw the horizontal cut line
 * above the slip, which plain-paper QR-bills require.
 * Throws when the data cannot produce a valid bill — callers should fall back
 * to printing the IBAN as text rather than emitting an invalid slip.
 */
export async function renderPaymentPartPdf(input: PaymentPartInput): Promise<Buffer> {
  // Imported lazily: the package is ESM-first and only needed when an invoice
  // actually carries payable balance.
  const { SwissQRBill } = await import("swissqrbill/pdf");

  const iban = cleanIban(input.iban);
  const useQrr = Boolean(input.reference) && isQrIban(iban);

  const data = {
    currency: input.currency ?? "CHF",
    amount: Number(input.amount.toFixed(2)),
    // Reference type must match the IBAN kind, or the bill is invalid.
    ...(useQrr ? { reference: input.reference as string } : {}),
    creditor: {
      account: iban,
      name: input.creditor.name,
      address: input.creditor.street || "",
      buildingNumber: input.creditor.buildingNumber || "",
      zip: input.creditor.postalCode || "",
      city: input.creditor.town || "",
      country: input.creditor.country || "CH",
    },
    ...(input.debtor
      ? {
          debtor: {
            name: input.debtor.name,
            address: input.debtor.street || "",
            buildingNumber: input.debtor.buildingNumber || "",
            zip: input.debtor.postalCode || "",
            city: input.debtor.town || "",
            country: input.debtor.country || "CH",
          },
        }
      : {}),
    ...(input.message ? { message: input.message } : {}),
  };

  const bill = new SwissQRBill(data as ConstructorParameters<typeof SwissQRBill>[0], {
    language: input.language ?? "FR",
    outlines: true, // print the cut lines, as the guidelines require
  });

  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  bill.attachTo(doc, 0, doc.page.height - PAYMENT_PART_HEIGHT_MM * MM_TO_PT);
  doc.end();
  return done;
}
