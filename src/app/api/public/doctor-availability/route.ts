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

// All locations map to "lausanne" and its variants in the database
const LAUSANNE_VARIANTS = ["lausanne", "Lausanne", "Rhône", "rhone", "Champel", "champel", "Geneva", "geneva"];

function getLausanneVariants(): string[] {
  return LAUSANNE_VARIANTS;
}

/**
 * GET /api/public/doctor-availability
 * 
 * Fetches doctor availability from user_availability table
 * 
 * Query params:
 * - doctorName: Doctor's full name (e.g., "Dr. Claire Balbo")
 * - location: Location name (e.g., "Rhône", "Lausanne")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const doctorName = searchParams.get("doctorName");
    
    if (!doctorName) {
      return NextResponse.json(
        { error: "doctorName parameter is required" },
        { status: 400 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Clean doctor name (remove "Dr." prefix and extra spaces)
    const cleanName = doctorName.replace(/^Dr\.\s*/i, "").trim();
    
    // First, try to find the provider by name
    const { data: provider } = await supabase
      .from("providers")
      .select("id, name, email")
      .or(`name.ilike.%${cleanName}%,name.ilike.%${cleanName.split(" ").join("%")}%`)
      .limit(1)
      .single();
    
    if (!provider) {
      console.log(`[Doctor Availability] Provider not found for: ${doctorName}`);
      return NextResponse.json({ availability: [], source: "not_found" });
    }
    
    // Try to find a user with matching email or name
    let userId: string | null = null;
    
    if (provider.email) {
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id")
        .ilike("email", provider.email)
        .limit(1)
        .single();
      
      if (userByEmail) {
        userId = userByEmail.id;
      }
    }
    
    // If no user found by email, try by name
    if (!userId) {
      const { data: userByName } = await supabase
        .from("users")
        .select("id")
        .ilike("full_name", `%${cleanName}%`)
        .limit(1)
        .single();
      
      if (userByName) {
        userId = userByName.id;
      }
    }
    
    if (!userId) {
      console.log(`[Doctor Availability] User not found for provider: ${provider.name}`);
      return NextResponse.json({ availability: [], source: "no_user" });
    }
    
    // Fetch availability for this user (check all Lausanne location variants)
    const locationVariants = getLausanneVariants();
    const { data: availability, error } = await supabase
      .from("user_availability")
      .select("*")
      .eq("user_id", userId)
      .in("location", locationVariants)
      .order("day_of_week", { ascending: true });
    
    if (error) {
      console.error("[Doctor Availability] Error fetching availability:", error);
      return NextResponse.json(
        { error: "Failed to fetch availability" },
        { status: 500 }
      );
    }
    
    // Transform to a more usable format
    const availabilityMap: Record<number, { start: string; end: string; available: boolean }> = {};
    
    (availability || []).forEach((entry: UserAvailability) => {
      if (entry.is_available) {
        availabilityMap[entry.day_of_week] = {
          start: entry.start_time.slice(0, 5), // HH:MM format
          end: entry.end_time.slice(0, 5),
          available: true,
        };
      }
    });
    
    return NextResponse.json({
      availability: availabilityMap,
      source: "database",
      providerId: provider.id,
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
