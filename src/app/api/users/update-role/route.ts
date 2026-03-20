import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, role } = body as { userId?: string; role?: string };

    if (!userId || !role) {
      return NextResponse.json(
        { error: "userId and role are required" },
        { status: 400 }
      );
    }

    // Validate role
    const allowedRoles = ["admin", "staff", "user", "expert", "contact_owner"];
    if (!allowedRoles.includes(role.toLowerCase())) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      );
    }

    // Update user metadata in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: { role: role.toLowerCase() },
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, user: data.user });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error updating user role" },
      { status: 500 }
    );
  }
}
