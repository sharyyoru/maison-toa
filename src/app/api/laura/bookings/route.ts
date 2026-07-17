import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateApiKey } from "@/lib/lauraApiAuth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || !(await validateApiKey(apiKey))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return Response.json(
      { error: "from and to are required in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  const statuses = searchParams.get("status")?.split(",").map(s => s.trim()).filter(Boolean) || null;
  const sources = searchParams.get("source")?.split(",").map(s => s.trim()).filter(Boolean) || null;
  const services = searchParams.get("service")?.split(",").map(s => s.trim()).filter(Boolean) || null;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get("limit") || "500", 10)));

  const { data: result, error } = await supabaseAdmin.rpc("get_laura_bookings_json", {
    p_from: from,
    p_to: to,
    p_statuses: statuses,
    p_sources: sources,
    p_services: services,
    p_page: page,
    p_limit: limit,
  });

  if (error || !result) {
    console.error("[Laura Bookings API] RPC error:", error);
    return Response.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }

  const payload = result as { data: unknown[]; total: number };

  return Response.json({
    data: payload.data,
    meta: {
      from,
      to,
      status: searchParams.get("status") || null,
      source: searchParams.get("source") || null,
      service: searchParams.get("service") || null,
      page,
      limit,
      count: payload.data.length,
      total: payload.total,
    },
  });
}
