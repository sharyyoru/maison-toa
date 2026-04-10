import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/settings/booking-doctors
// Query params:
//   treatment_id — return only doctors assigned to this treatment (falls back to all if none assigned)
//   category_slug — return only doctors assigned to this category (falls back to all if none assigned)
//   all=true — always return all enabled doctors regardless of assignments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const treatmentId = searchParams.get("treatment_id");
    const categorySlug = searchParams.get("category_slug");

    if (treatmentId && treatmentId !== "none") {
      // Check if there are any treatment-level assignments
      const { data: assignments } = await supabaseAdmin
        .from("booking_treatment_doctors")
        .select("doctor_id, order_index, booking_doctors(*)")
        .eq("treatment_id", treatmentId)
        .order("order_index", { ascending: true });

      if (assignments && assignments.length > 0) {
        const doctors = assignments
          .map((a: any) => a.booking_doctors)
          .filter((d: any) => d && d.enabled);
        return NextResponse.json({ doctors });
      }
      // Fall through to return all enabled doctors
    } else if (categorySlug) {
      // Look up category by slug
      const { data: category } = await supabaseAdmin
        .from("booking_categories")
        .select("id")
        .eq("slug", categorySlug)
        .single();

      if (category) {
        const { data: assignments } = await supabaseAdmin
          .from("booking_category_doctors")
          .select("doctor_id, order_index, booking_doctors(*)")
          .eq("category_id", category.id)
          .order("order_index", { ascending: true });

        if (assignments && assignments.length > 0) {
          const doctors = assignments
            .map((a: any) => a.booking_doctors)
            .filter((d: any) => d && d.enabled);
          return NextResponse.json({ doctors });
        }
      }
      // Fall through to return all enabled doctors
    }

    // Default: return all doctors
    const { data: doctors, error } = await supabaseAdmin
      .from("booking_doctors")
      .select("*")
      .order("order_index", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ doctors: doctors || [] });
  } catch (err) {
    console.error("GET booking-doctors error:", err);
    return NextResponse.json({ error: "Failed to fetch booking doctors" }, { status: 500 });
  }
}

// PUT /api/settings/booking-doctors — upsert all doctors
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { doctors } = body;

    if (!Array.isArray(doctors)) {
      return NextResponse.json({ error: "doctors must be an array" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("booking_doctors")
      .select("id");

    const existingIds = new Set((existing || []).map((r: { id: string }) => r.id));
    const incomingIds = new Set(doctors.map((d: { id: string }) => d.id));

    // Delete removed doctors
    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    if (toDelete.length > 0) {
      await supabaseAdmin.from("booking_doctors").delete().in("id", toDelete);
    }

    // Upsert all incoming doctors
    if (doctors.length > 0) {
      const rows = doctors.map((d: {
        id: string;
        name: string;
        specialty?: string;
        image_url?: string;
        description?: string;
        slug: string;
        enabled: boolean;
        order_index: number;
      }) => ({
        id: d.id,
        name: d.name,
        specialty: d.specialty || null,
        image_url: d.image_url || null,
        description: d.description || null,
        slug: d.slug,
        enabled: d.enabled,
        order_index: d.order_index,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabaseAdmin
        .from("booking_doctors")
        .upsert(rows, { onConflict: "id" });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT booking-doctors error:", err);
    return NextResponse.json({ error: "Failed to save booking doctors" }, { status: 500 });
  }
}
