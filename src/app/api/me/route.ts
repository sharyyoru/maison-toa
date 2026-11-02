import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/me — returns the authenticated user's server-derived role and
// organization memberships. Never reads user_metadata for authorization data.
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: memberships } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const meta = (user.user_metadata || {}) as Record<string, unknown>;

  return NextResponse.json({
    id: user.id,
    email: user.email ?? null,
    full_name: (meta["full_name"] as string) ?? null,
    memberships: memberships ?? [],
    // Primary role = highest-privilege active membership role.
    role: memberships?.some((m) => (m.role ?? "").toLowerCase() === "admin")
      ? "admin"
      : (memberships?.[0]?.role ?? null),
  });
}
