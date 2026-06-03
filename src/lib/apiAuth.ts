import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Extract and verify the authenticated user from a request's Authorization header.
 * Returns the user object or null if unauthenticated.
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  return user ?? null;
}

/**
 * Check if the authenticated user has an admin role.
 */
export async function getAdminUser(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;

  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!data || data.role !== "admin") return null;
  return user;
}
