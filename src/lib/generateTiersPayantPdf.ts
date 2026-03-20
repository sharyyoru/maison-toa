/**
 * Tiers Payant PDF Generator
 *
 * Generates the standard Swiss insurance billing PDF ("Facture Tiers Payant")
 * matching the Forum Datenaustausch format for TARDOC invoices.
 *
 * Layout matches the sample: header metadata, TARDOC service lines table,
 * VAT summary, totals, and QR code payment slip page.
 */

import jsPDF from "jspdf";
import QRCode from "qrcode";
import { generateSwissReference, formatSwissReferenceWithSpaces } from "@/lib/swissQrBill";
import type { Invoice, InvoiceLineItem } from "@/lib/invoiceTypes";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TiersPayantPatient = {
  first_name: string;
  last_name: string;
  dob: string | null;
  street_address: string | null;
  postal_code: string | null;
  town: string | null;
  gender: string | null;
  avs_number: string | null;
};

export type TiersPayantProvider = {
  name: string;
  gln: string | null;
  zsr: string | null;
  street: string | null;
  street_no: string | null;
  zip_code: string | null;
  city: string | null;
  canton: string | null;
  phone: string | null;
  iban: string | null;
  salutation: string | null;
  title: string | null;
};

export type TiersPayantInsurer = {
  name: string;
  gln: string | null;
  street: string | null;
  zip_code: string | null;
  city: string | null;
  pobox: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function num(v: number | null | undefined, decimals = 2): string {
  return (v ?? 0).toFixed(decimals);
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen - 1) + "…" : str;
}

// ─── Main Generator ──────────────────────────────────────────────────────────

export async function generateTiersPayantPdf(
  invoice: Invoice,
  lineItems: InvoiceLineItem[],
  patient: TiersPayantPatient,
  provider: TiersPayantProvider,
  insurer: TiersPayantInsurer | null,
): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth(); // 210
  const ml = 8;  // margin left
  const mr = 8;  // margin right
  const cw = pw - ml - mr; // content width

  const fs6 = 6, fs7 = 7, fs8 = 8, fs9 = 9;

  // Derived values
  const provGln = provider.gln || invoice.provider_gln || "";
  const provZsr = provider.zsr || invoice.provider_zsr || "";
  const provAddr = [provider.street, provider.street_no].filter(Boolean).join(" ");
  const provCity = [provider.zip_code, provider.city].filter(Boolean).join(" ");
  const provPhone = provider.phone || "";
  const insurerGln = insurer?.gln || invoice.insurance_gln || "";
  const insurerName = insurer?.name || invoice.insurance_name || "";
  const patientSsn = patient.avs_number || invoice.patient_ssn || "";
  const canton = invoice.treatment_canton || provider.canton || "GE";
  const lawType = invoice.health_insurance_law || "KVG";
  const lawLabel = lawType === "KVG" ? "LAMal" : lawType === "UVG" ? "LAA" : lawType === "IVG" ? "LAI" : lawType === "MVG" ? "LAM" : lawType;
  const billingType = invoice.billing_type || "TP";
  const treatmentReason = invoice.treatment_reason || "disease";
  const reasonLabel = treatmentReason === "disease" ? "Maladie" : treatmentReason === "accident" ? "Accident" : treatmentReason === "maternity" ? "Maternité" : "Prévention";
  const invoiceDate = fmtDateLong(invoice.invoice_date);
  const treatmentBegin = fmtDateLong(invoice.treatment_date);
  const treatmentEnd = fmtDateLong(invoice.treatment_date_end || invoice.treatment_date);
  const consultationPeriod = treatmentBegin === treatmentEnd ? treatmentBegin : `${treatmentBegin} - ${treatmentEnd}`;
  const totalAmount = invoice.total_amount || 0;
  const diagCodes = invoice.diagnosis_codes || [];
  const diagStr = diagCodes.map((d) => d.code).join(", ") || "-";
  const diagTypes = [...new Set(diagCodes.map((d) => d.type))];
  const diagTypeStr = diagTypes.length > 0 ? diagTypes.join("/") : "ICD";

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1: Facture Tiers Payant
  // ═══════════════════════════════════════════════════════════════════════════

  let y = 10;

  // ── Title ──
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("Copie: Facture Tiers Payant", ml, y);
  pdf.setFontSize(fs7);
  pdf.setFont("helvetica", "normal");
  pdf.text("Release 5.0/General®", pw - mr - 35, y);
  y += 4;
  pdf.setFontSize(fs6);
  pdf.text("Envoyer à l'assurance", pw - mr - 30, y);
  y += 6;

  // ── Horizontal line ──
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.3);
  pdf.line(ml, y, pw - mr, y);
  y += 4;

  // ── Document identification ──
  const labelX = ml;
  const valX = ml + 38;
  const col2LabelX = pw / 2 + 5;
  const col2ValX = pw / 2 + 38;

  function row(label: string, value: string, rightLabel?: string, rightValue?: string) {
    pdf.setFontSize(fs7);
    pdf.setFont("helvetica", "bold");
    pdf.text(label, labelX, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(truncate(value, 50), valX, y);
    if (rightLabel) {
      pdf.setFont("helvetica", "bold");
      pdf.text(rightLabel, col2LabelX, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(truncate(rightValue || "", 40), col2ValX, y);
    }
    y += 3.5;
  }

  const docId = `${invoice.invoice_number} / ${invoiceDate}`;
  row("Document", "Identification", "", "Page : 1");
  row("Auteur de la", `No GLN (B)`, "", "");
  y -= 3.5; // re-use line
  pdf.setFontSize(fs7);
  pdf.setFont("helvetica", "normal");
  pdf.text(provGln, valX + 20, y);
  pdf.text(provider.name || "", valX + 55, y);
  y += 3.5;
  row("facture", `No RCC (B)`, "", "");
  y -= 3.5;
  pdf.setFont("helvetica", "normal");
  pdf.text(provZsr, valX + 20, y);
  pdf.text(`${provAddr}`, valX + 55, y);
  y += 3.5;

  // Re-do the header section more cleanly
  y -= 14; // back up
  // Clear and redo
  y += 14;

  // Patient section
  y += 1;
  row("Patient", "Nom", "No GLN", insurerGln);
  row("", "Prénom", "", insurerName);
  y -= 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(fs7);
  pdf.text(patient.last_name || "", valX + 12, y);
  y += 3.5;
  pdf.text(patient.first_name || "", valX + 12, y);
  y += 3.5;

  row("", "Rue", "", insurer?.street || "");
  y -= 3.5;
  pdf.setFont("helvetica", "normal");
  pdf.text(patient.street_address || "", valX + 12, y);
  y += 3.5;

  row("", "NPA", "", insurer?.pobox || "");
  y -= 3.5;
  pdf.text(patient.postal_code || "", valX + 12, y);
  y += 3.5;

  row("", "Localité", "", [insurer?.zip_code, insurer?.city].filter(Boolean).join(" "));
  y -= 3.5;
  pdf.text(patient.town || "", valX + 12, y);
  y += 3.5;

  const dobStr = patient.dob ? fmtDateLong(patient.dob) : "";
  row("", "Date de naissance", "", "");
  y -= 3.5;
  pdf.text(dobStr, valX + 25, y);
  y += 3.5;

  const genderLabel = patient.gender === "female" ? "Femme / F" : patient.gender === "male" ? "Homme / M" : "";
  row("", "Sexe", "", "");
  y -= 3.5;
  pdf.text(genderLabel, valX + 12, y);
  y += 3.5;

  // Insurance metadata
  row("No AVS", patientSsn, "", "");
  row("Canton", canton, "", "");
  row("Copie", "oui", "", "");
  row("Type de", billingType === "TP" ? "TP" : "TG", "Date/No GaPrCh", "");
  row("remboursement", "", "", "");
  row("Loi", lawLabel, "Date / No de facture", `${invoiceDate} / ${invoice.invoice_number}`);
  row("Consultation", consultationPeriod, "Date / No de rappel", "");
  row("Motif consultation", reasonLabel, "", "");
  row("Rôle / Lieu", "Docteur/Doctoresse · Cabinet", "", "");

  y += 2;
  pdf.line(ml, y, pw - mr, y);
  y += 4;

  // ── Provider section ──
  pdf.setFontSize(fs7);
  pdf.setFont("helvetica", "bold");
  pdf.text("Fournisseur de", labelX, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`No GLN (P)`, valX, y);
  pdf.text(provGln, valX + 22, y);
  pdf.text(provider.name || "", valX + 55, y);
  const phoneStr = provPhone ? `Tél.: ${provPhone}` : "";
  pdf.text(phoneStr, pw - mr, y, { align: "right" });
  y += 3.5;
  pdf.setFont("helvetica", "bold");
  pdf.text("prestations", labelX, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`No GLN (L)`, valX, y);
  pdf.text(provGln, valX + 22, y);
  y += 3.5;
  pdf.text(`No RCC (P)`, valX, y);
  pdf.text(provZsr, valX + 22, y);
  pdf.text(`${provAddr} · ${provCity}`, valX + 55, y);
  y += 5;

  pdf.line(ml, y, pw - mr, y);
  y += 4;

  // ── Diagnostic ──
  pdf.setFontSize(fs7);
  pdf.setFont("helvetica", "bold");
  pdf.text("Diagnostic", labelX, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Test/${diagTypeStr}`, valX, y);
  pdf.text(diagStr, valX + 22, y);
  y += 5;

  pdf.line(ml, y, pw - mr, y);
  y += 4;

  // ── Commentaire ──
  pdf.setFont("helvetica", "bold");
  pdf.text("Commentaire", labelX, y);
  y += 4;

  // ── Service lines header ──
  pdf.setFontSize(fs7);
  pdf.setFont("helvetica", "bold");
  pdf.text("Paramètres", labelX, y);
  pdf.setFont("helvetica", "normal");
  pdf.text("No GLN / RCC / Section", valX, y);
  pdf.text("Adresse", valX + 55, y);
  y += 3.5;
  pdf.text(`1 - Fournisseur de prestations`, labelX, y);
  pdf.text(`${provGln}/${provZsr}`, valX + 12, y);
  pdf.text(`${provider.name || ""} ${provAddr} · ${provCity}`, valX + 55, y);
  y += 5;

  // ── Service lines table ──
  const tableTop = y;

  // Column positions (tight fit for A4)
  const colDate = ml;
  const colTarif = ml + 16;
  const colCode = ml + 24;
  const colRef = ml + 45;
  const colGr = ml + 65;
  const colCs = ml + 70;
  const colQty = ml + 77;
  const colPtPM = ml + 90;
  const colFPM = ml + 103;
  const colPtPT = ml + 113;
  const colFPT = ml + 126;
  const colERT = ml + 136;
  const colMontant = pw - mr;

  // Header row
  pdf.setFillColor(240, 240, 240);
  pdf.rect(ml, y - 1, cw, 4, "F");
  pdf.setFontSize(fs6);
  pdf.setFont("helvetica", "bold");
  pdf.text("Date", colDate, y + 2);
  pdf.text("Tarif", colTarif, y + 2);
  pdf.text("Code tarif", colCode, y + 2);
  pdf.text("Code de réf.", colRef, y + 2);
  pdf.text("Gr", colGr, y + 2);
  pdf.text("Cs", colCs, y + 2);
  pdf.text("Qté", colQty, y + 2);
  pdf.text("Pt PM/Prix", colPtPM, y + 2);
  pdf.text("f PM", colFPM, y + 2);
  pdf.text("Pt PT", colPtPT, y + 2);
  pdf.text("f PT", colFPT, y + 2);
  pdf.text("E R T", colERT, y + 2);
  pdf.text("Montant", colMontant, y + 2, { align: "right" });
  y += 5;

  // Service rows
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(fs6);

  const tardocLines = lineItems.filter((item) => item.tariff_code === 7 || item.tardoc_code);

  for (const item of tardocLines) {
    const dateStr = fmtDate(item.date_begin || invoice.treatment_date);
    const tariffType = String(item.tariff_code || 7).padStart(3, "0");
    const code = item.tardoc_code || item.code || "";
    const refCode = item.ref_code || "";
    const session = String(item.session_number || 1);
    const qty = num(item.quantity, 2);
    const ptPM = num(item.tp_al, 2);
    const fPM = num(item.tp_al_value, 2);
    const ptPT = num(item.tp_tl, 2);
    const fPT = num(item.tp_tl_value, 2);
    const ert = `${item.external_factor_mt ?? 1} ${item.external_factor_tt ?? 1} ${item.service_attributes ?? 0}`;
    const montant = num(item.total_price, 2);

    // Code line
    pdf.text(dateStr, colDate, y);
    pdf.text(tariffType, colTarif, y);
    pdf.text(code, colCode, y);
    pdf.text(refCode, colRef, y);
    pdf.text("", colGr, y);
    pdf.text(session, colCs, y);
    pdf.text(qty, colQty, y);
    pdf.text(ptPM, colPtPM, y);
    pdf.text(fPM, colFPM, y);
    pdf.text(ptPT, colPtPT, y);
    pdf.text(fPT, colFPT, y);
    pdf.text(ert, colERT, y);
    pdf.text(montant, colMontant, y, { align: "right" });
    y += 3;

    // Description line
    pdf.setFontSize(5.5);
    const descText = truncate(item.name || "", 120);
    pdf.text(descText, colCode, y);
    pdf.setFontSize(fs6);
    y += 3.5;

    // Page break check
    if (y > 250) {
      pdf.addPage();
      y = 15;
    }
  }

  // ACF flat rate lines (tariff type 005)
  const flatRateLines = lineItems.filter((item) => item.tariff_code === 5 || item.tariff_code === 590);
  for (const item of flatRateLines) {
    const dateStr = fmtDate(item.date_begin || invoice.treatment_date);
    const tariffType = "005";
    const acfExtFactor = item.external_factor_mt ?? 1;
    const acfBaseTP = item.tp_al || item.unit_price;
    const sideCode = item.side_type === 1 ? "L" : item.side_type === 2 ? "R" : item.side_type === 3 ? "B" : "";
    pdf.text(dateStr, colDate, y);
    pdf.text(tariffType, colTarif, y);
    pdf.text(item.code || "", colCode, y);
    pdf.text(item.ref_code || "", colRef, y);
    pdf.text(sideCode, colGr, y);
    pdf.text(String(item.session_number || 1), colCs, y);
    pdf.text(num(item.quantity), colQty, y);
    pdf.text(num(acfBaseTP), colPtPM, y);
    pdf.text("1.00", colFPM, y);
    pdf.text("", colPtPT, y);
    pdf.text("", colFPT, y);
    pdf.text(acfExtFactor !== 1 ? num(acfExtFactor) : "", colERT, y);
    pdf.text(num(item.total_price), colMontant, y, { align: "right" });
    y += 3;
    pdf.setFontSize(5.5);
    pdf.text(truncate(item.name || "", 120), colCode, y);
    pdf.setFontSize(fs6);
    y += 3.5;

    if (y > 250) {
      pdf.addPage();
      y = 15;
    }
  }

  // Non-TARDOC, non-flat-rate lines (regular services)
  const regularLines = lineItems.filter((item) => !(item.tariff_code === 7 || item.tardoc_code || item.tariff_code === 5 || item.tariff_code === 590));
  for (const item of regularLines) {
    const dateStr = fmtDate(item.date_begin || invoice.treatment_date);
    pdf.text(dateStr, colDate, y);
    pdf.text("000", colTarif, y);
    pdf.text(item.code || "", colCode, y);
    pdf.text("", colRef, y);
    pdf.text("", colGr, y);
    pdf.text("1", colCs, y);
    pdf.text(num(item.quantity), colQty, y);
    pdf.text(num(item.unit_price), colPtPM, y);
    pdf.text("", colFPM, y);
    pdf.text("", colPtPT, y);
    pdf.text("", colFPT, y);
    pdf.text("", colERT, y);
    pdf.text(num(item.total_price), colMontant, y, { align: "right" });
    y += 3;
    pdf.setFontSize(5.5);
    pdf.text(truncate(item.name || "", 120), colCode, y);
    pdf.setFontSize(fs6);
    y += 3.5;
  }

  // ── Sous-total ──
  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(fs7);
  pdf.text("Sous-total", colERT - 10, y);
  pdf.text(num(totalAmount), colMontant, y, { align: "right" });
  y += 8;

  // ── VAT summary ──
  if (y > 240) { pdf.addPage(); y = 15; }

  pdf.setFontSize(fs7);
  pdf.setFont("helvetica", "bold");
  pdf.text("Code", ml + 20, y);
  pdf.text("Taux", ml + 32, y);
  pdf.text("Montant", ml + 48, y);
  pdf.text("TVA", ml + 68, y);
  pdf.text("No TVA :", ml + 95, y);
  pdf.text("Montant total :", pw - mr - 30, y);
  pdf.text(num(totalAmount), pw - mr, y, { align: "right" });
  y += 4;

  pdf.setFont("helvetica", "normal");
  pdf.text("0", ml + 22, y);
  pdf.text("0.00", ml + 32, y);
  pdf.text(num(totalAmount), ml + 48, y);
  pdf.text("0.00", ml + 68, y);
  pdf.text("Devise : CHF", ml + 95, y);
  y += 5;

  pdf.setFont("helvetica", "bold");
  pdf.text("Montant de la", pw - mr - 30, y);
  y += 3.5;
  pdf.text("facture :", pw - mr - 30, y);
  const amountDue = Math.round(totalAmount * 20) / 20; // Swiss rounding to 5 Rappen
  pdf.text(num(amountDue), pw - mr, y, { align: "right" });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: QR Payment Slip
  // ═══════════════════════════════════════════════════════════════════════════

  pdf.addPage();
  y = 10;

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("Feuille de code QR Tiers Payant", ml, y);
  pdf.setFontSize(fs7);
  pdf.setFont("helvetica", "normal");
  pdf.text("Release 5.0/General®", pw - mr - 35, y);
  y += 4;
  pdf.text("Envoyer à l'assurance", pw - mr - 30, y);
  y += 6;

  pdf.line(ml, y, pw - mr, y);
  y += 4;

  // Document and patient info
  pdf.setFontSize(fs7);
  pdf.setFont("helvetica", "bold");
  pdf.text("Document:", ml, y);
  pdf.setFont("helvetica", "normal");
  const docIdLine = `${invoice.invoice_number} / ${invoiceDate}`;
  pdf.text(docIdLine, ml + 22, y);
  y += 4;

  pdf.setFont("helvetica", "bold");
  pdf.text("Patient:", ml, y);
  pdf.setFont("helvetica", "normal");
  const patientLine = [
    `${patient.gender === "female" ? "Madame" : "Monsieur"} ${patient.last_name} ${patient.first_name}`,
    patient.street_address,
    [patient.postal_code, patient.town].filter(Boolean).join(" "),
    patient.dob ? `Date de naissance: ${fmtDateLong(patient.dob)}` : null,
    `Sexe: ${patient.gender === "female" ? "Femme" : "Homme"} / ${patient.gender === "female" ? "F" : "M"}`,
  ].filter(Boolean).join(" · ");
  pdf.text(truncate(patientLine, 140), ml + 22, y);
  y += 10;

  // Generate 3 QR codes (standard for Tiers Payant)
  const provIban = provider.iban || "CH0930788000050249289";
  const swissRef = generateSwissReference(invoice.invoice_number);

  // QR Code 1: Payment (Swiss QR Bill data)
  const qrPaymentData = [
    "SPC", "0200", "1",
    provIban,
    "K", provider.name || "Aesthetics Clinic XT SA", provAddr, provCity, "", "", "CH",
    "", "", "", "", "", "", "",
    num(amountDue), "CHF",
    "K", `${patient.first_name} ${patient.last_name}`, patient.street_address || "", [patient.postal_code, patient.town].filter(Boolean).join(" "), "", "", "CH",
    "QRR", swissRef,
    `Invoice ${invoice.invoice_number}`,
    "EPD",
  ].join("\n");

  const qr1 = await QRCode.toDataURL(qrPaymentData, { width: 300, margin: 1, errorCorrectionLevel: "M" });

  // QR Code 2: Invoice XML reference
  const qr2Data = JSON.stringify({
    type: "invoice_ref",
    id: invoice.invoice_number,
    date: invoice.invoice_date,
    amount: totalAmount,
    currency: "CHF",
    biller_gln: provGln,
    insurance_gln: insurerGln,
  });
  const qr2 = await QRCode.toDataURL(qr2Data, { width: 300, margin: 1 });

  // QR Code 3: Diagnostic/treatment reference
  const qr3Data = JSON.stringify({
    type: "treatment_ref",
    patient_ssn: patientSsn,
    canton: canton,
    law: lawType,
    reason: treatmentReason,
    diagnosis: diagCodes,
    date_begin: invoice.treatment_date,
    date_end: invoice.treatment_date_end,
  });
  const qr3 = await QRCode.toDataURL(qr3Data, { width: 300, margin: 1 });

  // Place QR codes
  const qrSize = 45;
  const qrSpacing = (cw - 3 * qrSize) / 4;
  const qrY = y;

  pdf.addImage(qr1, "PNG", ml + qrSpacing, qrY, qrSize, qrSize);
  pdf.addImage(qr2, "PNG", ml + 2 * qrSpacing + qrSize, qrY, qrSize, qrSize);
  pdf.addImage(qr3, "PNG", ml + 3 * qrSpacing + 2 * qrSize, qrY, qrSize, qrSize);

  const qrLabelY = qrY + qrSize + 4;
  pdf.setFontSize(fs8);
  pdf.setFont("helvetica", "bold");
  pdf.text("QR-Code 1", ml + qrSpacing + qrSize / 2, qrLabelY, { align: "center" });
  pdf.text("QR-Code 2", ml + 2 * qrSpacing + qrSize + qrSize / 2, qrLabelY, { align: "center" });
  pdf.text("QR-Code 3", ml + 3 * qrSpacing + 2 * qrSize + qrSize / 2, qrLabelY, { align: "center" });

  return Buffer.from(pdf.output("arraybuffer"));
}
