import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encodeStorageFileName } from "@/utils/storageFileName";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob;
    const bucket = formData.get("bucket") as string || "patient-documents";
    const requestedPath = formData.get("path") as string;
    const displayFileName = (formData.get("displayFileName") as string | null)?.trim();
    const documentId = formData.get("documentId") as string;
    const oldPath = formData.get("oldPath") as string;

    if (!file || !requestedPath) {
      return NextResponse.json(
        { error: "File and path are required" },
        { status: 400 }
      );
    }

    const pathParts = requestedPath.split("/");
    const requestedFileName = pathParts.pop() || "";
    const storedFileName = encodeStorageFileName(requestedFileName);
    const path = [...pathParts, storedFileName].join("/");

    if (!storedFileName) {
      return NextResponse.json({ error: "A valid filename is required" }, { status: 400 });
    }

    const isRename = !!oldPath && oldPath !== path;

    // When renaming, make sure another document isn't already using the
    // target filename before overwriting anything.
    if (isRename) {
      const { data: existingFile } = await supabaseAdmin.storage
        .from(bucket)
        .list(path.split('/').slice(0, -1).join('/'));
      const targetName = path.split('/').pop();
      const conflict = existingFile?.some((f) => f.name === targetName);
      if (conflict) {
        return NextResponse.json(
          { error: `A file named "${targetName}" already exists.` },
          { status: 409 }
        );
      }
    }

    console.log(`Uploading to bucket: ${bucket}, path: ${path}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: !isRename,
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
      const title = (displayFileName || requestedFileName).replace(/\.docx$/i, '');
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

    return NextResponse.json({ success: true, path, fileName: storedFileName });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: "Failed to upload document", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
