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

/**
 * POST /api/invoices/pdf-jobs/[jobId]/flag
 *
 * Flags a PDF generation job for support review. Sets support_flagged_at and
 * support_flagged_by_user_id so admins can query the DB for jobs needing help.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const userId = await getUserId(request);

    const { data: job, error: fetchError } = await supabaseAdmin
      .from("pdf_generation_jobs")
      .select("id")
      .eq("id", jobId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("pdf_generation_jobs")
      .update({
        support_flagged_at: new Date().toISOString(),
        support_flagged_by_user_id: userId,
      })
      .eq("id", jobId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to flag job", details: updateError }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobId, flagged: true });
  } catch (error) {
    console.error("[PDFJobFlag] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
