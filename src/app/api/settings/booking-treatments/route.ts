import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("category_id");

    let query = supabaseAdmin
      .from("booking_treatments")
      .select("*")
      .order("order_index", { ascending: true });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data: treatments, error } = await query;

    if (error) {
      console.error("Error fetching treatments:", error);
      return NextResponse.json(
        { error: "Failed to fetch treatments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ treatments: treatments || [] });
  } catch (error) {
    console.error("Error in GET /api/settings/booking-treatments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { treatments } = body;

    if (!Array.isArray(treatments)) {
      return NextResponse.json(
        { error: "Invalid treatments data" },
        { status: 400 }
      );
    }

    // Get existing treatment IDs
    const { data: existingTreatments } = await supabaseAdmin
      .from("booking_treatments")
      .select("id");

    const existingIds = new Set(existingTreatments?.map((t) => t.id) || []);
    const newIds = new Set(treatments.map((t) => t.id));

    // Delete treatments that are no longer in the list
    const toDelete = [...existingIds].filter((id) => !newIds.has(id));
    if (toDelete.length > 0) {
      await supabaseAdmin
        .from("booking_treatments")
        .delete()
        .in("id", toDelete);
    }

    // Upsert all treatments
    for (const treatment of treatments) {
      const { error } = await supabaseAdmin
        .from("booking_treatments")
        .upsert({
          id: treatment.id,
          category_id: treatment.category_id,
          name: treatment.name,
          description: treatment.description || null,
          duration_minutes: treatment.duration_minutes,
          order_index: treatment.order_index,
          enabled: treatment.enabled,
        });

      if (error) {
        console.error("Error upserting treatment:", error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/settings/booking-treatments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { category_id, name, description, duration_minutes, order_index, enabled } = body;

    if (!category_id || !name) {
      return NextResponse.json(
        { error: "category_id and name are required" },
        { status: 400 }
      );
    }

    const { data: treatment, error } = await supabaseAdmin
      .from("booking_treatments")
      .insert({
        category_id,
        name,
        description: description || null,
        duration_minutes: duration_minutes || 30,
        order_index: order_index || 0,
        enabled: enabled ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating treatment:", error);
      return NextResponse.json(
        { error: "Failed to create treatment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ treatment });
  } catch (error) {
    console.error("Error in POST /api/settings/booking-treatments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Treatment ID is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("booking_treatments")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting treatment:", error);
      return NextResponse.json(
        { error: "Failed to delete treatment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/settings/booking-treatments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
