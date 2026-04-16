import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // optional filter
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = 50;

  let query = supabase
    .from("appointments")
    .select(
      `id, start_time, end_time, status, reason, location, created_at, provider_id,
       patient:patients(id, first_name, last_name, email, phone, source),
       provider:providers(id, name)`,
      { count: "exact" }
    )
    // Filter to only online bookings — either by source column (after migration)
    // or by the [Online Booking] marker in the reason (before migration back-fill)
    .or("source.eq.online_booking,reason.ilike.*[Online Booking]*")
    .order("start_time", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(
      `reason.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching online bookings:", error);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }

  return NextResponse.json({ bookings: data || [], total: count || 0 });
}

export async function PATCH(request: NextRequest) {
  const { id, status } = await request.json();

  if (!id || !status) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }

  const validStatuses = ["scheduled", "confirmed", "cancelled", "completed", "no_show"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("Error updating booking:", error);
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting booking:", error);
    return NextResponse.json({ error: "Failed to delete booking" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  const { id, start_time, end_time } = await request.json();

  if (!id || !start_time) {
    return NextResponse.json({ error: "id and start_time are required" }, { status: 400 });
  }

  const updateData: { start_time: string; end_time?: string | null } = { start_time };
  if (end_time !== undefined) {
    updateData.end_time = end_time;
  }

  const { error } = await supabase
    .from("appointments")
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error("Error updating booking date/time:", error);
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
