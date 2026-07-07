import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob;
    const bucket = formData.get("bucket") as string || "patient-documents";
    const path = formData.get("path") as string;
    const documentId = formData.get("documentId") as string;
    const oldPath = formData.get("oldPath") as string;

    if (!file || !path) {
      return NextResponse.json(
        { error: "File and path are required" },
        { status: 400 }
      );
    }

    console.log(`Uploading to bucket: ${bucket}, path: ${path}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (error) {
      console.error("Upload error:", error);
      return NextResponse.json(
        { error: `Failed to upload: ${error.message}` },
        { status: 500 }
      );
    }

    // Delete the old file if the path changed
    if (oldPath && oldPath !== path) {
      const { error: removeError } = await supabaseAdmin.storage
        .from(bucket)
        .remove([oldPath]);
      if (removeError) {
        console.error("Error removing old file:", removeError);
      }
    }

    // Update the document record if a document ID was provided
    if (documentId) {
      const fileName = path.split('/').pop();
      const title = fileName?.replace(/\.docx$/i, '');
      const { error: updateError } = await supabaseAdmin
        .from("patient_documents")
        .update({
          file_path: fileName,
          title,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      if (updateError) {
        console.error("Error updating document record:", updateError);
      }
    }

    console.log("Upload successful:", path);

    return NextResponse.json({ success: true, path });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: "Failed to upload document" },
      { status: 500 }
    );
  }
}
