import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    // Read templates from local filesystem (public/documents)
    const templatesDir = path.join(process.cwd(), "public", "documents");

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

    // DOC-003: apply user overrides (rename / hide) to built-in templates
    const overrides = new Map<string, { display_name: string | null; hidden: boolean }>();
    try {
      const { data: overrideRows } = await supabaseAdmin
        .from("document_template_overrides")
        .select("file_name, display_name, hidden");
      for (const row of overrideRows ?? []) {
        overrides.set(row.file_name as string, {
          display_name: (row.display_name as string | null) ?? null,
          hidden: Boolean(row.hidden),
        });
      }
    } catch (overrideErr) {
      console.error("Error reading template overrides:", overrideErr);
    }

    // Format built-in templates for frontend
    const formattedTemplates = files
      .filter(file => !overrides.get(file)?.hidden)
      .map(file => ({
        id: file,
        name: overrides.get(file)?.display_name || file.replace('.docx', ''),
        description: 'Template from General',
        file_path: file, // Just the filename, API will look in aesthetic-templates
        file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        category: 'General',
        storage_only: false,
      }));

    // DOC-003: merge in user-managed templates from the document-templates
    // storage bucket (added/duplicated by staff in Settings).
    try {
      const { data: storageFiles } = await supabaseAdmin.storage
        .from("document-templates")
        .list("", { limit: 500, sortBy: { column: "name", order: "asc" } });
      for (const file of storageFiles ?? []) {
        if (!file.name || !file.name.toLowerCase().endsWith(".docx")) continue;
        formattedTemplates.push({
          id: `storage:${file.name}`,
          name: file.name.replace(/\.docx$/i, ""),
          description: "Custom template",
          file_path: `storage:${file.name}`,
          file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          category: 'Custom',
          storage_only: true,
        });
      }
    } catch (storageErr) {
      console.error("Error reading storage templates:", storageErr);
    }

    // Filter by search term if provided
    let filtered = formattedTemplates;
    if (search) {
      filtered = formattedTemplates.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Sort alphabetically
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ templates: filtered });
  } catch (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
