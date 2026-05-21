import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/** GET /api/marketing/campaigns — list campaign history, newest first. */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("marketing_campaigns")
      .select(
        "id, name, subject, status, total_recipients, total_sent, total_failed, total_opened, list_id, template_id, created_at, started_at, completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ campaigns: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
