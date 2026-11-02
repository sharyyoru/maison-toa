import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireStaff, requireRole, authErrorResponse } from "@/lib/serverAuth";
import { headers } from "next/headers";

export async function GET() {
  let caller;
  try {
    caller = await requireRole((await headers()), ["owner","admin"]);
  } catch (err) {
    return authErrorResponse(err);
  }
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    if (error || !data?.users) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to list users" },
        { status: 500 },
      );
    }

    // Get existing users from public.users table (including provider_id for doctor-provider mapping)
    const { data: existingPublicUsers } = await supabaseAdmin
      .from("users")
      .select("id, provider_id");
    
    const existingIds = new Set((existingPublicUsers || []).map((u) => u.id));
    const providerIdMap = new Map<string, string | null>();
    for (const u of existingPublicUsers || []) {
      providerIdMap.set(u.id, u.provider_id ?? null);
    }

    // Scope to the caller's organization; authoritative roles live in
    // organization_members, not client-editable user_metadata.
    const { data: memberships } = await supabaseAdmin
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", caller.membership.organization_id)
      .eq("is_active", true);
    const roleByUser = new Map<string, string>();
    const memberIds = new Set<string>();
    for (const m of memberships || []) {
      if (m.user_id) {
        memberIds.add(m.user_id);
        if (m.role) roleByUser.set(m.user_id, m.role);
      }
    }

    // Sync missing users to public.users table to satisfy foreign key constraints
    const usersToSync = data.users.filter((user) => !existingIds.has(user.id));
    
    if (usersToSync.length > 0) {
      const syncRecords = usersToSync.map((user) => {
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const firstName = (meta["first_name"] as string) ?? null;
        const lastName = (meta["last_name"] as string) ?? null;
        const fullNameFromMeta = (meta["full_name"] as string) ?? null;
        const fullName = fullNameFromMeta || 
          (firstName && lastName ? `${firstName} ${lastName}` : null) ||
          firstName || lastName;

        return {
          id: user.id,
          email: user.email ?? null,
          full_name: fullName,
          role: roleByUser.get(user.id) ?? "staff",
          designation: (meta["designation"] as string) ?? null,
        };
      });

      // Insert missing users (ignore conflicts in case of race conditions)
      await supabaseAdmin
        .from("users")
        .upsert(syncRecords, { onConflict: "id", ignoreDuplicates: true });
    }

    const users = data.users
      .filter((user) => memberIds.has(user.id))
      .map((user) => {
      const meta = (user.user_metadata || {}) as Record<string, unknown>;
      const firstName = (meta["first_name"] as string) ?? null;
      const lastName = (meta["last_name"] as string) ?? null;
      const fullNameFromMeta = (meta["full_name"] as string) ?? null;
      
      const fullName = fullNameFromMeta || 
        (firstName && lastName ? `${firstName} ${lastName}` : null) ||
        firstName || lastName;

      return {
        id: user.id,
        email: user.email ?? null,
        full_name: fullName,
        role: roleByUser.get(user.id) ?? null,
        first_name: firstName,
        last_name: lastName,
        designation: (meta["designation"] as string) ?? null,
        created_at: (user as any).created_at ?? null,
        provider_id: providerIdMap.get(user.id) ?? null,
      };
    });

    return NextResponse.json(users);
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error listing users" },
      { status: 500 },
    );
  }
}
