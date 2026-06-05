import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("booking_blocked_dates")
      .select("*")
      .order("blocked_date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ blockedDates: data || [] });
  } catch (err) {
    console.error("GET blocked-dates error:", err);
    return NextResponse.json({ error: "Failed to fetch blocked dates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blocked_date, reason } = body;

    if (!blocked_date) {
      return NextResponse.json({ error: "blocked_date is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("booking_blocked_dates")
      .insert({
        blocked_date,
        reason: reason || null,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "This date is already blocked" }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ blockedDate: data });
  } catch (err) {
    console.error("POST blocked-dates error:", err);
    return NextResponse.json({ error: "Failed to add blocked date" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("booking_blocked_dates")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE blocked-dates error:", err);
    return NextResponse.json({ error: "Failed to delete blocked date" }, { status: 500 });
  }
}
