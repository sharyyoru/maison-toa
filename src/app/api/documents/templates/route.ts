import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    // Read templates from local filesystem (public/aesthetic-templates)
    const templatesDir = path.join(process.cwd(), "public", "aesthetic-templates");
    
    let files: string[] = [];
    try {
      const dirContents = await readdir(templatesDir);
      files = dirContents.filter(f => f.toLowerCase().endsWith('.docx'));
    } catch (err) {
      console.error("Error reading templates directory:", err);
      return NextResponse.json(
        { error: "Failed to read templates directory" },
        { status: 500 }
      );
    }

    console.log('Local templates found:', files.length);

    // Filter by search term if provided
    let filteredFiles = files;
    if (search) {
      filteredFiles = files.filter(file => 
        file.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Format templates for frontend
    const formattedTemplates = filteredFiles.map(file => ({
      id: file,
      name: file.replace('.docx', ''),
      description: 'Template from General',
      file_path: file, // Just the filename, API will look in aesthetic-templates
      file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      category: 'General',
      storage_only: false,
    }));

    // Sort alphabetically
    formattedTemplates.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ templates: formattedTemplates });
  } catch (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
