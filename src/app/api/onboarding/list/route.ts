import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load tokens
    const { data: tokens, error: tokenError } = await supabase
      .from("clinic_onboarding_tokens")
      .select("*")
      .order("created_at", { ascending: false });

    if (tokenError) {
      console.error("Error loading tokens:", tokenError);
      return NextResponse.json(
        { error: "Failed to load tokens" },
        { status: 500 }
      );
    }

    // Load submissions
    const { data: submissions, error: subError } = await supabase
      .from("clinic_onboarding_submissions")
      .select("*")
      .order("created_at", { ascending: false });

    if (subError) {
      console.error("Error loading submissions:", subError);
      return NextResponse.json(
        { error: "Failed to load submissions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tokens: tokens || [],
      submissions: submissions || [],
    });
  } catch (error) {
    console.error("Error in list:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
