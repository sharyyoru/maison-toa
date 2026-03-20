import { NextRequest, NextResponse } from "next/server";
import { getNotifications, confirmNotification } from "@/lib/medidataProxy";

/**
 * GET /api/medidata/proxy-notifications
 * Fetch notifications from MediData via proxy.
 */
export async function GET() {
  try {
    const result = await getNotifications();
    const notifications = Array.isArray(result.data) ? result.data : [];
    return NextResponse.json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error("[proxy-notifications] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch notifications", notifications: [] },
      { status: 500 },
    );
  }
}

/**
 * POST /api/medidata/proxy-notifications
 * Confirm a notification: { action: "confirm", id: 123 }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, id } = body;

    if (action === "confirm" && id != null) {
      const ok = await confirmNotification(id);
      return NextResponse.json({
        success: ok,
        id,
        confirmedAt: ok ? new Date().toISOString() : null,
      });
    }

    return NextResponse.json(
      { error: "Invalid request. Use { action: 'confirm', id: <number> }" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[proxy-notifications] POST Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
