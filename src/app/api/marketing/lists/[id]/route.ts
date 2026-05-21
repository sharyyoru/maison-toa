import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { MarketingFilter } from "@/lib/marketingFilters";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/marketing/lists/:id */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("marketing_lists")
      .select("id, name, description, filter, created_by, created_at, updated_at")
      .eq("id", id)
      .single();
    if (error) throw error;
    return NextResponse.json({ list: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/marketing/lists/:id */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      filter?: MarketingFilter;
    };
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") update.name = body.name.trim();
    if (body.description !== undefined) update.description = body.description;
    if (body.filter !== undefined) update.filter = body.filter;
    const { data, error } = await supabaseAdmin
      .from("marketing_lists")
      .update(update)
      .eq("id", id)
      .select("id, name, description, filter, created_by, created_at, updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ list: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/marketing/lists/:id */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin
      .from("marketing_lists")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
