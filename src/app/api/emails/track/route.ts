import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 1x1 transparent GIF pixel
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const emailId = searchParams.get("id");

    if (emailId && supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Update email status to "read" and set read_at timestamp
      const { error } = await supabase
        .from("emails")
        .update({
          status: "read",
          read_at: new Date().toISOString(),
        })
        .eq("id", emailId)
        .eq("direction", "outbound") // Only track outbound emails
        .is("read_at", null); // Only update if not already read

      if (error) {
        console.error("Error updating email read status:", error);
      } else {
        console.log(`Email ${emailId} marked as read`);
      }
    }

    // Always return the tracking pixel, even if update fails
    return new NextResponse(TRACKING_PIXEL, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Error in email tracking:", error);
    // Still return the pixel to avoid broken images
    return new NextResponse(TRACKING_PIXEL, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store",
      },
    });
  }
}
