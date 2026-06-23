import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!appUrl) {
    return NextResponse.json({ error: "Missing app URL" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(parseInt(searchParams.get("limit") || "1", 10), 3));
  const invoiceNumber = searchParams.get("invoiceNumber");

  let query = supabaseAdmin
    .from("medidata_submission_jobs")
    .select("id, invoice_id, invoice_number, payload, error_message")
    .eq("status", "failed")
    .order("created_at", { ascending: true });

  if (invoiceNumber) {
    query = query.eq("invoice_number", invoiceNumber);
  } else {
    query = query.limit(limit);
  }

  const { data: jobs, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ error: "Failed to fetch jobs", details: fetchError }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ message: "No failed submission jobs found" });
  }

  const results: Array<{
    jobId: string;
    invoiceNumber: string;
    ok: boolean;
    error?: string;
    details?: string;
    abortInfo?: string;
    validationError?: string;
    servicesCount?: number;
    xmlServiceCount?: number;
    servicesAccepted?: number;
    rejectedServices?: any[];
  }> = [];

  const validateUrl = `${appUrl}/api/medidata/send-invoice`;

  for (const job of jobs) {
    const payload = job.payload || {};
    try {
      const res = await fetch(validateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, validateOnly: true }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.validation) {
        const summary = {
          jobId: job.id,
          invoiceNumber: job.invoice_number || data.invoiceNumber || "?",
          ok: true,
          servicesCount: data.servicesCount,
          xmlServiceCount: data.xmlServiceCount,
          servicesAccepted: data.servicesAccepted,
          rejectedServices: data.rejectedServices,
        };
        results.push(summary);
        await supabaseAdmin
          .from("medidata_submission_jobs")
          .update({ error_message: `Validation OK: ${JSON.stringify(summary)}` })
          .eq("id", job.id);
      } else {
        const errorSummary = {
          jobId: job.id,
          invoiceNumber: job.invoice_number || data.invoiceNumber || "?",
          ok: false,
          error: data.error,
          details: data.details,
          abortInfo: data.abortInfo,
          validationError: data.validationError,
        };
        results.push(errorSummary);
        const parts = [data.error, data.details, data.abortInfo, data.validationError].filter(Boolean);
        await supabaseAdmin
          .from("medidata_submission_jobs")
          .update({ error_message: parts.length > 0 ? parts.join(" | ") : "Validation failed" })
          .eq("id", job.id);
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      results.push({
        jobId: job.id,
        invoiceNumber: job.invoice_number || "?",
        ok: false,
        error: errorText,
      });
      await supabaseAdmin
        .from("medidata_submission_jobs")
        .update({ error_message: `Validation request error: ${errorText}` })
        .eq("id", job.id);
    }
  }

  return NextResponse.json({
    success: true,
    validated: results.length,
    results,
  });
}
