import { NextRequest, NextResponse } from "next/server";
import { getParticipants } from "@/lib/medidataProxy";

/**
 * GET /api/medidata/proxy-participants?lawtype=1&limit=50&offset=0&name=CSS
 * Fetch participants (insurers) directly from MediData via the Railway proxy.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lawtype = searchParams.get("lawtype");
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");
    const name = searchParams.get("name");
    const glnparticipant = searchParams.get("glnparticipant");

    const query: Record<string, string | number> = {};
    if (lawtype) query.lawtype = Number(lawtype);
    if (limit) query.limit = Number(limit);
    if (offset) query.offset = Number(offset);
    if (name) query.name = name;
    if (glnparticipant) query.glnparticipant = glnparticipant;

    const participants = await getParticipants(query as any);

    return NextResponse.json({
      success: true,
      source: "medidata-proxy",
      count: participants.length,
      participants,
    });
  } catch (error) {
    console.error("[proxy-participants] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch participants", participants: [] },
      { status: 500 },
    );
  }
}
