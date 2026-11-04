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
 * having none. `swissqrbill` implements the published guidelines; it renders
 * to SVG, `sharp` rasterises that at print resolution, and the caller places
 * the result at exactly 210x105mm.
 */
import sharp from "sharp";

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

/** 300 dpi over 210mm — crisp enough that the QR scans from print. */
const RASTER_WIDTH_PX = Math.round((PAYMENT_PART_WIDTH_MM / 25.4) * 300);

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
 * Returns the payment part as a PNG buffer sized for 210x105mm.
 * Throws when the data cannot produce a valid bill — callers should fall back
 * to printing the IBAN as text rather than emitting an invalid slip.
 */
export async function renderPaymentPartPng(input: PaymentPartInput): Promise<Buffer> {
  // Imported lazily: the package is ESM-first and only needed when an invoice
  // actually carries payable balance.
  const { SwissQRBill } = await import("swissqrbill/svg");

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

  const svg = new SwissQRBill(data as ConstructorParameters<typeof SwissQRBill>[0], {
    language: input.language ?? "FR",
    outlines: true, // print the cut lines, as the guidelines require
  });

  // The payment part is black line-art on white. Rasterising it as full
  // 24-bit colour produced a ~12 MB PNG, which pushed a single invoice PDF
  // over 12 MB — past the attachment limit of most mail servers, so invoice
  // e-mails would have bounced. A 2-colour palette keeps every glyph and QR
  // module exactly as crisp while cutting the file by orders of magnitude.
  return sharp(Buffer.from(svg.toString()))
    .resize({ width: RASTER_WIDTH_PX })
    .greyscale()
    .png({ palette: true, colours: 2, compressionLevel: 9, effort: 10 })
    .toBuffer();
}
