import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import path from "path";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientId, templatePath, title, patientName } = body;

    if (!patientId || !title) {
      return NextResponse.json(
        { error: "Patient ID and title are required" },
        { status: 400 }
      );
    }

    // Read template from local filesystem (public/aesthetic-templates)
    const templateFileName = templatePath || `${title}.docx`;
    const localTemplatePath = path.join(process.cwd(), "public", "aesthetic-templates", templateFileName);
    
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

    // Generate filename: templatename_patientname_date.docx
    const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const safeName = patientName ? sanitize(patientName) : 'Patient';
    const safeTitle = sanitize(title);
    const fileName = `${safeTitle}_${safeName}_${dateStr}.docx`;

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
      .from("patient_document")
      .upload(patientDocPath, templateBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
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
