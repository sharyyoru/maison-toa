import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Doctor calendars are loaded from users table, not providers
    let query = supabase
      .from("users")
      .select("id, full_name, email, created_at")
      .order("full_name", { ascending: true });

    if (name) {
      query = query.ilike("full_name", `%${name}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error finding providers:", error);
      return NextResponse.json({ error: "Failed to find providers" }, { status: 500 });
    }

    return NextResponse.json({ providers: data });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Failed to find duplicates", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
