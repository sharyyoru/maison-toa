import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateApiKey } from "@/lib/lauraApiAuth";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || !(await validateApiKey(apiKey))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: result, error } = await supabaseAdmin.rpc("get_laura_bookings_filters");

  if (error || !result) {
    console.error("[Laura Bookings Filters API] RPC error:", error);
    return Response.json({ error: "Failed to fetch filters" }, { status: 500 });
  }

  const payload = result as { statuses: string[]; sources: string[]; services: string[] };

  return Response.json({
    statuses: payload.statuses,
    sources: payload.sources,
    services: payload.services,
  });
}
