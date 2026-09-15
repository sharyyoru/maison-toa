import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Builds a specific, actionable error message from a generate-pdf failure
 * response instead of just its generic top-level `error` field (e.g.
 * "Sumex1 PDF generation failed" on its own). Surfaces `details`/`abortInfo`/
 * `technicalDetails` when present so the real cause (e.g. an invalid IBAN)
 * shows up directly in the job queue instead of requiring a manual dig-in.
 */
function buildJobErrorMessage(data: any, fallbackError?: string): string {
  if (!data) return fallbackError || "Unknown error";

  const parts: string[] = [];
  if (data.error) parts.push(String(data.error));

  if (data.details) {
    const detailsStr = typeof data.details === "string" ? data.details : JSON.stringify(data.details);
    if (detailsStr && detailsStr !== "{}" && !parts.includes(detailsStr)) {
      parts.push(detailsStr);
    }
  }
  if (data.abortInfo) parts.push(`abortInfo: ${data.abortInfo}`);
  if (data.technicalDetails) parts.push(String(data.technicalDetails));

  return parts.length > 0 ? parts.join(" — ") : (fallbackError || "Unknown error");
}

/**
 * Vercel Cron: /api/cron/process-pdf-jobs
 *
 * Runs every minute AND is kicked immediately by /api/invoices/queue-pdf when
 * a job is enqueued (so users don't wait for the next cron tick — this was
 * the ~20-30s "generation" delay users experienced; actual generation is ~4s).
 *
 * Processes pending jobs in a loop within a time budget. Jobs are claimed
 * atomically (UPDATE ... WHERE status='pending') so concurrent invocations
 * (cron tick + immediate kicks) never double-process a job.
 */

export const maxDuration = 300;

// Leave headroom for the final job's generation before the function timeout.
const TIME_BUDGET_MS = 240_000;
const PER_JOB_TIMEOUT_MS = 55_000;

async function processOneJob(appUrl: string): Promise<
  | { outcome: "empty" }
  | { outcome: "claimed_elsewhere" }
  | { outcome: "completed" | "retry" | "failed"; jobId: string; error?: string }
> {
  // Pick the oldest pending job
  const { data: jobs, error: fetchError } = await supabaseAdmin
    .from("pdf_generation_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (fetchError) throw new Error(`Failed to fetch jobs: ${JSON.stringify(fetchError)}`);
  if (!jobs || jobs.length === 0) return { outcome: "empty" };

  const job = jobs[0];
  const { id, invoice_id, invoice_type, reminder_level } = job;

  // Atomic claim: only proceed if WE flipped it from pending to processing.
  const { data: claimed } = await supabaseAdmin
    .from("pdf_generation_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (!claimed || claimed.length === 0) return { outcome: "claimed_elsewhere" };

  console.log(`[CronPDF] Processing job ${id} — invoice ${invoice_id} (${invoice_type})`);

  // Call the generate-pdf endpoint
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_JOB_TIMEOUT_MS);

  let result: { ok: boolean; data?: any; error?: string };
  try {
    const res = await fetch(`${appUrl}/api/invoices/generate-pdf`, {
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
    await supabaseAdmin
      .from("pdf_generation_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        pdf_path: result.data.pdfPath,
        pdf_url: result.data.pdfUrl || null,
        error_message: null,
      })
      .eq("id", id);
    console.log(`[CronPDF] Job ${id} completed — ${result.data.pdfPath}`);
    return { outcome: "completed", jobId: id };
  }

  // Failure / retry
  const errorMessage = buildJobErrorMessage(result.data, result.error);
  const newRetryCount = (job.retry_count || 0) + 1;
  const newStatus = newRetryCount >= 3 ? "failed" : "pending";

  await supabaseAdmin
    .from("pdf_generation_jobs")
    .update({
      status: newStatus,
      error_message: errorMessage,
      retry_count: newRetryCount,
      completed_at: newStatus === "failed" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  console.log(`[CronPDF] Job ${id} ${newStatus === "failed" ? "failed permanently" : "will retry"}: ${errorMessage}`);
  return { outcome: newStatus === "failed" ? "failed" : "retry", jobId: id, error: errorMessage };
}

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

    const started = Date.now();
    const processed: Array<{ jobId: string; outcome: string; error?: string }> = [];

    while (Date.now() - started < TIME_BUDGET_MS) {
      const r = await processOneJob(appUrl);
      if (r.outcome === "empty" || r.outcome === "claimed_elsewhere") break;
      processed.push({ jobId: r.jobId, outcome: r.outcome, error: r.error });
      // A permanently failed retry loop shouldn't spin forever in one run.
      if (processed.length >= 50) break;
    }

    return NextResponse.json({
      success: true,
      processed: processed.length,
      jobs: processed,
    });
  } catch (err) {
    console.error("[CronPDF] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error", details: String(err) }, { status: 500 });
  }
}
