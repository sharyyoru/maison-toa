import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

async function getUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const { data: { user } } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ).auth.getUser(token);
  return user?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(rawLimit, 1), 200);
    const forAll = searchParams.get("forAll") === "true";
    const patientId = searchParams.get("patientId");
    const status = searchParams.get("status");

    let query = supabaseAdmin
      .from("medidata_submission_jobs")
      .select("*, patients:patient_id (id, first_name, last_name, email)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!forAll) {
      query = query.eq("created_by_user_id", userId);
    }

    if (patientId) {
      query = query.eq("patient_id", patientId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: jobs, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch submission jobs", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ jobs: jobs || [] });
  } catch (error) {
    console.error("[SubmissionJobs] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
