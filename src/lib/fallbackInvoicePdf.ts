import jsPDF from "jspdf";
import { PDFDocument } from "pdf-lib";
import {
  renderPaymentPartPdf,
  buildQrrReference,
  PAYMENT_PART_HEIGHT_MM,
} from "./swissQrBillPaymentPart";
import { MAISON_TOA_LOGO_PNG_BASE64, MAISON_TOA_LOGO_ASPECT } from "./maisonToaLogo";
import type { Invoice, InvoiceLineItem } from "@/lib/invoiceTypes";

const A4_HEIGHT_MM = 297;

type Party = {
  name: string;
  street?: string | null;
  streetNo?: string | null;
  postalCode?: string | null;
  town?: string | null;
  iban?: string | null;
  phone?: string | null;
  email?: string | null;
};

type Doctor = {
  name: string;
  title?: string | null;
  salutation?: string | null;
  specialty?: string | null;
  zsr?: string | null;
  gln?: string | null;
};

type Patient = {
  first_name: string;
  last_name: string;
  dob: string | null;
  street_address: string | null;
  postal_code: string | null;
  town: string | null;
  gender?: string | null;
  email?: string | null;
};

type FallbackInvoicePdfInput = {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  patient: Patient;
  biller: Party;
  doctor?: Doctor | null;
  treatmentDate?: string | null;
  treatmentCanton?: string | null;
  billingType?: string | null;
  /** Which document the caller asked for (generate-pdf `invoiceType`). */
  documentType?: "tp" | "tg" | "reminder" | "receipt" | null;
  reminderLevel?: number | null;
};

/**
 * Whether the Swiss QR-bill payment slip may be printed.
 *
 * Tiers Payant: the insurer is the debtor and pays the clinic directly; the
 * patient copy is for information only. Printing a payable slip on it invites
 * the patient to pay an amount the insurer is also paying. The invoice's own
 * billing_type is authoritative here (same rule as the Sumex path) — the
 * request's documentType only distinguishes invoice / reminder / receipt.
 */
export function shouldPrintPaymentSlip(input: {
  billingType?: string | null;
  documentType?: string | null;
  remaining: number;
  iban?: string | null;
}): boolean {
  if (!(input.remaining > 0.004) || !input.iban) return false;
  if (input.documentType === "receipt") return false;
  if ((input.billingType || "").toUpperCase() === "TP") return false;
  return true;
}

export function fallbackDocumentTitle(input: {
  billingType?: string | null;
  documentType?: string | null;
  reminderLevel?: number | null;
  remaining: number;
}): string {
  if (input.documentType === "receipt" || input.remaining <= 0.004) return "Quittance";
  if (input.documentType === "reminder") {
    const level = Math.max(1, Math.min(3, Number(input.reminderLevel) || 1));
    return level === 1 ? "1er rappel" : `${level}e rappel`;
  }
  if ((input.billingType || "").toUpperCase() === "TP") return "Facture tiers payant";
  return "Facture";
}

/** "Dr" stored both in `title` and inside `name` printed as "Dr Dr …". */
function doctorDisplayName(doctor: Doctor): string {
  const name = (doctor.name || "").trim();
  const title = (doctor.title || "").trim();
  if (!title || name.toLowerCase().startsWith(title.toLowerCase())) return name;
  return `${title} ${name}`;
}

const amount = (value: number | null | undefined) => (Number(value) || 0).toFixed(2);

/** dd.mm.yyyy without going through the server timezone. */
export function formatSwissDate(value: string | null | undefined): string {
  if (!value) return "";
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${String(parsed.getDate()).padStart(2, "0")}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${parsed.getFullYear()}`;
}

// Maison TOA invoice template (A4, mm).
const CLINIC_PHONE = "+41 21 791 70 70";
const CLINIC_EMAIL = "info@maisontoa.com";
const ACCENT_FILL: [number, number, number] = [239, 233, 230];
const TEXT_X = 12;
const TABLE_LEFT = 10;
const TABLE_RIGHT = 200;
const COL = {
  description: 13,
  descriptionWidth: 64,
  code: 89.5,
  quantity: 111.5,
  price: 138,
  vat: 158,
  amount: 197,
};
const SLIP_TOP = A4_HEIGHT_MM - PAYMENT_PART_HEIGHT_MM;

export async function buildFallbackInvoicePdf({ invoice, lineItems, patient, biller, doctor, billingType, documentType, reminderLevel }: FallbackInvoicePdfInput): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const total = Number(invoice.total_amount) || 0;
  const paid = Number(invoice.paid_amount) || 0;
  const remaining = Math.max(0, total - paid);
  const isTiersPayant = (billingType || "").toUpperCase() === "TP";
  const isReceipt = documentType === "receipt" || remaining <= 0.004;

  // ── Letterhead: practitioner + clinic contact (left), logo (right) ──
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.25);
  pdf.line(TEXT_X, 9, 110, 9);

  pdf.setTextColor(0, 0, 0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(doctor?.name ? doctorDisplayName(doctor) : biller.name, TEXT_X, 14.5);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  let headY = 21;
  const specialty = (doctor?.specialty || "").trim();
  if (specialty) {
    // The FMH title is set in italics, as on the clinic letterhead.
    const fmh = specialty.match(/^(.*?)\s*\bFMH\b\s*$/);
    if (fmh) {
      pdf.text(fmh[1], TEXT_X, headY);
      const offset = pdf.getTextWidth(`${fmh[1]} `);
      pdf.setFont("helvetica", "italic");
      pdf.text("FMH", TEXT_X + offset, headY);
      pdf.setFont("helvetica", "normal");
    } else {
      pdf.text(specialty, TEXT_X, headY);
    }
    headY += 5.3;
  }
  const headerLines = [
    `${biller.street || ""} ${biller.streetNo || ""}`.trim(),
    `${biller.postalCode || ""} ${biller.town || ""}`.trim(),
    `Tél. ${biller.phone || CLINIC_PHONE}`,
    biller.email || CLINIC_EMAIL,
  ].filter(Boolean);
  for (const line of headerLines) {
    pdf.text(line, TEXT_X, headY);
    headY += 5.3;
  }
  const ids: string[] = [];
  if (doctor?.gln) ids.push(`GLN ${doctor.gln}`);
  if (doctor?.zsr) ids.push(`No RCC : ${doctor.zsr}`);
  if (ids.length) pdf.text(ids.join("   |   "), TEXT_X, headY);

  try {
    const logoHeight = 21;
    pdf.addImage(`data:image/png;base64,${MAISON_TOA_LOGO_PNG_BASE64}`, "PNG", 195 - logoHeight * MAISON_TOA_LOGO_ASPECT, 10.5, logoHeight * MAISON_TOA_LOGO_ASPECT, logoHeight);
  } catch (err) {
    console.error("[fallbackInvoicePdf] logo rendering failed:", err);
  }

  // ── Document number box + invoice/patient facts (left) ──
  pdf.setLineWidth(0.3);
  pdf.rect(TEXT_X, 69, 78, 8.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(`${fallbackDocumentTitle({ billingType, documentType, reminderLevel, remaining })} N° ${invoice.invoice_number}`, TEXT_X + 3.5, 74.8);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  const facts: Array<[string, string]> = [["Date :", formatSwissDate(invoice.invoice_date)]];
  if (documentType === "reminder" && invoice.due_date) facts.push(["Échéance :", formatSwissDate(invoice.due_date)]);
  facts.push(["Patient :", `${patient.first_name} ${patient.last_name}`.trim()]);
  if (patient.dob) facts.push(["Date de naissance :", formatSwissDate(patient.dob)]);
  let factY = 84;
  for (const [label, value] of facts) {
    pdf.text(label, TEXT_X + 3, factY);
    pdf.text(value, 50, factY);
    factY += 6;
  }

  // ── Addressee window (right) ──
  pdf.setFontSize(11);
  const salutation = patient.gender
    ? patient.gender.toLowerCase() === "female" ? "Madame" : patient.gender.toLowerCase() === "male" ? "Monsieur" : ""
    : "";
  const addressLines = [
    salutation,
    `${patient.first_name} ${patient.last_name}`.trim(),
    patient.street_address || "",
    `${patient.postal_code || ""} ${patient.town || ""}`.trim(),
  ].filter(Boolean);
  pdf.text(addressLines, 127, addressLines.length === 4 ? 67 : 72, { lineHeightFactor: 1.55 });

  // ── Service lines ──
  const drawTableHeader = (top: number) => {
    pdf.setFillColor(...ACCENT_FILL);
    pdf.rect(TABLE_LEFT, top, TABLE_RIGHT - TABLE_LEFT, 7, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    const baseline = top + 4.8;
    pdf.text("Description", COL.description, baseline);
    pdf.text("Code", COL.code, baseline, { align: "center" });
    pdf.text("Quantité", COL.quantity, baseline, { align: "center" });
    pdf.text("Prix (CHF)", COL.price, baseline, { align: "center" });
    pdf.text("TVA", COL.vat, baseline, { align: "center" });
    pdf.text("Montant (CHF)", COL.amount, baseline, { align: "right" });
    pdf.setFont("helvetica", "normal");
  };

  drawTableHeader(110);
  let y = 124;
  pdf.setFontSize(10);
  for (const item of lineItems) {
    const description = pdf.splitTextToSize(item.name || "Prestation", COL.descriptionWidth) as string[];
    const rowHeight = Math.max(8, description.length * 4.6 + 3.4);
    if (y + rowHeight > 270) {
      pdf.addPage();
      drawTableHeader(15);
      y = 29;
      pdf.setFontSize(10);
    }
    const vat = Number(item.vat_rate_value) || 0;
    pdf.text(description, COL.description, y);
    pdf.text(item.code || item.tardoc_code || "", COL.code, y, { align: "center" });
    pdf.text(amount(Number(item.quantity) || 1), COL.quantity, y, { align: "center" });
    pdf.text(amount(item.unit_price), COL.price, y, { align: "center" });
    if (vat > 0) pdf.text(`${vat}%`, COL.vat, y, { align: "center" });
    pdf.text(amount(item.total_price), COL.amount, y, { align: "right" });
    y += rowHeight;
  }

  // ── Totals ──
  const totalsHeight = 16 + (paid > 0 ? 16 : 0);
  if (y + totalsHeight > 280) {
    pdf.addPage();
    y = 20;
  }
  const ruleY = Math.max(y + 1, 133);
  pdf.setDrawColor(40, 40, 40);
  pdf.setLineWidth(0.3);
  pdf.line(TABLE_LEFT, ruleY, TABLE_RIGHT - 1, ruleY);

  const totalRow = (label: string, value: string, rowTop: number, emphasised: boolean) => {
    if (emphasised) {
      pdf.setFillColor(...ACCENT_FILL);
      pdf.rect(163, rowTop, 36, 7.5, "F");
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.text(label, 157, rowTop + 5.2, { align: "right" });
    pdf.setFontSize(emphasised ? 13.5 : 10.5);
    if (!emphasised) pdf.setFont("helvetica", "normal");
    pdf.text(value, COL.amount, rowTop + 5.4, { align: "right" });
  };
  let totalsY = ruleY + 3.5;
  if (paid > 0) {
    totalRow("TOTAL (CHF)", amount(total), totalsY, false);
    totalsY += 8;
    totalRow("Déjà payé (CHF)", `-${amount(paid)}`, totalsY, false);
    totalsY += 8;
    totalRow("SOLDE (CHF)", amount(remaining), totalsY, true);
  } else {
    totalRow("TOTAL (CHF)", amount(total), totalsY, true);
  }

  // ── Payment terms ──
  let notesY = Math.max(totalsY + 22, 158.5);
  pdf.setFontSize(10);
  if (isReceipt) {
    pdf.setFont("helvetica", "bold");
    pdf.text("Facture acquittée — merci.", TEXT_X - 2, notesY);
    pdf.setFont("helvetica", "normal");
    notesY += 5.5;
    pdf.text("Le justificatif de remboursement est à envoyer à votre assurance.", TEXT_X - 2, notesY);
  } else if (isTiersPayant) {
    pdf.setFont("helvetica", "bold");
    pdf.text("Copie pour le patient — ne pas payer ce document.", TEXT_X - 2, notesY);
    pdf.setFont("helvetica", "normal");
    notesY += 5.5;
    pdf.text("La facture a été transmise directement à votre assurance (tiers payant).", TEXT_X - 2, notesY);
  } else {
    pdf.setFont("helvetica", "bold");
    pdf.text("Total de la facture à payer à 30 jours.", TEXT_X - 2, notesY);
    notesY += 5.5;
    pdf.setFont("helvetica", "normal");
    // Viewers that substitute Helvetica render slightly wider than jsPDF's
    // metrics, so pad the gap before the bold run to keep the word space visible.
    const before = "SAUF pour les interventions au plus tard 1 semaine avant la ";
    pdf.text(before, TEXT_X - 2, notesY);
    const emphasisX = TEXT_X - 2 + pdf.getTextWidth(before) + 0.6;
    pdf.setFont("helvetica", "bold");
    pdf.text("date opératoire", emphasisX, notesY);
    const periodX = emphasisX + pdf.getTextWidth("date opératoire");
    pdf.setFont("helvetica", "normal");
    pdf.text(".", periodX, notesY);
    notesY += 5.5;
    pdf.text("Le justificatif de remboursement est à envoyer à votre assurance.", TEXT_X - 2, notesY);
  }

  // ── Swiss QR-bill payment part ──────────────────────────────────────────
  //
  // The Swiss Implementation Guidelines require a 210x105mm band at the foot
  // of the page (62mm receipt + 148mm payment part, cut lines, Swiss cross,
  // 46mm code); counters and banks refuse anything else. A Payrexx link is
  // deliberately NOT encoded: a URL QR is meaningless at a post office
  // counter. The online link still appears in the e-mail.
  let slipPdf: Buffer | null = null;
  if (biller.iban && shouldPrintPaymentSlip({ billingType, documentType, remaining, iban: biller.iban })) {
    const addressMatch = (patient.street_address || "").match(/^(.+?)\s+(\d+\S*)$/);
    try {
      const ibanClean = biller.iban.replace(/\s/g, "");
      slipPdf = await renderPaymentPartPdf({
        iban: ibanClean,
        amount: remaining,
        currency: "CHF",
        // QRR is only valid with a QR-IBAN; renderPaymentPartPdf drops it
        // otherwise rather than emitting an invalid combination.
        reference: buildQrrReference(invoice.invoice_number),
        creditor: {
          name: biller.name,
          street: biller.street,
          buildingNumber: biller.streetNo,
          postalCode: biller.postalCode,
          town: biller.town,
        },
        debtor: {
          name: `${patient.first_name} ${patient.last_name}`.trim(),
          street: addressMatch?.[1] || patient.street_address || null,
          buildingNumber: addressMatch?.[2] || null,
          postalCode: patient.postal_code || null,
          town: patient.town || null,
        },
        message: `Facture ${invoice.invoice_number}`,
        language: "FR",
      });

      // Never print the slip over the totals or payment terms.
      if (notesY > SLIP_TOP - 6) pdf.addPage();
    } catch (err) {
      // Never ship a malformed slip: a wrong-looking payment part is refused
      // at the counter just the same, but silently. Fall back to printing the
      // IBAN so the patient can at least pay by manual transfer.
      console.error("[fallbackInvoicePdf] QR-bill rendering failed:", err);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`IBAN: ${biller.iban}`, TEXT_X - 2, notesY + 10);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 60, 60);
      pdf.text(
        "Bulletin de versement indisponible — paiement par virement sur l’IBAN ci-dessus.",
        TEXT_X - 2,
        notesY + 16,
      );
      pdf.setTextColor(0, 0, 0);
    }
  }

  const invoicePdf = Buffer.from(pdf.output("arraybuffer"));
  if (!slipPdf) return invoicePdf;

  // Overlay the A4 page carrying the vector payment part on the last page.
  const out = await PDFDocument.load(invoicePdf);
  const [slip] = await out.embedPdf(slipPdf, [0]);
  const pages = out.getPages();
  const last = pages[pages.length - 1];
  last.drawPage(slip, { x: 0, y: 0, width: last.getWidth(), height: last.getHeight() });
  return Buffer.from(await out.save());
}
