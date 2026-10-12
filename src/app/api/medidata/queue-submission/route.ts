import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveInsuranceDiagnosisCodes } from "@/lib/insuranceDiagnosisCodes";
import { applySupersede, evaluateSubmissionGuard } from "@/lib/medidataSubmissionGuard";
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

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const { invoiceId, patientId } = payload;

    if (!invoiceId) {
      return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
    }

    // Resolve invoice number and patient id
    const { data: invoice, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, patient_id, diagnosis_codes")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const resolvedPatientId = patientId || invoice.patient_id;
    if (resolveInsuranceDiagnosisCodes(invoice.diagnosis_codes).length === 0) {
      return NextResponse.json(
        { error: "Invoice requires at least one valid ICD-10 diagnosis code before insurance submission" },
        { status: 422 },
      );
    }

    // Idempotency guard. The previous check here only looked for an in-flight
    // JOB, so once a job completed the same invoice could be queued again and
    // sent to the insurer a second time — the cause of ~107 duplicate
    // rejections. The guard also inspects medidata_submissions and, for a
    // previously rejected invoice, the insurer's own reject codes.
    const guard = await evaluateSubmissionGuard(supabaseAdmin, invoiceId);

    if (guard.outcome === "JOB_IN_FLIGHT") {
      // Not an error: the caller gets the job it already has.
      return NextResponse.json({
        jobId: guard.existingJobId,
        status: "pending",
        message: guard.message,
      });
    }

    if (!guard.allowed) {
      return NextResponse.json(
        {
          error: guard.message,
          outcome: guard.outcome,
          requiresStorno: guard.requiresStorno,
          previousSubmissionId: guard.previousSubmissionId,
          previousStatus: guard.previousStatus,
          rejectionClass: guard.rejectionClass,
        },
        { status: 409 },
      );
    }

    // A stale pending submission must be retired BEFORE the new one is created,
    // otherwise the medidata_submissions_one_active_per_invoice index would
    // reject exactly what the guard just permitted.
    if (guard.supersede) {
      await applySupersede(supabaseAdmin, guard.supersede);
      console.log(
        `[QueueSubmission] superseded stale submission ${guard.supersede.submissionId} for invoice ${invoiceId}`,
      );
    }

    const { data: job, error: insertErr } = await supabaseAdmin
      .from("medidata_submission_jobs")
      .insert({
        invoice_id: invoiceId,
        patient_id: resolvedPatientId,
        invoice_number: invoice.invoice_number,
        status: "pending",
        created_by_user_id: userId,
        payload,
      })
      .select("id, status")
      .single();

    if (insertErr || !job) {
      console.error("[QueueSubmission] insert error:", insertErr);
      return NextResponse.json({ error: "Failed to queue submission" }, { status: 500 });
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      message: "Insurance submission queued",
    });
  } catch (err) {
    console.error("[QueueSubmission] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
