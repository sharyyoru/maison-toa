import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("patient_documents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching document:", error);
      return NextResponse.json(
        { error: "Failed to fetch document" },
        { status: 500 }
      );
    }

    return NextResponse.json({ document: data });
  } catch (error) {
    console.error("Error in document GET:", error);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}
