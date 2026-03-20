import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate a secure token
    const token = crypto.randomBytes(32).toString("hex");
    
    // Token expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create the token record
    const { data: tokenData, error: tokenError } = await supabase
      .from("clinic_onboarding_tokens")
      .insert({
        email: email.trim().toLowerCase(),
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, token")
      .single();

    if (tokenError) {
      console.error("Error creating token:", tokenError);
      return NextResponse.json(
        { error: "Failed to create onboarding link" },
        { status: 500 }
      );
    }

    // Build the magic link URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aestheticclinic.vercel.app";
    const magicLink = `${baseUrl}/onboarding?token=${token}`;

    return NextResponse.json({
      ok: true,
      magicLink,
      expiresAt: expiresAt.toISOString(),
      tokenId: tokenData.id,
    });
  } catch (error) {
    console.error("Error in create-link:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
