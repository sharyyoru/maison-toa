import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { email, password, role, firstName, lastName, designation } =
      await request.json();

    if (!email || !password || !role) {
      return NextResponse.json(
        { error: "Email, password, and role are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role,
        designation,
      },
    });

    if (error || !data?.user) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to create user" },
        { status: 400 }
      );
    }

    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    const { error: insertError } = await supabaseAdmin.from("users").insert({
      id: data.user.id,
      role,
      full_name: fullName || null,
      email,
      designation,
    });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: data.user.id,
      email: data.user.email,
      role,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected error creating user" },
      { status: 500 }
    );
  }
}
