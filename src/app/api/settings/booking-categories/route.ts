import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("booking_categories")
      .select("*")
      .order("order_index", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ categories: data || [] });
  } catch (err) {
    console.error("GET booking-categories error:", err);
    return NextResponse.json({ error: "Failed to fetch booking categories" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { categories } = body;

    if (!Array.isArray(categories)) {
      return NextResponse.json({ error: "categories must be an array" }, { status: 400 });
    }

    // Get existing category IDs
    const { data: existing } = await supabaseAdmin
      .from("booking_categories")
      .select("id");

    const existingIds = new Set((existing || []).map((r: { id: string }) => r.id));
    const incomingIds = new Set(categories.map((c: { id: string }) => c.id));

    // Delete removed categories
    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    if (toDelete.length > 0) {
      const { error: delError } = await supabaseAdmin
        .from("booking_categories")
        .delete()
        .in("id", toDelete);
      if (delError) {
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }
    }

    // Upsert all incoming categories
    if (categories.length > 0) {
      const rows = categories.map((c: {
        id: string;
        name: string;
        description: string;
        patient_type: string;
        order_index: number;
        slug: string;
        enabled: boolean;
      }) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        patient_type: c.patient_type, // 'new' or 'existing'
        order_index: c.order_index,
        slug: c.slug,
        enabled: c.enabled !== undefined ? c.enabled : true,
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabaseAdmin
        .from("booking_categories")
        .upsert(rows, { onConflict: "id" });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT booking-categories error:", err);
    return NextResponse.json({ error: "Failed to save booking categories" }, { status: 500 });
  }
}
