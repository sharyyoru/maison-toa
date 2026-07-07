import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

function removeNextFieldInstructions(xml: string): string {
  // Remove Word NEXT field instructions that render as visible text in the editor.
  let result = xml.replace(
    /<w:r>(?:[^<]|<(?!\/w:r>))*?<w:instrText[^>]*>\s*NEXT\s*<\/w:instrText>(?:[^<]|<(?!\/w:r>))*?<\/w:r>/gi,
    ""
  );
  // Remove orphaned begin/end field char markers left behind.
  result = result.replace(
    /<w:r>\s*<w:fldChar[^>]*\bfldCharType="begin"[^>]*\/>\s*<\/w:r>/gi,
    ""
  );
  result = result.replace(
    /<w:r>\s*<w:fldChar[^>]*\bfldCharType="end"[^>]*\/>\s*<\/w:r>/gi,
    ""
  );
  return result;
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
    xml = removeNextFieldInstructions(xml);
    zip.file(file.name, xml);
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

async function fileNameExists(patientId: string, fileName: string): Promise<boolean> {
  const { data: existingDoc } = await supabaseAdmin
    .from("patient_documents")
    .select("id")
    .eq("patient_id", patientId)
    .eq("file_path", fileName)
    .maybeSingle();

  if (existingDoc) return true;

  const { data: files } = await supabaseAdmin.storage
    .from("patient-documents")
    .list(patientId);

  return files?.some((file) => file.name === fileName) ?? false;
}

async function generateUniqueFileName(
  patientId: string,
  patientName: string,
  title: string
): Promise<string> {
  const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50);
  const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const safeName = patientName ? sanitize(patientName) : "Patient";
  const safeTitle = sanitize(title);
  const baseName = `${safeTitle}_${safeName}_${dateStr}`;

  let candidate = `${baseName}.docx`;
  let counter = 1;

  while (true) {
    if (!(await fileNameExists(patientId, candidate))) {
      return candidate;
    }
    candidate = `${baseName}_${counter}.docx`;
    counter++;
  }
}

async function resolveFileName(
  patientId: string,
  patientName: string,
  title: string,
  requestedFileName?: string
): Promise<{ fileName: string } | { error: string }> {
  if (!requestedFileName || requestedFileName.trim() === "") {
    return { fileName: await generateUniqueFileName(patientId, patientName, title) };
  }

  let fileName = requestedFileName.trim();
  if (!fileName.toLowerCase().endsWith(".docx")) {
    fileName = `${fileName}.docx`;
  }

  if (fileName.length > 120) {
    return { error: "Filename is too long." };
  }

  if (await fileNameExists(patientId, fileName)) {
    return { error: `A document named "${fileName}" already exists. Please choose a different name.` };
  }

  return { fileName };
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

    const resolved = await resolveFileName(
      patientId,
      patientName || "",
      title,
      requestedFileName
    );

    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 409 });
    }

    const fileName = resolved.fileName;

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

    // Create database record with file path
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
      return NextResponse.json(
        { error: "Failed to create document record" },
        { status: 500 }
      );
    }

    // Upload to patient-docs bucket with human-readable filename
    const patientDocPath = `${patientId}/${fileName}`;
    console.log("Uploading to path:", patientDocPath);
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from("patient-documents")
      .upload(patientDocPath, templateBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      await supabaseAdmin.from("patient_documents").delete().eq("id", document.id);
      return NextResponse.json(
        { error: `Failed to save document to storage: ${uploadError.message}` },
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
