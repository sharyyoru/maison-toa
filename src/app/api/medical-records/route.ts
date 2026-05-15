import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type MedicalRecord = {
  id: string;
  patient_id: string;
  ap_content: string;
  af_content: string;
  notes_content: string;
  ap_file_path: string | null;
  af_file_path: string | null;
  notes_file_path: string | null;
  source_folder: string | null;
  imported_from_storage: boolean;
  created_at: string;
  updated_at: string;
  last_edited_by: string | null;
  last_edited_by_name: string | null;
};

// GET - Fetch medical record for a patient
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");

    if (!patientId) {
      return NextResponse.json({ error: "patientId is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("medical_records")
      .select("*")
      .eq("patient_id", patientId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Error fetching medical record:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ record: data || null });
  } catch (err: any) {
    console.error("Error in GET medical-records:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - Create or update (upsert) medical record with autosave
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      patientId,
      apContent,
      afContent,
      notesContent,
      editedByName,
    } = body;

    if (!patientId) {
      return NextResponse.json({ error: "patientId is required" }, { status: 400 });
    }

    // Upsert - insert if not exists, update if exists
    const { data, error } = await supabase
      .from("medical_records")
      .upsert(
        {
          patient_id: patientId,
          ap_content: apContent ?? "",
          af_content: afContent ?? "",
          notes_content: notesContent ?? "",
          last_edited_by_name: editedByName || "System",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "patient_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error upserting medical record:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ record: data, saved: true });
  } catch (err: any) {
    console.error("Error in POST medical-records:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH - Partial update (for autosave of individual fields)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientId, field, content, editedByName } = body;

    if (!patientId || !field) {
      return NextResponse.json({ error: "patientId and field are required" }, { status: 400 });
    }

    const validFields = ["ap_content", "af_content", "notes_content"];
    if (!validFields.includes(field)) {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 });
    }

    // First check if record exists
    const { data: existing } = await supabase
      .from("medical_records")
      .select("id")
      .eq("patient_id", patientId)
      .single();

    if (!existing) {
      // Create new record
      const { data, error } = await supabase
        .from("medical_records")
        .insert({
          patient_id: patientId,
          [field]: content ?? "",
          last_edited_by_name: editedByName || "System",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating medical record:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ record: data, saved: true });
    }

    // Update existing record
    const { data, error } = await supabase
      .from("medical_records")
      .update({
        [field]: content ?? "",
        last_edited_by_name: editedByName || "System",
        updated_at: new Date().toISOString(),
      })
      .eq("patient_id", patientId)
      .select()
      .single();

    if (error) {
      console.error("Error updating medical record:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ record: data, saved: true });
  } catch (err: any) {
    console.error("Error in PATCH medical-records:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
