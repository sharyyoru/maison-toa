import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/me — returns the authenticated user's server-derived role
// (public.users.role). Never reads user_metadata for authorization data.
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: staff } = await supabaseAdmin
    .from("users")
    .select("id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    id: user.id,
    email: user.email ?? null,
    full_name: (staff as { full_name?: string | null } | null)?.full_name ?? null,
    is_staff: !!staff,
    role: ((staff as { role?: string | null } | null)?.role ?? null)?.toLowerCase() ?? null,
  });
}
