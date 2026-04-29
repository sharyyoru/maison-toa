import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

async function getUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const { data: { user } } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ).auth.getUser(token);
  return user?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("calendar_defaults")
      .select("id, provider_id, display_order, providers(name)")
      .eq("user_id", userId)
      .order("display_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ defaults: data || [] });
  } catch (err) {
    console.error("GET calendar-defaults error:", err);
    return NextResponse.json({ error: "Failed to fetch calendar defaults" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { provider_ids } = body as { provider_ids: string[] };

    if (!Array.isArray(provider_ids)) {
      return NextResponse.json({ error: "provider_ids must be an array" }, { status: 400 });
    }

    // Delete all existing defaults for this user
    const { error: deleteError } = await supabaseAdmin
      .from("calendar_defaults")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (provider_ids.length === 0) {
      return NextResponse.json({ defaults: [] });
    }

    const rows = provider_ids.map((provider_id, index) => ({
      user_id: userId,
      provider_id,
      display_order: index,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabaseAdmin
      .from("calendar_defaults")
      .insert(rows)
      .select("id, provider_id, display_order");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ defaults: data || [] });
  } catch (err) {
    console.error("POST calendar-defaults error:", err);
    return NextResponse.json({ error: "Failed to save calendar defaults" }, { status: 500 });
  }
}
