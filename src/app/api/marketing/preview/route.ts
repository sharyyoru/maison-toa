import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchAudience, type MarketingFilter } from "@/lib/marketingFilters";

export const runtime = "nodejs";

/**
 * POST /api/marketing/preview
 * Body: { filter: MarketingFilter, sampleSize?: number }
 * Returns: { count, sample: PatientRow[] }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      filter?: MarketingFilter;
      sampleSize?: number;
    };

    const sampleSize = Math.max(1, Math.min(body.sampleSize ?? 10, 50));

    // Fetch up to 5000 rows (hard cap) so we get an accurate count without
    // a separate COUNT query that would ignore post-filter (dob month).
    const { rows } = await fetchAudience(supabaseAdmin, body.filter ?? {}, {
      limit: 5000,
    });

    return NextResponse.json({
      count: rows.length,
      sample: rows.slice(0, sampleSize),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/marketing/preview] Error:", error);
    return NextResponse.json(
      { error: `Preview failed: ${message}` },
      { status: 500 },
    );
  }
}
