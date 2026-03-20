import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("doctor_scheduling_settings")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data || [] });
  } catch (err) {
    console.error("GET doctor-scheduling error:", err);
    return NextResponse.json({ error: "Failed to fetch doctor scheduling settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider_id, time_interval_minutes, default_duration_minutes } = body;

    if (!provider_id) {
      return NextResponse.json({ error: "provider_id is required" }, { status: 400 });
    }

    const interval = Number(time_interval_minutes) || 15;
    const duration = Number(default_duration_minutes) || 15;

    if (interval < 1 || interval > 60) {
      return NextResponse.json({ error: "time_interval_minutes must be between 1 and 60" }, { status: 400 });
    }
    if (duration < 1 || duration > 480) {
      return NextResponse.json({ error: "default_duration_minutes must be between 1 and 480" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("doctor_scheduling_settings")
      .upsert(
        {
          provider_id,
          time_interval_minutes: interval,
          default_duration_minutes: duration,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id" }
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ setting: data });
  } catch (err) {
    console.error("POST doctor-scheduling error:", err);
    return NextResponse.json({ error: "Failed to save doctor scheduling setting" }, { status: 500 });
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
      .from("doctor_scheduling_settings")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE doctor-scheduling error:", err);
    return NextResponse.json({ error: "Failed to delete doctor scheduling setting" }, { status: 500 });
  }
}
