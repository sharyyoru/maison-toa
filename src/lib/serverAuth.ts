import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { User } from "@supabase/supabase-js";

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type Membership = {
  organization_id: string;
  role: string | null;
};

export type AuthContext = {
  user: User;
  membership: Membership;
};

const INTERNAL_USER_ID = "00000000-0000-0000-0000-000000000000";

// Server-to-server calls (cron, public flows triggering workflows) authenticate
// with a shared secret instead of a user token.
export function isInternalRequest(
  request: Request | NextRequest | Headers
): boolean {
  const headers = request instanceof Headers ? request : request.headers;
  const secret = process.env.INTERNAL_API_SECRET;
  return !!secret && headers.get("x-internal-api-secret") === secret;
}

function internalContext(): AuthContext {
  return {
    user: { id: INTERNAL_USER_ID } as User,
    membership: { organization_id: "", role: "owner" },
  };
}

// Extracts and verifies the caller's Supabase access token from the
// Authorization header. Returns null when missing/invalid.
export async function getUserFromRequest(
  request: Request | NextRequest | Headers
): Promise<User | null> {
  const headers = request instanceof Headers ? request : request.headers;
  const authHeader = headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

async function getMembership(
  userId: string,
  orgId?: string
): Promise<Membership | null> {
  let query = supabaseAdmin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (orgId) query = query.eq("organization_id", orgId);
  const { data } = await query.limit(1).maybeSingle();
  return (data as Membership | null) ?? null;
}

// Verified user + active membership in any organization.
export async function requireStaff(
  request: Request | NextRequest | Headers
): Promise<AuthContext> {
  if (isInternalRequest(request)) return internalContext();
  const user = await getUserFromRequest(request);
  if (!user) throw new AuthError(401, "Unauthorized");
  const membership = await getMembership(user.id);
  if (!membership) throw new AuthError(403, "Forbidden");
  return { user, membership };
}

// Verified user + active membership whose role is in `roles`.
export async function requireRole(
  request: Request | NextRequest | Headers,
  roles: string[]
): Promise<AuthContext> {
  if (isInternalRequest(request)) return internalContext();
  const user = await getUserFromRequest(request);
  if (!user) throw new AuthError(401, "Unauthorized");
  const membership = await getMembership(user.id);
  if (!membership) throw new AuthError(403, "Forbidden");
  const role = (membership.role ?? "").toLowerCase();
  if (!roles.map((r) => r.toLowerCase()).includes(role)) {
    throw new AuthError(403, "Forbidden");
  }
  return { user, membership };
}

// Verified user + active membership in the specified org (optionally role-gated).
export async function requireOrgRole(
  request: Request | NextRequest | Headers,
  orgId: string,
  roles?: string[]
): Promise<AuthContext> {
  if (isInternalRequest(request)) return internalContext();
  const user = await getUserFromRequest(request);
  if (!user) throw new AuthError(401, "Unauthorized");
  const membership = await getMembership(user.id, orgId);
  if (!membership) throw new AuthError(403, "Forbidden");
  if (roles) {
    const role = (membership.role ?? "").toLowerCase();
    if (!roles.map((r) => r.toLowerCase()).includes(role)) {
      throw new AuthError(403, "Forbidden");
    }
  }
  return { user, membership };
}

// Convenience: returns a 401/403 response for AuthError, otherwise rethrows.
export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  throw err;
}
