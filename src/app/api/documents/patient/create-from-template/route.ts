import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { removeNextFieldArtifacts } from "@/lib/docxFieldCleanup";

function formatFrenchDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDob(dob: string | null | undefined): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "numeric", year: "numeric" });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegexCharacter(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePlaceholderInXml(xml: string, placeholder: string, value: string): string {
  if (!value) {
    // Keep blank when value is missing (do not show the placeholder text)
    value = "";
  }

  const escapedValue = escapeXml(value);
  if (xml.includes(placeholder)) {
    return xml.split(placeholder).join(escapedValue);
  }

  // Handle Word splitting the placeholder across multiple <w:t> runs.
  const fragmentedPattern = Array.from(placeholder)
    .map(escapeRegexCharacter)
    .join("(?:</w:t>(?:<[^>]*>)*<w:t[^>]*>)?");

  return xml.replace(new RegExp(fragmentedPattern, "g"), escapedValue);
}

async function applyTemplatePlaceholders(
  buffer: Buffer,
  patient: {
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    gender?: string | null;
    street_address?: string | null;
    postal_code?: string | null;
    town?: string | null;
    phone?: string | null;
  }
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const xmlFiles = Object.values(zip.files).filter(
    (file) =>
      !file.dir &&
      /^word\/(document|header\d+|footer\d+)\.xml$/i.test(file.name)
  );

  const today = formatFrenchDate(new Date());
  const defaultSalutation =
    patient.gender?.toLowerCase() === "female"
      ? "Madame"
      : patient.gender?.toLowerCase() === "male"
        ? "Monsieur"
        : "";
  const addressParts = [
    patient.street_address || "",
    patient.postal_code || "",
    patient.town || "",
  ].filter(Boolean);

  const replacements = new Map<string, string>([
    ["${currentDate}", today],
    ["${currentDate.long}", today],
    ["${patientInfo.lastName}", patient.last_name || ""],
    ["${patientInfo.firstName}", patient.first_name || ""],
    ["${patientInfo.birthdate}", formatDob(patient.dob)],
    ["${patientInfo.socialSecurityNumber}", ""], // not stored in patients table
    ["${patientInfo.salutation}", defaultSalutation],
    ["${patientInfo.street}", patient.street_address || ""],
    ["${patientInfo.streetNo}", ""], // not stored separately
    ["${patientInfo.zip}", patient.postal_code || ""],
    ["${patientInfo.city}", patient.town || ""],
    ["${patientInfo.mobile}", patient.phone || ""],
    ["${patientInfo.address}", addressParts.join(", ")],
  ]);

  for (const file of xmlFiles) {
    let xml = await file.async("string");
    replacements.forEach((value, placeholder) => {
      xml = replacePlaceholderInXml(xml, placeholder, value);
    });
    xml = removeNextFieldArtifacts(xml);
    zip.file(file.name, xml);
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

function isDuplicateStorageError(error: { message?: string; statusCode?: string } | null): boolean {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  return (
    error.statusCode === "409" ||
    message.includes("already exists") ||
    message.includes("duplicate")
  );
}

function buildBaseFileName(patientName: string, title: string): string {
  const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50);
  const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const safeName = patientName ? sanitize(patientName) : "Patient";
  const safeTitle = sanitize(title);
  return `${safeTitle}_${safeName}_${dateStr}`;
}

/**
 * Uploads the document under a filename that is guaranteed to be unique for
 * this patient. Storage's `upsert: false` upload is atomic at the object-key
 * level, so we use it (rather than a check-then-insert against the database,
 * which is not race-safe since there is no unique constraint on file_path)
 * to resolve naming conflicts by appending _1, _2, etc.
 */
async function uploadWithUniqueFileName(
  patientId: string,
  baseFileName: string,
  buffer: Buffer
): Promise<{ fileName: string; storagePath: string } | { error: string }> {
  const withoutExt = baseFileName.replace(/\.docx$/i, "");
  const maxAttempts = 30;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const candidate = attempt === 0 ? `${withoutExt}.docx` : `${withoutExt}_${attempt}.docx`;
    const storagePath = `${patientId}/${candidate}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("patient-documents")
      .upload(storagePath, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });

    if (!uploadError) {
      return { fileName: candidate, storagePath };
    }

    if (!isDuplicateStorageError(uploadError)) {
      return { error: uploadError.message };
    }
    // Filename collision - try the next suffix.
  }

  return { error: "Could not find a unique filename after multiple attempts." };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientId, templatePath, title, patientName, fileName: requestedFileName } = body;

    if (!patientId || !title) {
      return NextResponse.json(
        { error: "Patient ID and title are required" },
        { status: 400 }
      );
    }

    const baseFileName = requestedFileName?.trim()
      ? requestedFileName.trim()
      : buildBaseFileName(patientName || "", title);

    // Read template from local filesystem (public/documents)
    const templateFileName = templatePath || `${title}.docx`;
    const localTemplatePath = path.join(process.cwd(), "public", "documents", templateFileName);
    
    console.log("Reading template from:", localTemplatePath);
    
    let templateBuffer: Buffer;
    try {
      templateBuffer = await readFile(localTemplatePath);
      console.log("Template loaded, size:", templateBuffer.length, "bytes");
    } catch (fileError: any) {
      console.error("Failed to read local template:", fileError.message);
      return NextResponse.json(
        { error: `Template not found: ${templateFileName}` },
        { status: 404 }
      );
    }

    // Fetch patient data for placeholder substitution
    const { data: patient } = await supabaseAdmin
      .from("patients")
      .select("first_name, last_name, dob, gender, street_address, postal_code, town, phone")
      .eq("id", patientId)
      .single();

    // Substitute patient placeholders so the generated document is clean
    templateBuffer = await applyTemplatePlaceholders(templateBuffer, patient || {});
    console.log("Template placeholders applied");

    // Upload with a filename guaranteed to be unique for this patient. Storage
    // uploads with upsert:false are atomic at the object-key level, so this
    // safely resolves same-day naming collisions by appending _1, _2, etc.
    const uploadResult = await uploadWithUniqueFileName(patientId, baseFileName, templateBuffer);

    if ("error" in uploadResult) {
      console.error("Upload error:", uploadResult.error);
      return NextResponse.json(
        { error: `Failed to save document to storage: ${uploadResult.error}` },
        { status: 500 }
      );
    }

    const { fileName, storagePath: patientDocPath } = uploadResult;

    // Create database record with the resolved file path
    const { data: document, error: dbError } = await supabaseAdmin
      .from("patient_documents")
      .insert({
        patient_id: patientId,
        template_id: null,
        title: fileName.replace('.docx', ''), // Human-readable title
        content: `Document created from template: ${title}`,
        status: "draft",
        version: 1,
        created_by_name: "System",
        last_edited_at: new Date().toISOString(),
        file_path: fileName, // Store actual filename in existing column
      })
      .select()
      .single();

    if (dbError || !document) {
      console.error("Database error:", dbError);
      await supabaseAdmin.storage.from("patient-documents").remove([patientDocPath]);
      return NextResponse.json(
        { error: "Failed to create document record" },
        { status: 500 }
      );
    }

    console.log("Document created successfully:", fileName);

    return NextResponse.json({
      success: true,
      document: {
        ...document,
        file_name: fileName,
      },
      fileName,
      storagePath: patientDocPath,
    });
  } catch (error) {
    console.error("Error creating document from template:", error);
    return NextResponse.json(
      {
        error: "Failed to create document",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
