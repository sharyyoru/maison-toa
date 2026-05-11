import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("file");

    if (!fileName) {
      return NextResponse.json({ error: "File name is required" }, { status: 400 });
    }

    // Sanitize filename to prevent directory traversal
    const sanitizedFileName = path.basename(fileName);
    const formsDir = path.join(process.cwd(), "public", "patient-forms");
    const filePath = path.join(formsDir, sanitizedFileName);

    // Verify the file is within the patient-forms directory
    if (!filePath.startsWith(formsDir)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(fileName).toLowerCase();

    let contentType = "application/octet-stream";
    if (ext === ".docx") {
      contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (ext === ".doc") {
      contentType = "application/msword";
    } else if (ext === ".xlsx") {
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else if (ext === ".xls") {
      contentType = "application/vnd.ms-excel";
    } else if (ext === ".pptx") {
      contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    } else if (ext === ".ppt") {
      contentType = "application/vnd.ms-powerpoint";
    } else if (ext === ".pdf") {
      contentType = "application/pdf";
    }

    return new NextResponse(fileBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(sanitizedFileName)}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error serving patient form:", error);
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}
