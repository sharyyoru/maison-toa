import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SETTINGS_KEY = "booking_content_translations";
const PAGE_CONFIG_KEY = "booking_page_config";
const BOOKING_PAGES_KEY = "booking_pages_config";

export async function GET() {
  try {
    // Fetch translations, page config, and all booking pages
    const [translationsResult, pageConfigResult, bookingPagesResult] = await Promise.all([
      supabaseAdmin
        .from("site_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .single(),
      supabaseAdmin
        .from("site_settings")
        .select("value")
        .eq("key", PAGE_CONFIG_KEY)
        .single(),
      supabaseAdmin
        .from("site_settings")
        .select("value")
        .eq("key", BOOKING_PAGES_KEY)
        .single(),
    ]);

    // Handle translations error (ignore PGRST116 = not found)
    if (translationsResult.error && translationsResult.error.code !== "PGRST116") {
      return NextResponse.json({ error: translationsResult.error.message }, { status: 500 });
    }

    // Handle page config error (ignore PGRST116 = not found)
    if (pageConfigResult.error && pageConfigResult.error.code !== "PGRST116") {
      return NextResponse.json({ error: pageConfigResult.error.message }, { status: 500 });
    }

    // Handle booking pages error (ignore PGRST116 = not found)
    if (bookingPagesResult.error && bookingPagesResult.error.code !== "PGRST116") {
      return NextResponse.json({ error: bookingPagesResult.error.message }, { status: 500 });
    }

    return NextResponse.json({
      translations: translationsResult.data?.value ?? {},
      pageConfig: pageConfigResult.data?.value ?? null,
      bookingPages: bookingPagesResult.data?.value ?? null,
    });
  } catch (err) {
    console.error("GET content-translations error:", err);
    return NextResponse.json({ error: "Failed to fetch translations" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { translations, pageConfig, bookingPages } = body;

    const upsertPromises = [];

    // Save translations if provided
    if (translations && typeof translations === "object") {
      upsertPromises.push(
        supabaseAdmin
          .from("site_settings")
          .upsert(
            { key: SETTINGS_KEY, value: translations, updated_at: new Date().toISOString() },
            { onConflict: "key" }
          )
      );
    }

    // Save page config if provided (legacy single page)
    if (pageConfig && typeof pageConfig === "object") {
      upsertPromises.push(
        supabaseAdmin
          .from("site_settings")
          .upsert(
            { key: PAGE_CONFIG_KEY, value: pageConfig, updated_at: new Date().toISOString() },
            { onConflict: "key" }
          )
      );
    }

    // Save all booking pages config if provided
    if (bookingPages && typeof bookingPages === "object") {
      upsertPromises.push(
        supabaseAdmin
          .from("site_settings")
          .upsert(
            { key: BOOKING_PAGES_KEY, value: bookingPages, updated_at: new Date().toISOString() },
            { onConflict: "key" }
          )
      );
    }

    if (upsertPromises.length === 0) {
      return NextResponse.json({ error: "No valid data to save" }, { status: 400 });
    }

    const results = await Promise.all(upsertPromises);
    const errors = results.filter((r) => r.error);

    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].error?.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT content-translations error:", err);
    return NextResponse.json({ error: "Failed to save data" }, { status: 500 });
  }
}
