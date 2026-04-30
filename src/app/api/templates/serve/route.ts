import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Format date in different styles
function formatDate(date: Date, style: "long" | "short" | "numeric" = "long", locale: string = "fr-CH"): string {
  switch (style) {
    case "long":
      return date.toLocaleDateString(locale, { 
        weekday: "long", 
        year: "numeric", 
        month: "long", 
        day: "numeric" 
      });
    case "short":
      return date.toLocaleDateString(locale, { 
        year: "numeric", 
        month: "short", 
        day: "numeric" 
      });
    case "numeric":
    default:
      return date.toLocaleDateString(locale);
  }
}

// Build placeholder mapping for patient data
function buildPlaceholderMap(patient: any, currentDate: Date): Record<string, string> {
  const birthdate = patient?.dob ? new Date(patient.dob) : null;
  
  return {
    "patientInfo.lastName": patient?.last_name || "",
    "patientInfo.firstName": patient?.first_name || "",
    "patientInfo.birthdate": birthdate ? formatDate(birthdate, "numeric") : "",
    "patientInfo.birthDate": birthdate ? formatDate(birthdate, "numeric") : "",
    "patientInfo.dateOfBirth": birthdate ? formatDate(birthdate, "numeric") : "",
    "patientInfo.socialSecurityNumber": patient?.avs_number || "",
    "patientInfo.avsNumber": patient?.avs_number || "",
    "patientInfo.email": patient?.email || "",
    "patientInfo.phone": patient?.phone || "",
    "patientInfo.address": patient?.street_address || "",
    "patientInfo.streetAddress": patient?.street_address || "",
    "patientInfo.city": patient?.town || "",
    "patientInfo.town": patient?.town || "",
    "patientInfo.postalCode": patient?.postal_code || "",
    "patientInfo.zipCode": patient?.postal_code || "",
    "patientInfo.country": patient?.country || "",
    "patientInfo.fullName": `${patient?.first_name || ""} ${patient?.last_name || ""}`.trim(),
    "patientInfo.gender": patient?.gender || "",
    "patientInfo.nationality": patient?.nationality || "",
    "patientInfo.maritalStatus": patient?.marital_status || "",
    "currentDate.long": formatDate(currentDate, "long"),
    "currentDate.short": formatDate(currentDate, "short"),
    "currentDate.numeric": formatDate(currentDate, "numeric"),
    "currentDate": formatDate(currentDate, "numeric"),
    "PATIENT_NAME": `${patient?.first_name || ""} ${patient?.last_name || ""}`.trim(),
    "PATIENT_FIRST_NAME": patient?.first_name || "",
    "PATIENT_LAST_NAME": patient?.last_name || "",
    "PATIENT_EMAIL": patient?.email || "",
    "PATIENT_PHONE": patient?.phone || "",
    "PATIENT_DOB": birthdate ? formatDate(birthdate, "numeric") : "",
    "PATIENT_ADDRESS": patient?.street_address || "",
    "PATIENT_CITY": patient?.town || "",
    "PATIENT_POSTAL_CODE": patient?.postal_code || "",
    "PATIENT_COUNTRY": patient?.country || "",
    "DATE": formatDate(currentDate, "numeric"),
    "DATE_LONG": formatDate(currentDate, "long"),
  };
}

function normalizeXmlPlaceholders(content: string): string {
  let result = content;
  const splitPattern = /<w:t[^>]*>\$\{<\/w:t>([\s\S]*?)<w:t[^>]*>\}<\/w:t>/g;
  
  result = result.replace(splitPattern, (match, inner) => {
    const textContent = inner.replace(/<[^>]+>/g, "");
    return `<w:t>\${${textContent}}</w:t>`;
  });
  
  return result;
}

function replacePlaceholders(content: string, placeholders: Record<string, string>): string {
  let result = normalizeXmlPlaceholders(content);

  for (const [key, value] of Object.entries(placeholders)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\$\\{${escapedKey}\\}`, "g"), value);
  }

  return result;
}

// GET endpoint for OnlyOffice to fetch documents
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const templateName = searchParams.get("template");
    const patientId = searchParams.get("patientId");

    if (!templateName) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }

    const templatesDir = path.join(process.cwd(), "public", "forms", "templates");
    const templatePath = path.join(templatesDir, templateName);

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Get patient data if patientId is provided
    let patient: any = null;
    if (patientId) {
      const { data, error } = await supabaseAdmin
        .from("patients")
        .select("first_name, last_name, email, phone, dob, street_address, town, postal_code, country, gender, nationality, marital_status, patient_insurances(avs_number)")
        .eq("id", patientId)
        .single();
      if (!error && data) {
        const ins = (data as any).patient_insurances;
        patient = {
          ...data,
          avs_number: Array.isArray(ins) ? (ins[0]?.avs_number ?? "") : (ins?.avs_number ?? ""),
        };
      }
    }

    // Build placeholder map
    const currentDate = new Date();
    const placeholders = buildPlaceholderMap(patient, currentDate);

    // Read and process the template
    const fileBuffer = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(fileBuffer);
    
    const xmlFiles = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml", 
                      "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"];
    
    for (const xmlFile of xmlFiles) {
      const file = zip.file(xmlFile);
      if (file) {
        let content = await file.async("string");
        content = replacePlaceholders(content, placeholders);
        zip.file(xmlFile, content);
      }
    }
    
    const modifiedBuffer = await zip.generateAsync({ 
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 }
    });

    return new NextResponse(modifiedBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${templateName}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error serving document:", error);
    return NextResponse.json({ error: "Failed to serve document" }, { status: 500 });
  }
}
