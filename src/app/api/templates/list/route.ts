import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireStaff, requireRole, authErrorResponse } from "@/lib/serverAuth";
import { headers } from "next/headers";

export async function GET() {
    try {
      await requireStaff((await headers()));
    } catch (err) {
      return authErrorResponse(err);
    }
  try {
    const templatesDir = path.join(process.cwd(), "public", "forms", "templates");
    
    if (!fs.existsSync(templatesDir)) {
      return NextResponse.json({ templates: [] });
    }

    const files = fs.readdirSync(templatesDir);
    const templates = files.filter((file) => 
      file.endsWith(".docx") && !file.startsWith("~$")
    );

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Error listing templates:", error);
    return NextResponse.json(
      { error: "Failed to list templates" },
      { status: 500 }
    );
  }
}
