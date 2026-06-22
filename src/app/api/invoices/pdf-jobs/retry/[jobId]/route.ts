import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/invoices/pdf-jobs/[jobId]/retry
 *
 * Resets a failed PDF generation job to pending so the cron will pick it up again.
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

    const { data: job, error: fetchError } = await supabaseAdmin
      .from("pdf_generation_jobs")
      .select("id, status")
      .eq("id", jobId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "failed") {
      return NextResponse.json({ error: "Only failed jobs can be retried" }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("pdf_generation_jobs")
      .update({
        status: "pending",
        error_message: null,
        retry_count: 0,
        completed_at: null,
      })
      .eq("id", jobId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to retry job", details: updateError }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobId, status: "pending" });
  } catch (error) {
    console.error("[PDFJobRetry] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
