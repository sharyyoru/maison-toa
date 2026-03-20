import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    // Load auth.users (source of truth for IDs)
    const { data: authList, error: authError } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (authError || !authList?.users) {
      return NextResponse.json(
        { ok: false, error: authError?.message ?? "Failed to list auth.users" },
        { status: 500 },
      );
    }

    const authUsers = authList.users;
    const authIds = authUsers.map((u) => u.id);

    // Load public.users rows for those IDs
    const { data: appUsers, error: appError } = await supabaseAdmin
      .from("users")
      .select("id, email, full_name")
      .in("id", authIds);

    if (appError || !appUsers) {
      return NextResponse.json(
        { ok: false, error: appError?.message ?? "Failed to load public.users" },
        { status: 500 },
      );
    }

    const appById = new Map(appUsers.map((u) => [u.id, u]));

    const missingInApp = authUsers
      .filter((u) => !appById.has(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email ?? null,
      }));

    const mismatchedEmailOrName = authUsers
      .map((u) => {
        const app = appById.get(u.id);
        if (!app) return null;

        const meta = (u.user_metadata || {}) as Record<string, unknown>;
        const first = (meta["first_name"] as string) || "";
        const last = (meta["last_name"] as string) || "";
        const authFull = [first, last].filter(Boolean).join(" ") || null;

        const diffs: string[] = [];
        if (u.email && app.email && u.email !== app.email) {
          diffs.push("email");
        }
        if (authFull && app.full_name && authFull !== app.full_name) {
          diffs.push("full_name");
        }

        if (diffs.length === 0) return null;

        return {
          id: u.id,
          diffs,
          auth_email: u.email ?? null,
          app_email: app.email ?? null,
          auth_full_name: authFull,
          app_full_name: app.full_name,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      ok: true,
      totals: {
        auth_count: authUsers.length,
        app_count: appUsers.length,
      },
      missingInApp,
      mismatchedEmailOrName,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Unexpected error in users sync health check" },
      { status: 500 },
    );
  }
}
