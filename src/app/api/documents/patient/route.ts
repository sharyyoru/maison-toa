import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET - List patient documents
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    if (!patientId) {
      return NextResponse.json(
        { error: "Patient ID is required" },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from("patient_documents")
      .select(`
        *,
        template:document_templates(id, name, category)
      `)
      .eq("patient_id", patientId)
      .order("updated_at", { ascending: false });

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching patient documents:", error);
      return NextResponse.json(
        { error: "Failed to fetch documents" },
        { status: 500 }
      );
    }

    return NextResponse.json({ documents: data || [] });
  } catch (error) {
    console.error("Error in patient documents API:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

// POST - Create new patient document from template or blank
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientId, title, content, templatePath } = body;

    if (!patientId || !title) {
      return NextResponse.json(
        { error: "Patient ID and title are required" },
        { status: 400 }
      );
    }

    // Use provided content or default
    const initialContent = content || "<p>Start typing your document...</p>";

    const { data, error } = await supabaseAdmin
      .from("patient_documents")
      .insert({
        patient_id: patientId,
        template_id: null, // Templates are in Supabase storage, not database
        title,
        content: initialContent,
        status: "draft",
        version: 1,
        created_by: null,
        created_by_name: "System",
        last_edited_by: null,
        last_edited_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating patient document:", error);
      return NextResponse.json(
        { error: "Failed to create document" },
        { status: 500 }
      );
    }

    return NextResponse.json({ document: data });
  } catch (error) {
    console.error("Error in patient documents POST:", error);
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    );
  }
}

// PUT - Update patient document (auto-save)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, content, title, status } = body;

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    // Get current document for version tracking
    const { data: currentDoc } = await supabaseAdmin
      .from("patient_documents")
      .select("version, content")
      .eq("id", documentId)
      .single();

    const updateData: Record<string, any> = {
      last_edited_by: null,
      last_edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (content !== undefined) {
      updateData.content = content;
    }

    if (title) {
      updateData.title = title;
    }

    if (status) {
      updateData.status = status;
      // If finalizing, increment version and save history
      if (status === "final" && currentDoc) {
        updateData.version = (currentDoc.version || 1) + 1;
        
        // Save version history
        await supabaseAdmin.from("patient_document_versions").insert({
          document_id: documentId,
          version: currentDoc.version || 1,
          content: currentDoc.content,
          changed_by: null,
          changed_by_name: "System",
        });
      }
    }

    const { data, error } = await supabaseAdmin
      .from("patient_documents")
      .update(updateData)
      .eq("id", documentId)
      .select()
      .single();

    if (error) {
      console.error("Error updating patient document:", error);
      return NextResponse.json(
        { error: "Failed to update document" },
        { status: 500 }
      );
    }

    return NextResponse.json({ document: data });
  } catch (error) {
    console.error("Error in patient documents PUT:", error);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    );
  }
}

// DELETE - Delete patient document
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("patient_documents")
      .delete()
      .eq("id", documentId);

    if (error) {
      console.error("Error deleting patient document:", error);
      return NextResponse.json(
        { error: "Failed to delete document" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in patient documents DELETE:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
