import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SETTINGS_KEY = "booking_content_translations";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ translations: data?.value ?? {} });
  } catch (err) {
    console.error("GET content-translations error:", err);
    return NextResponse.json({ error: "Failed to fetch translations" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { translations } = body;

    if (!translations || typeof translations !== "object") {
      return NextResponse.json({ error: "translations must be an object" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert(
        { key: SETTINGS_KEY, value: translations, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT content-translations error:", err);
    return NextResponse.json({ error: "Failed to save translations" }, { status: 500 });
  }
}
