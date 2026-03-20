import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const firstName = searchParams.get("first_name");
    const lastName = searchParams.get("last_name");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabase
      .from("patients")
      .select("id, first_name, last_name, email, phone, created_at")
      .order("created_at", { ascending: true });

    if (firstName) {
      query = query.ilike("first_name", `%${firstName}%`);
    }
    if (lastName) {
      query = query.ilike("last_name", `%${lastName}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error finding patients:", error);
      return NextResponse.json({ error: "Failed to find patients" }, { status: 500 });
    }

    return NextResponse.json({ patients: data });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Failed to find duplicates", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
