import { NextRequest, NextResponse } from "next/server";
import { getSwissToday, formatSwissYmd, getSwissDayOfWeek } from "@/lib/swissTimezone";

/**
 * GET /api/public/doctor-available-dates
 * 
 * Returns list of available dates for a doctor based on their schedule in the database
 * Location is always Lausanne.
 * 
 * Query params:
 * - doctorName: Doctor's name (e.g., "Dr. Claire Balbo" or "Claire Balbo")
 * - maxDaysAhead: How many days to look ahead (default: 90)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const doctorName = searchParams.get("doctorName");
    const maxDaysAhead = parseInt(searchParams.get("maxDaysAhead") || "90", 10);
    
    if (!doctorName) {
      return NextResponse.json(
        { error: "doctorName parameter is required" },
        { status: 400 }
      );
    }
    
    // Fetch doctor availability from the database (always Lausanne)
    const availRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/public/doctor-availability?doctorName=${encodeURIComponent(doctorName)}`,
      { cache: 'no-store' }
    );
    
    if (!availRes.ok) {
      console.error("[Available Dates] Error fetching doctor availability");
      return NextResponse.json({ availableDates: [], source: "error" });
    }
    
    const availData = await availRes.json();
    const availability = availData.availability || {};
    
    // If no database availability, return empty (will fall back to hardcoded on client)
    if (Object.keys(availability).length === 0) {
      return NextResponse.json({ 
        availableDates: [], 
        source: availData.source || "not_found",
        fallbackToHardcoded: true 
      });
    }
    
    // Generate available dates based on database availability
    const today = getSwissToday();
    const availableDates: string[] = [];
    
    for (let i = 1; i <= maxDaysAhead; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const dayOfWeek = getSwissDayOfWeek(checkDate);
      
      // Check if doctor has availability on this day of week
      if (availability[dayOfWeek]?.available) {
        availableDates.push(formatSwissYmd(checkDate));
      }
    }
    
    return NextResponse.json({
      availableDates,
      source: "database",
      doctorName,
    });
  } catch (error) {
    console.error("[Available Dates] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", availableDates: [] },
      { status: 500 }
    );
  }
}
