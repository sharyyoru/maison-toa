import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/invoices/queue-pdf
 *
 * Queues a PDF generation job to be picked up by the Vercel Cron worker.
 * Returns immediately with the job ID.
 *
 * Body: {
 *   invoiceId: string;
 *   invoiceType?: "tg" | "tp" | "reminder" | "receipt";
 *   reminderLevel?: number; // only for reminder type
 *   createdByUserId?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      invoiceId,
      invoiceType = "tg",
      reminderLevel = 1,
      createdByUserId,
    } = body;

    if (!invoiceId) {
      return NextResponse.json(
        { error: "invoiceId is required" },
        { status: 400 }
      );
    }

    const validTypes = ["tg", "tp", "reminder", "receipt"];
    if (!validTypes.includes(invoiceType)) {
      return NextResponse.json(
        { error: `invoiceType must be one of ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch invoice to denormalize useful fields and verify it exists
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, patient_id")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found", details: invoiceError },
        { status: 404 }
      );
    }

    // Dedupe: skip if there is already a pending or processing job for the same
    // invoice + type + reminder level.
    const { data: existingJobs } = await supabaseAdmin
      .from("pdf_generation_jobs")
      .select("id, status")
      .eq("invoice_id", invoiceId)
      .eq("invoice_type", invoiceType)
      .eq("reminder_level", invoiceType === "reminder" ? reminderLevel : 1)
      .in("status", ["pending", "processing"])
      .limit(1);

    if (existingJobs && existingJobs.length > 0) {
      return NextResponse.json({
        success: true,
        jobId: existingJobs[0].id,
        status: existingJobs[0].status,
        message: "A job for this invoice/type is already queued",
      });
    }

    const { data: job, error: insertError } = await supabaseAdmin
      .from("pdf_generation_jobs")
      .insert({
        invoice_id: invoiceId,
        invoice_type: invoiceType,
        reminder_level: invoiceType === "reminder" ? reminderLevel : 1,
        status: "pending",
        created_by_user_id: createdByUserId || null,
        patient_id: invoice.patient_id,
        invoice_number: invoice.invoice_number,
      })
      .select("id")
      .single();

    if (insertError || !job) {
      return NextResponse.json(
        { error: "Failed to queue PDF job", details: insertError },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: "pending",
    });
  } catch (error) {
    console.error("[QueuePDF] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
