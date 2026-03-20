import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the token
    const { data: tokenData, error: tokenError } = await supabase
      .from("clinic_onboarding_tokens")
      .select("id, email, expires_at, used_at")
      .eq("token", token)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: "Invalid or expired link" },
        { status: 404 }
      );
    }

    // Check if expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This link has expired. Please request a new one." },
        { status: 410 }
      );
    }

    // Check for existing submission with this token
    const { data: existingSubmission } = await supabase
      .from("clinic_onboarding_submissions")
      .select("id, status, current_step")
      .eq("token_id", tokenData.id)
      .single();

    if (existingSubmission) {
      // Return existing submission
      return NextResponse.json({
        ok: true,
        submissionId: existingSubmission.id,
        email: tokenData.email,
        currentStep: existingSubmission.current_step,
        status: existingSubmission.status,
        isExisting: true,
      });
    }

    // Create new submission
    const { data: newSubmission, error: subError } = await supabase
      .from("clinic_onboarding_submissions")
      .insert({
        token_id: tokenData.id,
        practice_email: tokenData.email,
        status: "in_progress",
        current_step: 1,
      })
      .select("id")
      .single();

    if (subError) {
      console.error("Error creating submission:", subError);
      return NextResponse.json(
        { error: "Failed to start onboarding" },
        { status: 500 }
      );
    }

    // Mark token as used
    await supabase
      .from("clinic_onboarding_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenData.id);

    return NextResponse.json({
      ok: true,
      submissionId: newSubmission.id,
      email: tokenData.email,
      currentStep: 1,
      status: "in_progress",
      isExisting: false,
    });
  } catch (error) {
    console.error("Error in validate-token:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
