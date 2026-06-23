import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    if (!appUrl) {
      return NextResponse.json({ error: "Missing app URL" }, { status: 500 });
    }

    const { data: jobs, error: fetchError } = await supabaseAdmin
      .from("medidata_submission_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (fetchError) {
      console.error("[CronSubmission] Failed to fetch pending jobs:", fetchError);
      return NextResponse.json({ error: "Failed to fetch jobs", details: fetchError }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: "No pending submission jobs" });
    }

    const job = jobs[0];
    const { id, payload, retry_count } = job;

    console.log(`[CronSubmission] Processing job ${id} — invoice ${job.invoice_id}`);

    const { error: processingError } = await supabaseAdmin
      .from("medidata_submission_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", id);

    if (processingError) {
      console.error(`[CronSubmission] Failed to mark job ${id} as processing:`, processingError);
      return NextResponse.json({ error: "Failed to mark processing", details: processingError }, { status: 500 });
    }

    const sendUrl = `${appUrl}/api/medidata/send-invoice`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let result: { ok: boolean; data?: any; error?: string };
    try {
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json().catch(() => ({}));
      result = { ok: res.ok, data };
    } catch (err) {
      clearTimeout(timeout);
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (result.ok && result.data?.success) {
      const { error: completedError } = await supabaseAdmin
        .from("medidata_submission_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          submission_id: result.data.submissionId || null,
          error_message: null,
        })
        .eq("id", id);

      if (completedError) {
        console.error(`[CronSubmission] Failed to mark job ${id} completed:`, completedError);
        return NextResponse.json({ error: "Failed to mark completed", details: completedError }, { status: 500 });
      }

      console.log(`[CronSubmission] Job ${id} completed — submissionId ${result.data.submissionId}`);
      return NextResponse.json({ success: true, jobId: id, submissionId: result.data.submissionId });
    }

    const errorParts = [
      result.data?.error,
      result.data?.details,
      result.data?.abortInfo,
      result.data?.validationError,
      result.error,
    ].filter(Boolean);
    const errorMessage = errorParts.length > 0 ? errorParts.join(" | ") : "Unknown error";
    const newRetryCount = (retry_count || 0) + 1;
    const newStatus = newRetryCount >= 3 ? "failed" : "pending";

    const { error: failError } = await supabaseAdmin
      .from("medidata_submission_jobs")
      .update({
        status: newStatus,
        error_message: errorMessage,
        retry_count: newRetryCount,
        completed_at: newStatus === "failed" ? new Date().toISOString() : null,
      })
      .eq("id", id);

    if (failError) {
      console.error(`[CronSubmission] Failed to update failed job ${id}:`, failError);
      return NextResponse.json({ error: "Failed to update job", details: failError }, { status: 500 });
    }

    console.log(`[CronSubmission] Job ${id} ${newStatus === "failed" ? "failed permanently" : "will retry"}: ${errorMessage}`);
    return NextResponse.json({
      success: false,
      jobId: id,
      status: newStatus,
      retryCount: newRetryCount,
      error: errorMessage,
    });
  } catch (err) {
    console.error("[CronSubmission] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error", details: String(err) }, { status: 500 });
  }
}
