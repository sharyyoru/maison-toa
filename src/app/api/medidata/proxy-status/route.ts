import { NextRequest, NextResponse } from "next/server";
import { getUploadStatus } from "@/lib/medidataProxy";

/**
 * GET /api/medidata/proxy-status?ref=xxx
 * Check transmission status via the Railway proxy.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ref = searchParams.get("ref");

    if (!ref) {
      return NextResponse.json(
        { error: "ref (transmission reference) is required" },
        { status: 400 },
      );
    }

    const result = await getUploadStatus(ref);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[proxy-status] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check status" },
      { status: 500 },
    );
  }
}
