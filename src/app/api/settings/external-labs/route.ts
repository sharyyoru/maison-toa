import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("external_labs")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ labs: data || [] });
  } catch (err) {
    console.error("GET external-labs error:", err);
    return NextResponse.json({ error: "Failed to fetch external labs" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { labs } = body;

    if (!Array.isArray(labs)) {
      return NextResponse.json({ error: "labs must be an array" }, { status: 400 });
    }

    // Get existing lab IDs
    const { data: existing } = await supabaseAdmin
      .from("external_labs")
      .select("id");

    const existingIds = new Set((existing || []).map((r: { id: string }) => r.id));
    const incomingIds = new Set(labs.map((l: { id: string }) => l.id));

    // Delete removed labs
    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    if (toDelete.length > 0) {
      const { error: delError } = await supabaseAdmin
        .from("external_labs")
        .delete()
        .in("id", toDelete);
      if (delError) {
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }
    }

    // Upsert all incoming labs
    if (labs.length > 0) {
      const rows = labs.map((l: { id: string; name: string; url: string; username: string; password: string; type?: string }) => ({
        id: l.id,
        name: l.name,
        url: l.url,
        username: l.username,
        password: l.password,
        type: l.type || "medisupport_fr",
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabaseAdmin
        .from("external_labs")
        .upsert(rows, { onConflict: "id" });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT external-labs error:", err);
    return NextResponse.json({ error: "Failed to save external labs" }, { status: 500 });
  }
}
