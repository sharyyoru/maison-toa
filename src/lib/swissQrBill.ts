/**
 * Swiss QR-bill Generator
 * Implements Swiss Payment Standards (SPS) for QR-bills
 * Based on QR-bill specification version 2.2 (compatible with 2.3)
 * Reference: https://www.six-group.com/en/products-services/banking-services/payment-standardization/standards/qr-bill.html
 */

export type SwissQrBillData = {
  // Account information
  iban: string; // Swiss or Liechtenstein IBAN
  
  // Creditor (payee) information — structured address (S)
  creditorName: string;
  creditorStreet: string;          // Street name (without building number)
  creditorBuildingNumber: string;  // Building/house number
  creditorPostalCode: string;      // Postal code (NPA)
  creditorTown: string;            // Town/city (locality)
  creditorCountry: string;         // ISO 3166-1 alpha-2 (e.g., "CH")
  
  // Amount and currency
  amount?: number; // Optional, if not provided QR-bill is open for any amount
  currency: "CHF" | "EUR";
  
  // Debtor (payer) information - optional, structured address (S)
  debtorName?: string;
  debtorStreet?: string;
  debtorBuildingNumber?: string;
  debtorPostalCode?: string;
  debtorTown?: string;
  debtorCountry?: string;
  
  // Reference
  referenceType: "QRR" | "SCOR" | "NON"; // QR Reference, Creditor Reference, or No Reference
  reference?: string; // Required for QRR and SCOR
  
  // Additional information
  unstructuredMessage?: string; // Max 140 characters
  billInformation?: string; // Structured bill information
  
  // Alternative schemes - for future use
  alternativeScheme1?: string;
  alternativeScheme2?: string;
};

/**
 * Validate Swiss IBAN format
 */
function validateSwissIban(iban: string): boolean {
  // Remove spaces and convert to uppercase
  const cleanIban = iban.replace(/\s/g, "").toUpperCase();
  
  // Swiss IBAN format: CH + 2 check digits + 5 digits (bank code) + 12 characters (account)
  // Total: 21 characters
  const swissIbanRegex = /^CH\d{19}$/;
  const liechtensteinIbanRegex = /^LI\d{19}$/;
  
  return swissIbanRegex.test(cleanIban) || liechtensteinIbanRegex.test(cleanIban);
}

/**
 * Calculate QR Reference check digit using Modulo 10 recursive algorithm
 */
function calculateQrReferenceCheckDigit(reference: string): string {
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  
  for (let i = 0; i < reference.length; i++) {
    carry = table[(carry + parseInt(reference[i])) % 10];
  }
  
  return ((10 - carry) % 10).toString();
}

/**
 * Validate and format QR Reference (QRR)
 * QR Reference is 27 characters: 26 digits + 1 check digit
 */
function formatQrReference(reference: string): string {
  // Remove spaces and non-digits
  const cleaned = reference.replace(/\D/g, "");
  
  if (cleaned.length < 26) {
    // Pad with leading zeros to 26 digits
    const padded = cleaned.padStart(26, "0");
    const checkDigit = calculateQrReferenceCheckDigit(padded);
    return padded + checkDigit;
  } else if (cleaned.length === 26) {
    // Add check digit
    const checkDigit = calculateQrReferenceCheckDigit(cleaned);
    return cleaned + checkDigit;
  } else if (cleaned.length === 27) {
    // Verify check digit
    const ref = cleaned.substring(0, 26);
    const providedCheckDigit = cleaned[26];
    const calculatedCheckDigit = calculateQrReferenceCheckDigit(ref);
    
    if (providedCheckDigit !== calculatedCheckDigit) {
      throw new Error("Invalid QR Reference check digit");
    }
    return cleaned;
  } else {
    throw new Error("QR Reference must be 26 or 27 digits");
  }
}

/**
 * Validate ISO 11649 Creditor Reference (SCOR)
 */
function validateCreditorReference(reference: string): boolean {
  // Remove spaces
  const cleaned = reference.replace(/\s/g, "");
  
  // Must start with "RF" followed by 2 check digits and up to 21 characters
  if (!/^RF\d{2}.{1,21}$/.test(cleaned)) {
    return false;
  }
  
  // TODO: Implement full ISO 11649 check digit validation if needed
  return true;
}

/**
 * Format amount with 2 decimal places, or return empty string if no amount
 */
function formatAmount(amount?: number): string {
  if (amount === undefined || amount === null || amount <= 0) {
    return "";
  }
  return amount.toFixed(2);
}

/**
 * Encode Swiss QR-bill data into the standardized string format
 * Following Swiss Implementation Guidelines QR-bill Version 2.2
 */
export function encodeSwissQrBill(data: SwissQrBillData): string {
  // Validate IBAN
  if (!validateSwissIban(data.iban)) {
    throw new Error("Invalid Swiss or Liechtenstein IBAN format");
  }
  
  // Clean and format IBAN (remove spaces)
  const iban = data.iban.replace(/\s/g, "").toUpperCase();
  
  // Format reference based on type
  let reference = "";
  if (data.referenceType === "QRR" && data.reference) {
    reference = formatQrReference(data.reference);
  } else if (data.referenceType === "SCOR" && data.reference) {
    if (!validateCreditorReference(data.reference)) {
      throw new Error("Invalid Creditor Reference format");
    }
    reference = data.reference.replace(/\s/g, "");
  }
  
  // Build QR code content according to Swiss Payment Standards
  // Format: Each field on a new line, fields in specific order
  const lines: string[] = [
    // Header
    "SPC",                                    // QR Type
    "0200",                                   // Version 2.0 (compatible with 2.2 and 2.3)
    "1",                                      // Coding Type (1 = UTF-8)
    
    // IBAN
    iban,
    
    // Creditor (CdtrInf) — Structured address type
    "S",                                      // Address Type: S = Structured
    data.creditorName.substring(0, 70),       // Name (max 70 chars)
    data.creditorStreet.substring(0, 70),     // Street name
    data.creditorBuildingNumber.substring(0, 16), // Building number
    data.creditorPostalCode.substring(0, 16), // Postal code (NPA)
    data.creditorTown.substring(0, 35),       // Town (locality)
    data.creditorCountry,                     // Country code
    
    // Ultimate Creditor (UltmtCdtr) - 7 fields, all empty for standard use
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    
    // Amount
    formatAmount(data.amount),
    data.currency,
    
    // Ultimate Debtor (UltmtDbtr) — Structured address type
    data.debtorName ? "S" : "",
    data.debtorName?.substring(0, 70) || "",
    data.debtorStreet?.substring(0, 70) || "",
    data.debtorBuildingNumber?.substring(0, 16) || "",
    data.debtorPostalCode?.substring(0, 16) || "",
    data.debtorTown?.substring(0, 35) || "",
    data.debtorCountry || "",
    
    // Reference
    data.referenceType,
    reference,
    
    // Additional information
    data.unstructuredMessage?.substring(0, 140) || "",
    "EPD",                                    // Trailer: End Payment Data
    data.billInformation?.substring(0, 140) || "",
    
    // Alternative schemes (AV1, AV2)
    data.alternativeScheme1?.substring(0, 100) || "",
    data.alternativeScheme2?.substring(0, 100) || "",
  ];
  
  return lines.join("\n");
}

/**
 * Generate Swiss QR-bill QR code data URL
 * Returns a data URL that can be embedded in HTML/PDF
 */
export async function generateSwissQrBillDataUrl(data: SwissQrBillData): Promise<string> {
  const QRCode = await import("qrcode");
  const qrContent = encodeSwissQrBill(data);
  
  // Swiss QR-bill specifications:
  // - Error correction: M (15%)
  // - Size: minimum 46x46mm for printing
  // - We'll generate 300x300px which is suitable for most uses
  return QRCode.toDataURL(qrContent, {
    errorCorrectionLevel: "M",
    width: 300,
    margin: 0,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

/**
 * Generate a standard Swiss reference number from an invoice ID
 * Converts invoice ID to a 26-digit QR reference
 */
export function generateSwissReference(invoiceId: string): string {
  // Convert invoice ID to a numeric hash for alphanumeric IDs
  let numericPart = invoiceId.replace(/\D/g, "");
  
  // If no digits found (e.g., "CONS-MLOWNJTD"), create a hash from the string
  if (numericPart.length === 0) {
    // Simple hash: convert each character to its char code and concatenate
    let hash = "";
    for (let i = 0; i < invoiceId.length; i++) {
      const charCode = invoiceId.charCodeAt(i);
      hash += charCode.toString().padStart(3, "0");
    }
    numericPart = hash;
  }
  
  // Take last 26 digits if hash is too long, or pad if too short
  const paddedReference = numericPart.length > 26 
    ? numericPart.slice(-26)
    : numericPart.padStart(26, "0");
  
  // Add check digit
  const checkDigit = calculateQrReferenceCheckDigit(paddedReference);
  
  return paddedReference + checkDigit;
}

/**
 * Format Swiss QR Reference with spaces for readability
 * Format: XX XXXXX XXXXX XXXXX XXXXX XXXXX X
 */
export function formatSwissReferenceWithSpaces(reference: string): string {
  if (reference.length !== 27) {
    return reference;
  }
  
  return [
    reference.substring(0, 2),
    reference.substring(2, 7),
    reference.substring(7, 12),
    reference.substring(12, 17),
    reference.substring(17, 22),
    reference.substring(22, 27),
  ].join(" ");
}
