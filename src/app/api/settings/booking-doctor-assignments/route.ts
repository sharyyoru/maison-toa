import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/settings/booking-doctor-assignments
// Query params:
//   treatment_id — return doctor IDs assigned to this treatment
//   category_id  — return doctor IDs assigned to this category
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const treatmentId = searchParams.get("treatment_id");
    const categoryId = searchParams.get("category_id");

    if (treatmentId) {
      const { data, error } = await supabaseAdmin
        .from("booking_treatment_doctors")
        .select("doctor_id")
        .eq("treatment_id", treatmentId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ doctor_ids: (data || []).map((r: { doctor_id: string }) => r.doctor_id) });
    }

    if (categoryId) {
      const { data, error } = await supabaseAdmin
        .from("booking_category_doctors")
        .select("doctor_id")
        .eq("category_id", categoryId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ doctor_ids: (data || []).map((r: { doctor_id: string }) => r.doctor_id) });
    }

    return NextResponse.json({ error: "treatment_id or category_id is required" }, { status: 400 });
  } catch (err) {
    console.error("GET booking-doctor-assignments error:", err);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

// PUT /api/settings/booking-doctor-assignments
// Body: { treatment_id, doctor_ids } or { category_id, doctor_ids }
// Replaces all assignments for the given treatment/category
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { treatment_id, category_id, doctor_ids } = body;

    if (!Array.isArray(doctor_ids)) {
      return NextResponse.json({ error: "doctor_ids must be an array" }, { status: 400 });
    }

    if (treatment_id) {
      // Delete existing assignments
      await supabaseAdmin
        .from("booking_treatment_doctors")
        .delete()
        .eq("treatment_id", treatment_id);

      // Insert new assignments
      if (doctor_ids.length > 0) {
        const rows = doctor_ids.map((doctor_id: string, idx: number) => ({
          treatment_id,
          doctor_id,
          order_index: idx,
        }));
        const { error } = await supabaseAdmin
          .from("booking_treatment_doctors")
          .insert(rows);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }

      return NextResponse.json({ success: true });
    }

    if (category_id) {
      // Delete existing assignments
      await supabaseAdmin
        .from("booking_category_doctors")
        .delete()
        .eq("category_id", category_id);

      // Insert new assignments
      if (doctor_ids.length > 0) {
        const rows = doctor_ids.map((doctor_id: string, idx: number) => ({
          category_id,
          doctor_id,
          order_index: idx,
        }));
        const { error } = await supabaseAdmin
          .from("booking_category_doctors")
          .insert(rows);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "treatment_id or category_id is required" }, { status: 400 });
  } catch (err) {
    console.error("PUT booking-doctor-assignments error:", err);
    return NextResponse.json({ error: "Failed to save assignments" }, { status: 500 });
  }
}
