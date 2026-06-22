import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Vercel Cron: /api/cron/process-pdf-jobs
 *
 * Runs every minute. Picks up one pending PDF generation job and calls the
 * existing generate-pdf endpoint. Vercel serverless functions have a 60s timeout
 * (Hobby) or 300s (Pro), so we intentionally process only one job per run to
 * avoid being killed mid-generation.
 */

export async function GET(request: NextRequest) {
  // Vercel Cron uses Authorization header to identify itself
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    if (!appUrl) {
      return NextResponse.json({ error: "Missing app URL" }, { status: 500 });
    }

    // Pick the oldest pending job
    const { data: jobs, error: fetchError } = await supabaseAdmin
      .from("pdf_generation_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (fetchError) {
      console.error("[CronPDF] Failed to fetch pending jobs:", fetchError);
      return NextResponse.json({ error: "Failed to fetch jobs", details: fetchError }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: "No pending jobs" });
    }

    const job = jobs[0];
    const { id, invoice_id, invoice_type, reminder_level } = job;

    console.log(`[CronPDF] Processing job ${id} — invoice ${invoice_id} (${invoice_type})`);

    // Mark as processing
    const { error: processingError } = await supabaseAdmin
      .from("pdf_generation_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", id);

    if (processingError) {
      console.error(`[CronPDF] Failed to mark job ${id} as processing:`, processingError);
      return NextResponse.json({ error: "Failed to mark processing", details: processingError }, { status: 500 });
    }

    // Call the generate-pdf endpoint
    const generateUrl = `${appUrl}/api/invoices/generate-pdf`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let result: { ok: boolean; data?: any; error?: string };
    try {
      const res = await fetch(generateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice_id,
          invoiceType: invoice_type,
          reminderLevel: invoice_type === "reminder" ? (reminder_level || 1) : 1,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json().catch(() => ({}));
      result = { ok: res.ok, data };
    } catch (err) {
      clearTimeout(timeout);
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (result.ok && result.data?.success && result.data?.pdfPath) {
      const { error: completedError } = await supabaseAdmin
        .from("pdf_generation_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          pdf_path: result.data.pdfPath,
          pdf_url: result.data.pdfUrl || null,
          error_message: null,
        })
        .eq("id", id);

      if (completedError) {
        console.error(`[CronPDF] Failed to mark job ${id} completed:`, completedError);
        return NextResponse.json({ error: "Failed to mark completed", details: completedError }, { status: 500 });
      }

      console.log(`[CronPDF] Job ${id} completed — ${result.data.pdfPath}`);
      return NextResponse.json({ success: true, jobId: id, pdfPath: result.data.pdfPath });
    }

    // Failure / retry
    const errorMessage = result.data?.error || result.data?.details || result.error || "Unknown error";
    const newRetryCount = (job.retry_count || 0) + 1;
    const newStatus = newRetryCount >= 3 ? "failed" : "pending";

    const { error: failError } = await supabaseAdmin
      .from("pdf_generation_jobs")
      .update({
        status: newStatus,
        error_message: errorMessage,
        retry_count: newRetryCount,
        completed_at: newStatus === "failed" ? new Date().toISOString() : null,
      })
      .eq("id", id);

    if (failError) {
      console.error(`[CronPDF] Failed to update failed job ${id}:`, failError);
      return NextResponse.json({ error: "Failed to update job", details: failError }, { status: 500 });
    }

    console.log(`[CronPDF] Job ${id} ${newStatus === "failed" ? "failed permanently" : "will retry"}: ${errorMessage}`);
    return NextResponse.json({
      success: false,
      jobId: id,
      status: newStatus,
      retryCount: newRetryCount,
      error: errorMessage,
    });
  } catch (err) {
    console.error("[CronPDF] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error", details: String(err) }, { status: 500 });
  }
}
