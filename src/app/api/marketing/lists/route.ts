import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { MarketingFilter } from "@/lib/marketingFilters";

export const runtime = "nodejs";

/** GET /api/marketing/lists — list all saved lists. */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("marketing_lists")
      .select("id, name, description, filter, created_by, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ lists: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/marketing/lists — create a saved list. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      filter?: MarketingFilter;
      userId?: string | null;
    };
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from("marketing_lists")
      .insert({
        name,
        description: body.description ?? null,
        filter: body.filter ?? {},
        created_by: body.userId ?? null,
      })
      .select("id, name, description, filter, created_by, created_at, updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ list: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
