import { NextRequest, NextResponse } from "next/server";
import { getDownloads, getDownload, confirmDownload } from "@/lib/medidataProxy";

/**
 * GET /api/medidata/proxy-downloads
 * Fetch pending download messages (insurer responses) from MediData via proxy.
 */
export async function GET() {
  try {
    const downloads = await getDownloads();
    return NextResponse.json({
      success: true,
      count: downloads.length,
      downloads,
    });
  } catch (error) {
    console.error("[proxy-downloads] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch downloads", downloads: [] },
      { status: 500 },
    );
  }
}

/**
 * POST /api/medidata/proxy-downloads
 * Actions: { action: "download", ref: "..." } or { action: "confirm", ref: "..." }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ref } = body;

    if (!action || !ref) {
      return NextResponse.json(
        { error: "action and ref are required" },
        { status: 400 },
      );
    }

    if (action === "download") {
      const result = await getDownload(ref);
      return NextResponse.json({
        success: result.success,
        data: result.data,
      });
    }

    if (action === "confirm") {
      const ok = await confirmDownload(ref);
      return NextResponse.json({
        success: ok,
        ref,
        confirmedAt: ok ? new Date().toISOString() : null,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'download' or 'confirm'" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[proxy-downloads] POST Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
