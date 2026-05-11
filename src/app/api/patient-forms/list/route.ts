import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const formsDir = path.join(process.cwd(), "public", "patient-forms");

    if (!fs.existsSync(formsDir)) {
      return NextResponse.json({ forms: [] });
    }

    const files = fs.readdirSync(formsDir);
    const forms = files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return [".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".pdf"].includes(ext);
      })
      .map((file) => {
        const filePath = path.join(formsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ forms });
  } catch (error) {
    console.error("Error listing patient forms:", error);
    return NextResponse.json(
      { error: "Failed to list patient forms" },
      { status: 500 }
    );
  }
}
