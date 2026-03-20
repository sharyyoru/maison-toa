import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type AvailabilityPayload = {
  userId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  location?: string;
};

// GET - Fetch availability for all users or specific user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let query = supabase
      .from("user_availability")
      .select("*")
      .order("day_of_week", { ascending: true });
    
    if (userId) {
      query = query.eq("user_id", userId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error("Error fetching availability:", error);
      return NextResponse.json(
        { error: "Failed to fetch availability", details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ availability: data || [] });
  } catch (error) {
    console.error("Error in availability GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create or update availability
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AvailabilityPayload;
    const { userId, dayOfWeek, startTime, endTime, isAvailable, location = "Geneva" } = body;
    
    if (!userId || dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Missing required fields: userId, dayOfWeek, startTime, endTime" },
        { status: 400 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Upsert - update if exists, insert if not
    const { data, error } = await supabase
      .from("user_availability")
      .upsert(
        {
          user_id: userId,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          is_available: isAvailable,
          location,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,day_of_week,location",
        }
      )
      .select()
      .single();
    
    if (error) {
      console.error("Error saving availability:", error);
      return NextResponse.json(
        { error: "Failed to save availability", details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ ok: true, availability: data });
  } catch (error) {
    console.error("Error in availability POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Remove availability entry
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { error } = await supabase
      .from("user_availability")
      .delete()
      .eq("id", id);
    
    if (error) {
      console.error("Error deleting availability:", error);
      return NextResponse.json(
        { error: "Failed to delete availability", details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in availability DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
