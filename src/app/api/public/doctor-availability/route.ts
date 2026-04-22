import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type UserAvailability = {
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  location: string;
};

/**
 * GET /api/public/doctor-availability
 *
 * Fetches doctor availability from user_availability table.
 * Looks up the user directly by name from booking_doctors (via slug) or doctorName param.
 *
 * Query params:
 * - doctorSlug: Doctor's URL slug (e.g., "claire-balbo") — preferred
 * - doctorName: Doctor's full name fallback (e.g., "Claire Balbo")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const doctorSlug = searchParams.get("doctorSlug");
    const doctorName = searchParams.get("doctorName");

    if (!doctorSlug && !doctorName) {
      return NextResponse.json(
        { error: "doctorSlug or doctorName parameter is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve the canonical name from booking_doctors when slug is provided
    let canonicalName = doctorName || "";
    if (doctorSlug) {
      const { data: bookingDoctor } = await supabase
        .from("booking_doctors")
        .select("name")
        .eq("slug", doctorSlug)
        .single();
      if (bookingDoctor?.name) {
        // Strip "Dr." prefix for the users table lookup
        canonicalName = bookingDoctor.name.replace(/^Dr\.\s*/i, "").trim();
      }
    } else if (doctorName) {
      canonicalName = doctorName.replace(/^Dr\.\s*/i, "").trim();
    }

    if (!canonicalName) {
      return NextResponse.json({ availability: {}, source: "not_found" });
    }

    // Search users table directly by full_name — no providers indirection
    const { data: matchedUser } = await supabase
      .from("users")
      .select("id")
      .ilike("full_name", `%${canonicalName}%`)
      .limit(1)
      .single();

    if (!matchedUser) {
      console.log(`[Doctor Availability] User not found for name: ${canonicalName}`);
      return NextResponse.json({ availability: {}, source: "no_user" });
    }

    const userId = matchedUser.id;

    // Fetch all availability rows for this user (any location)
    const { data: availability, error } = await supabase
      .from("user_availability")
      .select("*")
      .eq("user_id", userId)
      .order("day_of_week", { ascending: true });

    if (error) {
      console.error("[Doctor Availability] Error fetching availability:", error);
      return NextResponse.json(
        { error: "Failed to fetch availability" },
        { status: 500 }
      );
    }

    // Build a map: day_of_week → { start, end, available }
    // Prefer "Lausanne" location entries; fall back to any other location
    const lausanneEntries = (availability || []).filter(
      (e: UserAvailability) => e.location.toLowerCase() === "lausanne"
    );
    const entriesToUse = lausanneEntries.length > 0 ? lausanneEntries : (availability || []);

    const availabilityMap: Record<number, { start: string; end: string; available: boolean }> = {};

    entriesToUse.forEach((entry: UserAvailability) => {
      availabilityMap[entry.day_of_week] = {
        start: entry.start_time.slice(0, 5),
        end: entry.end_time.slice(0, 5),
        available: entry.is_available,
      };
    });

    return NextResponse.json({
      availability: availabilityMap,
      source: "database",
      userId,
    });
  } catch (error) {
    console.error("[Doctor Availability] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
