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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { jobId } = await params;
  try {
    const { data: job } = await supabaseAdmin
      .from("medidata_submission_jobs")
      .select("id, support_flagged_at")
      .eq("id", jobId)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const updates = job.support_flagged_at
      ? { support_flagged_at: null, support_flagged_by_user_id: null }
      : { support_flagged_at: new Date().toISOString(), support_flagged_by_user_id: userId };

    const { error } = await supabaseAdmin
      .from("medidata_submission_jobs")
      .update(updates)
      .eq("id", jobId);

    if (error) {
      return NextResponse.json({ error: "Failed to flag job", details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, flagged: !job.support_flagged_at });
  } catch (err) {
    return NextResponse.json({ error: "Internal error", details: String(err) }, { status: 500 });
  }
}
