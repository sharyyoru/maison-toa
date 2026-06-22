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
      .select("id, invoice_number, patient_id")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const resolvedPatientId = patientId || invoice.patient_id;

    // Dedupe: if a pending or processing job exists for this invoice, return it
    const { data: existingJobs } = await supabaseAdmin
      .from("medidata_submission_jobs")
      .select("id, status, created_at")
      .eq("invoice_id", invoiceId)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingJobs && existingJobs.length > 0) {
      return NextResponse.json({
        jobId: existingJobs[0].id,
        status: existingJobs[0].status,
        message: "A submission for this invoice is already queued",
      });
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
