import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, authErrorResponse } from "@/lib/serverAuth";

// POST /api/users/update-role — caller must be owner/admin of an organization
// that the target user also belongs to. Authoritative role lives in
// organization_members.role; user_metadata is never trusted.
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ["owner", "admin"]);
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

    const allowedRoles = [
      "owner",
      "admin",
      "doctor",
      "staff",
      "receptionist",
      "billing",
    ];
    if (!allowedRoles.includes(role.toLowerCase())) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const newRole = role.toLowerCase();

    // Target must be a member of the caller's organization.
    const { data: targetMembership } = await supabaseAdmin
      .from("organization_members")
      .select("id, role")
      .eq("organization_id", caller.membership.organization_id)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (!targetMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("organization_members")
      .update({ role: newRole })
      .eq("id", targetMembership.id);

    if (error) {
      return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
    }

    // Mirror onto public.users for display only (not authorization).
    await supabaseAdmin.from("users").update({ role: newRole }).eq("id", userId);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Unexpected error updating user role" },
      { status: 500 }
    );
  }
}
