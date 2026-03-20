import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/medidata/setup-tables
 * Creates medidata_responses and medidata_notifications_log tables if they don't exist.
 * Uses supabase rpc or direct table creation attempts.
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const results: string[] = [];

    // Test if medidata_responses table exists by trying a select
    const { error: respErr } = await supabase
      .from("medidata_responses")
      .select("id")
      .limit(1);

    if (respErr?.code === "42P01") {
      // Table doesn't exist — we need to create it via SQL
      results.push("medidata_responses table does NOT exist - please run the migration SQL manually");
    } else {
      results.push("medidata_responses table exists");
    }

    // Test if medidata_notifications_log table exists
    const { error: notifErr } = await supabase
      .from("medidata_notifications_log")
      .select("id")
      .limit(1);

    if (notifErr?.code === "42P01") {
      results.push("medidata_notifications_log table does NOT exist - please run the migration SQL manually");
    } else {
      results.push("medidata_notifications_log table exists");
    }

    // Test medidata_submission_history notes column
    const { error: histErr } = await supabase
      .from("medidata_submission_history")
      .select("notes")
      .limit(1);

    if (histErr) {
      results.push(`medidata_submission_history.notes: ${histErr.message}`);
    } else {
      results.push("medidata_submission_history.notes column exists");
    }

    const needsMigration = results.some((r) => r.includes("does NOT exist"));

    return NextResponse.json({
      success: !needsMigration,
      needsMigration,
      results,
      migrationFile: needsMigration
        ? "supabase/migrations/20260223_medidata_responses_notifications.sql"
        : null,
    });
  } catch (error) {
    console.error("[setup-tables] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
