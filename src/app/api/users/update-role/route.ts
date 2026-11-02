import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, authErrorResponse } from "@/lib/serverAuth";

// POST /api/users/update-role — admin only. Authoritative role lives in
// public.users.role (service-role writable only); user_metadata is never
// trusted for authorization.
export async function POST(request: Request) {
  try {
    await requireRole(request, ["owner", "admin"]);
  } catch (err) {
    return authErrorResponse(err);
  }

  try {
    const body = await request.json();
    const { userId, role } = body as { userId?: string; role?: string };

    if (!userId || !role) {
      return NextResponse.json(
        { error: "userId and role are required" },
        { status: 400 }
      );
    }

    const allowedRoles = ["admin", "staff", "user", "expert", "contact_owner", "doctor", "nurse", "technician"];
    const newRole = role.toLowerCase();
    if (!allowedRoles.includes(newRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const { data: target } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) {
      return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
    }

    // Keep display metadata in sync (NOT used for authorization).
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { role: newRole },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Unexpected error updating user role" },
      { status: 500 }
    );
  }
}
