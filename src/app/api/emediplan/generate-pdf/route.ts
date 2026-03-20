"use server";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { randomUUID } from "crypto";
import { gzipSync } from "zlib";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// CHMED16A Types
type CHMED16APatient = {
  FName?: string;
  LName?: string;
  BDt?: string;
  Gender?: number;
  Street?: string;
  Zip?: string;
  City?: string;
  Lng?: string;
  Phone?: string;
  Email?: string;
};

type CHMED16APosology = {
  DtFrom: string;
  DtTo?: string;
  D?: number[];
  InRes?: number;
};

type CHMED16AMedicament = {
  Id: string;
  IdType: number;
  Pos?: CHMED16APosology[];
  Unit?: string;
  TkgRsn?: string;
  AppInstr?: string;
  AutoMed: number;
  PrscbBy?: string;
};

type CHMED16AMedication = {
  Patient: CHMED16APatient;
  Medicaments: CHMED16AMedicament[];
  MedType: number;
  Id: string;
  Auth: string;
  Dt: string;
  Rmk?: string;
};

type PatientData = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  dob: string | null;
  street_address: string | null;
  postal_code: string | null;
  town: string | null;
};

type PatientPrescription = {
  journal_entry_id: string;
  patient_id: string;
  product_name: string;
  product_no: number | null;
  product_type: string | null;
  prescription_sheet_id: string | null;
  amount_morning: string | null;
  amount_noon: string | null;
  amount_evening: string | null;
  amount_night: string | null;
  intake_from_date: string | null;
  intake_to_date: string | null;
  intake_note: string | null;
  decision_summary: string | null;
  show_in_mediplan: boolean | null;
  active: boolean | null;
  quantity: number | null;
  packaging: string | null;
};

type ProviderData = {
  id: string;
  name: string;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  gln: string | null;
  zsr: string | null;
  street: string | null;
  street_no: string | null;
  zip_code: string | null;
  city: string | null;
  canton: string | null;
  salutation: string | null;
  title: string | null;
};

type ClinicSettings = {
  doctor_name: string | null;
  doctor_gln: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  clinic_postal_code: string | null;
  clinic_city: string | null;
  clinic_phone: string | null;
  rcc_number: string | null;
};

function parseAmount(amount: string | null): number {
  if (!amount || amount === "-" || amount === "") return 0;
  const parsed = parseFloat(amount.replace(",", "."));
  return isNaN(parsed) ? 0 : parsed;
}

function formatDateISO(dateStr: string | null): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return new Date().toISOString().split("T")[0];
  return date.toISOString().split("T")[0];
}

function mapGender(gender: string | null): number | undefined {
  if (!gender) return undefined;
  const g = gender.toLowerCase();
  if (g === "male" || g === "m" || g === "homme") return 1;
  if (g === "female" || g === "f" || g === "femme") return 2;
  return undefined;
}

function buildCHMED16AObject(
  patient: PatientData,
  medications: PatientPrescription[],
  clinicSettings: ClinicSettings
): CHMED16AMedication {
  const now = new Date();
  const isoDateTime = now.toISOString().replace("Z", "+00:00");

  const chmedPatient: CHMED16APatient = {
    FName: patient.first_name || undefined,
    LName: patient.last_name || undefined,
    BDt: patient.dob ? formatDateISO(patient.dob) : undefined,
    Gender: mapGender(patient.gender),
    Street: patient.street_address || undefined,
    Zip: patient.postal_code || undefined,
    City: patient.town || undefined,
    Lng: "fr", // Default to French for Swiss clinic
    Phone: patient.phone || undefined,
    Email: patient.email || undefined,
  };

  // Remove undefined fields
  Object.keys(chmedPatient).forEach((key) => {
    if (chmedPatient[key as keyof CHMED16APatient] === undefined) {
      delete chmedPatient[key as keyof CHMED16APatient];
    }
  });

  const medicaments: CHMED16AMedicament[] = medications
    .filter((med) => med.show_in_mediplan !== false)
    .map((med) => {
      const dosage: number[] = [
        parseAmount(med.amount_morning),
        parseAmount(med.amount_noon),
        parseAmount(med.amount_evening),
        parseAmount(med.amount_night),
      ];

      const posology: CHMED16APosology = {
        DtFrom: formatDateISO(med.intake_from_date),
        D: dosage,
      };

      const medicament: CHMED16AMedicament = {
        Id: med.product_no?.toString() || med.product_name,
        IdType: med.product_no ? 3 : 1, // 3 = Pharmacode, 1 = None (free text)
        Pos: [posology],
        Unit: "pce", // Default unit
        TkgRsn: med.decision_summary || undefined,
        AppInstr: med.intake_note || undefined,
        AutoMed: 0, // Not self-medication
        PrscbBy: clinicSettings.doctor_gln || clinicSettings.doctor_name || undefined,
      };

      // Remove undefined fields
      Object.keys(medicament).forEach((key) => {
        if (medicament[key as keyof CHMED16AMedicament] === undefined) {
          delete medicament[key as keyof CHMED16AMedicament];
        }
      });

      return medicament;
    });

  const medication: CHMED16AMedication = {
    Patient: chmedPatient,
    Medicaments: medicaments,
    MedType: 1, // 1 = MedicationPlan
    Id: randomUUID(),
    Auth: clinicSettings.doctor_gln || clinicSettings.doctor_name || "Clinic",
    Dt: isoDateTime,
  };

  return medication;
}

async function generateQRCode(data: string): Promise<string> {
  try {
    // CHMED16A1 format per spec: prefix + Base64(gzip(JSON))
    const chmedPrefix = "CHMED16A1";
    const gzipped = gzipSync(Buffer.from(data, "utf-8"));
    const base64Data = gzipped.toString("base64");
    const fullData = `${chmedPrefix}${base64Data}`;
    
    const qrDataUrl = await QRCode.toDataURL(fullData, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 200,
    });
    return qrDataUrl;
  } catch (error) {
    console.error("QR Code generation error:", error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientId, tabType, providerId, prescriptionSheetId } = body;

    if (!patientId) {
      return NextResponse.json({ error: "Patient ID is required" }, { status: 400 });
    }

    // Validate tabType - defaults to showing all if not specified
    const validTabType = tabType === "medicine" || tabType === "prescription" ? tabType : null;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch patient data
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, first_name, last_name, email, phone, gender, dob, street_address, postal_code, town")
      .eq("id", patientId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Fetch provider data if providerId is provided
    let provider: ProviderData | null = null;
    if (providerId) {
      const { data: providerData } = await supabase
        .from("providers")
        .select("id, name, specialty, email, phone, gln, zsr, street, street_no, zip_code, city, canton, salutation, title")
        .eq("id", providerId)
        .single();
      provider = providerData as ProviderData | null;
    }

    // If no provider specified, try to get the first provider
    if (!provider) {
      const { data: defaultProvider } = await supabase
        .from("providers")
        .select("id, name, specialty, email, phone, gln, zsr, street, street_no, zip_code, city, canton, salutation, title")
        .limit(1)
        .single();
      provider = defaultProvider as ProviderData | null;
    }

    // Fetch active medications
    const { data: medications, error: medsError } = await supabase
      .from("patient_prescriptions")
      .select("*")
      .eq("patient_id", patientId)
      .eq("active", true)
      .order("intake_from_date", { ascending: false });

    if (medsError) {
      return NextResponse.json({ error: "Failed to fetch medications" }, { status: 500 });
    }

    // Filter medications based on tab type (same logic as MedicationCard.tsx)
    let filteredMeds = (medications || []).filter(
      (med: PatientPrescription) => med.show_in_mediplan !== false
    );

    if (validTabType === "prescription") {
      // Prescription tab: only items with prescription_sheet_id
      filteredMeds = filteredMeds.filter(
        (med: PatientPrescription) => med.prescription_sheet_id !== null
      );
      
      // If a specific prescriptionSheetId is provided, filter to only that prescription
      if (prescriptionSheetId) {
        filteredMeds = filteredMeds.filter(
          (med: PatientPrescription) => med.prescription_sheet_id === prescriptionSheetId
        );
      }
    } else if (validTabType === "medicine") {
      // Medicine tab: no prescription_sheet_id AND product_type is MEDICATION
      filteredMeds = filteredMeds.filter(
        (med: PatientPrescription) =>
          med.prescription_sheet_id === null && med.product_type === "MEDICATION"
      );
    }

    const mediplanMeds = filteredMeds;

    if (mediplanMeds.length === 0) {
      return NextResponse.json({ error: "No medications found for eMediplan" }, { status: 400 });
    }

    // Fetch clinic settings (as fallback)
    const { data: settingsData } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", [
        "doctor_name",
        "doctor_gln",
        "clinic_name",
        "clinic_address",
        "clinic_postal_code",
        "clinic_city",
        "clinic_phone",
        "rcc_number",
      ]);

    const settings: ClinicSettings = {
      doctor_name: null,
      doctor_gln: null,
      clinic_name: null,
      clinic_address: null,
      clinic_postal_code: null,
      clinic_city: null,
      clinic_phone: null,
      rcc_number: null,
    };

    if (settingsData) {
      for (const s of settingsData) {
        if (s.key in settings) {
          settings[s.key as keyof ClinicSettings] = s.value;
        }
      }
    }

    // Build CHMED16A object
    const chmedObject = buildCHMED16AObject(patient as PatientData, mediplanMeds, settings);
    const chmedJson = JSON.stringify(chmedObject);

    // Generate QR code
    const qrCodeDataUrl = await generateQRCode(chmedJson);

    const now = new Date();
    const emissionDate = now.toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const emissionTime = now.toLocaleTimeString("fr-CH", {
      hour: "2-digit",
      minute: "2-digit",
    });

    let pdfBase64: string;
    let filename: string;

    // Generate different PDF formats based on tab type
    if (validTabType === "prescription") {
      // ========== ORDONNANCE FORMAT (Portrait) ==========
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      let yPos = margin;

      // === HEADER SECTION ===
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "normal");

      const doctorTitle = provider?.title || provider?.salutation || "Docteur";
      const doctorName = provider?.name || settings.doctor_name || "Docteur";
      const doctorFullName = `${doctorTitle} ${doctorName}`.trim();
      
      pdf.text(doctorFullName, margin, yPos);
      yPos += 5;

      if (provider?.street) {
        const streetFull = provider.street_no 
          ? `${provider.street} ${provider.street_no}` 
          : provider.street;
        pdf.text(streetFull, margin, yPos);
        yPos += 5;
      } else if (settings.clinic_address) {
        pdf.text(settings.clinic_address, margin, yPos);
        yPos += 5;
      }

      if (provider?.zip_code || provider?.city) {
        pdf.text(`${provider.zip_code || ""} ${provider.city || ""}`.trim(), margin, yPos);
        yPos += 5;
      } else if (settings.clinic_postal_code || settings.clinic_city) {
        pdf.text(`${settings.clinic_postal_code || ""} ${settings.clinic_city || ""}`.trim(), margin, yPos);
        yPos += 5;
      }

      pdf.setTextColor(0, 128, 128);
      if (provider?.gln) {
        pdf.text(`No RCC ${provider.gln}`, margin, yPos);
        yPos += 5;
      } else if (settings.rcc_number) {
        pdf.text(`No RCC ${settings.rcc_number}`, margin, yPos);
        yPos += 5;
      }

      pdf.setTextColor(0, 0, 0);
      if (provider?.phone) {
        pdf.text(provider.phone, margin, yPos);
        yPos += 5;
      } else if (settings.clinic_phone) {
        pdf.text(settings.clinic_phone, margin, yPos);
        yPos += 5;
      }

      if (provider?.zsr) {
        pdf.text(`ZSR: ${provider.zsr}`, margin, yPos);
      }

      // QR Code (top-right)
      const qrSize = 40;
      const qrX = pageWidth - margin - qrSize;
      const qrY = margin;
      pdf.addImage(qrCodeDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

      pdf.setFontSize(7);
      pdf.setTextColor(100, 100, 100);
      const qrDescription = "Grâce au QR code, vous pouvez lire les données de l'ordonnance dans votre système et ne devez pas les ressaisir manuellement.";
      const qrLines = pdf.splitTextToSize(qrDescription, qrSize);
      pdf.text(qrLines, qrX, qrY + qrSize + 3);

      // === TITLE SECTION ===
      yPos = margin + 55;
      pdf.setFontSize(18);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.text("Ordonnance", margin, yPos);
      
      const titleWidth = pdf.getTextWidth("Ordonnance");
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPos + 1, margin + titleWidth, yPos + 1);

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.text(emissionDate, pageWidth - margin, yPos, { align: "right" });

      yPos += 15;

      // === PATIENT SECTION ===
      const patientLastName = (patient.last_name || "").toUpperCase();
      const patientFirstName = patient.first_name || "";
      const patientDob = patient.dob ? new Date(patient.dob).toLocaleDateString("fr-CH") : "";
      const patientGenderText = patient.gender === "female" || patient.gender === "Female" 
        ? "féminin" 
        : patient.gender === "male" || patient.gender === "Male" ? "masculin" : "";

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${patientLastName} ${patientFirstName}, ${patientDob}, ${patientGenderText}`, margin, yPos);
      yPos += 5;

      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 128, 128);
      const patientStreet = patient.street_address || "";
      const patientCityFull = `${patient.postal_code || ""} ${patient.town || ""}`.trim();
      if (patientStreet || patientCityFull) {
        pdf.text([patientStreet, patientCityFull].filter(Boolean).join(", "), margin, yPos);
      }

      yPos += 15;
      pdf.setTextColor(0, 0, 0);

      // === MEDICATIONS LIST ===
      for (const med of mediplanMeds) {
        if (yPos > pageHeight - 40) {
          pdf.addPage();
          yPos = margin;
        }

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text(med.product_name || "Unknown", margin, yPos);

        const dosageText = `${med.amount_morning || "0"}-${med.amount_noon || "0"}-${med.amount_evening || "0"}-${med.amount_night || "0"} (pièce)`;
        pdf.setFont("helvetica", "normal");
        pdf.text(dosageText, pageWidth - margin, yPos, { align: "right" });

        yPos += 5;
        pdf.setTextColor(0, 128, 128);
        pdf.setFontSize(9);
        const packagingText = med.intake_note ? `${med.quantity || 1} ${med.intake_note}` : `${med.quantity || 1}x`;
        pdf.text(packagingText, margin, yPos);

        if (med.intake_to_date) {
          pdf.text(`Durée du traitement, jusqu'au: ${new Date(med.intake_to_date).toLocaleDateString("fr-CH")}`, pageWidth - margin, yPos, { align: "right" });
        }

        yPos += 12;
        pdf.setTextColor(0, 0, 0);
        pdf.setDrawColor(220, 220, 220);
        pdf.setLineWidth(0.2);
        pdf.line(margin, yPos - 5, pageWidth - margin, yPos - 5);
      }

      // === FOOTER ===
      const footerY = pageHeight - 15;
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Patient: ${patientLastName} ${patientFirstName}, ${patientDob}, ${patientGenderText}`, margin, footerY);
      pdf.text("1/1", pageWidth - margin, footerY, { align: "right" });

      pdfBase64 = Buffer.from(pdf.output("arraybuffer")).toString("base64");
      filename = `ordonnance_${patient.last_name}_${patient.first_name}_${emissionDate.replace(/\./g, "-")}.pdf`;

    } else {
      // ========== EMEDIPLAN FORMAT (Landscape with table) ==========
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      // Header - eMediplan logo
      pdf.setFontSize(20);
      pdf.setTextColor(0, 150, 200);
      pdf.setFont("helvetica", "bold");
      pdf.text("eMediplan", margin, yPos + 8);
      
      pdf.setFontSize(9);
      pdf.text("Le plan de médication suisse", margin, yPos + 14);

      // Patient info
      const patientName = `${patient.last_name?.toUpperCase() || ""} ${patient.first_name || ""}`.trim();
      const patientDob = patient.dob ? new Date(patient.dob).toLocaleDateString("fr-CH") : "";
      const patientGender = patient.gender === "female" || patient.gender === "Female" ? "(F)" : patient.gender === "male" || patient.gender === "Male" ? "(M)" : "";

      pdf.setFontSize(14);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.text(patientName, 85, yPos + 5);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${patientDob} ${patientGender}`, 85, yPos + 11);
      if (patient.street_address || patient.town) {
        pdf.text([patient.street_address, patient.town].filter(Boolean).join(", "), 85, yPos + 16);
      }

      // Provider info
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text("Imprimé par :", 170, yPos + 2);
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(9);
      pdf.text(settings.doctor_name || "Docteur", 170, yPos + 7);
      if (settings.clinic_address) pdf.text(settings.clinic_address, 170, yPos + 12);
      if (settings.clinic_postal_code || settings.clinic_city) {
        pdf.text(`${settings.clinic_postal_code || ""} ${settings.clinic_city || ""}`.trim(), 170, yPos + 17);
      }

      // QR Code
      const qrSize = 35;
      pdf.addImage(qrCodeDataUrl, "PNG", pageWidth - margin - qrSize, yPos, qrSize, qrSize);

      yPos += 42;
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Date d'émission: ${emissionDate} ${emissionTime}`, margin, yPos);
      yPos += 8;

      // Table header
      const colWidths = { medicament: 65, matin: 14, midi: 14, soir: 14, nuit: 14, unite: 14, de: 22, jusqua: 22, instructions: 35, raison: 25, prescrit: 28 };
      let tableX = margin;

      pdf.setFillColor(240, 240, 240);
      pdf.rect(margin, yPos, pageWidth - 2 * margin, 8, "F");
      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "bold");

      pdf.text("Médicament", tableX + 2, yPos + 5); tableX += colWidths.medicament;
      pdf.text("Matin", tableX + 1, yPos + 5); tableX += colWidths.matin;
      pdf.text("Midi", tableX + 1, yPos + 5); tableX += colWidths.midi;
      pdf.text("Soir", tableX + 1, yPos + 5); tableX += colWidths.soir;
      pdf.text("Nuit", tableX + 1, yPos + 5); tableX += colWidths.nuit;
      pdf.text("Unité", tableX + 1, yPos + 5); tableX += colWidths.unite;
      pdf.text("De", tableX + 1, yPos + 5); tableX += colWidths.de;
      pdf.text("Jusqu'à", tableX + 1, yPos + 5); tableX += colWidths.jusqua;
      pdf.text("Instructions", tableX + 1, yPos + 5); tableX += colWidths.instructions;
      pdf.text("Raison", tableX + 1, yPos + 5); tableX += colWidths.raison;
      pdf.text("Prescrit par", tableX + 1, yPos + 5);

      yPos += 10;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos - 2, pageWidth - margin, yPos - 2);

      // Table rows
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);

      for (const med of mediplanMeds) {
        tableX = margin;
        if (yPos > pageHeight - 25) {
          pdf.addPage();
          yPos = margin;
        }

        pdf.text((med.product_name || "Unknown").substring(0, 50), tableX + 2, yPos + 4); tableX += colWidths.medicament;
        pdf.text(med.amount_morning || "-", tableX + 3, yPos + 4); tableX += colWidths.matin;
        pdf.text(med.amount_noon || "-", tableX + 3, yPos + 4); tableX += colWidths.midi;
        pdf.text(med.amount_evening || "-", tableX + 3, yPos + 4); tableX += colWidths.soir;
        pdf.text(med.amount_night || "-", tableX + 3, yPos + 4); tableX += colWidths.nuit;
        pdf.text("pce", tableX + 1, yPos + 4); tableX += colWidths.unite;
        pdf.text(med.intake_from_date ? new Date(med.intake_from_date).toLocaleDateString("fr-CH") : "-", tableX + 1, yPos + 4); tableX += colWidths.de;
        pdf.text("-", tableX + 1, yPos + 4); tableX += colWidths.jusqua;
        pdf.text((med.intake_note || "-").substring(0, 25), tableX + 1, yPos + 4); tableX += colWidths.instructions;
        pdf.text((med.decision_summary || "-").substring(0, 18), tableX + 1, yPos + 4); tableX += colWidths.raison;
        pdf.text(settings.doctor_name || "-", tableX + 1, yPos + 4);

        yPos += 8;
        pdf.setDrawColor(230, 230, 230);
        pdf.line(margin, yPos - 1, pageWidth - margin, yPos - 1);
      }

      // Footer
      yPos = pageHeight - 12;
      pdf.setFontSize(7);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${patient.last_name?.toUpperCase() || ""} ${patient.first_name || ""} (${patientDob})`, margin, yPos);
      pdf.text("Plan de médication by HCI Solutions AG (V1.0)", pageWidth / 2, yPos, { align: "center" });
      pdf.text("Page 1 de 1", pageWidth - margin, yPos, { align: "right" });

      pdfBase64 = Buffer.from(pdf.output("arraybuffer")).toString("base64");
      filename = `emediplan_${patient.last_name}_${patient.first_name}_${emissionDate.replace(/\./g, "-")}.pdf`;
    }

    return NextResponse.json({
      success: true,
      pdf: pdfBase64,
      filename: filename,
      chmedObject: chmedObject,
    });
  } catch (error) {
    console.error("eMediplan PDF generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate eMediplan PDF" },
      { status: 500 }
    );
  }
}
