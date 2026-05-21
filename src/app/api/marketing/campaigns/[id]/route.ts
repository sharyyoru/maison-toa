import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/marketing/campaigns/:id — campaign detail with recipients. */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const [{ data: campaign, error: campaignError }, { data: recipients, error: recipientsError }] = await Promise.all([
      supabaseAdmin
        .from("marketing_campaigns")
        .select("*")
        .eq("id", id)
        .maybeSingle(),
      supabaseAdmin
        .from("marketing_campaign_recipients")
        .select("id, patient_id, email, status, error, sent_at, opened_at, email_id")
        .eq("campaign_id", id)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(1000),
    ]);

    if (campaignError) throw campaignError;
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (recipientsError) throw recipientsError;

    return NextResponse.json({ campaign, recipients: recipients ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
