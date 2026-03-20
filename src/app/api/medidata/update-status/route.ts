import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/supabaseClient";
import { type MediDataInvoiceStatus } from "@/lib/medidata";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      submissionId, 
      newStatus,
      responseCode,
      responseMessage,
      paidAmount,
      paidDate,
    } = body;

    if (!submissionId || !newStatus) {
      return NextResponse.json(
        { error: "Submission ID and new status are required" },
        { status: 400 }
      );
    }

    // Verify user authentication
    const { data: authData } = await supabaseClient.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get current submission
    const { data: submission, error: fetchError } = await supabaseClient
      .from("medidata_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    const previousStatus = submission.status;

    // Build update object
    const updateData: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // Add response fields if provided
    if (responseCode) {
      updateData.insurance_response_code = responseCode;
    }
    if (responseMessage) {
      updateData.insurance_response_message = responseMessage;
    }
    if (paidAmount !== undefined) {
      updateData.insurance_paid_amount = paidAmount;
    }
    if (paidDate) {
      updateData.insurance_paid_date = paidDate;
    }

    // Set response date for insurance-related statuses
    if (['accepted', 'rejected', 'partially_paid', 'paid'].includes(newStatus)) {
      updateData.insurance_response_date = new Date().toISOString();
    }

    // Update transmission date for pending status
    if (newStatus === 'pending') {
      updateData.medidata_transmission_date = new Date().toISOString();
    }

    // Update submission
    const { data: updatedSubmission, error: updateError } = await supabaseClient
      .from("medidata_submissions")
      .update(updateData)
      .eq("id", submissionId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating submission:", updateError);
      return NextResponse.json(
        { error: "Failed to update submission" },
        { status: 500 }
      );
    }

    // Record status change in history
    await supabaseClient.from("medidata_submission_history").insert({
      submission_id: submissionId,
      previous_status: previousStatus,
      new_status: newStatus,
      response_code: responseCode || null,
      response_message: responseMessage || null,
      changed_by: authData.user.id,
    });

    // Sync insurance payment status to the invoice
    if (['paid', 'partially_paid'].includes(newStatus) && submission.invoice_id) {
      const paidAt = new Date().toISOString();
      const { error: invoiceUpdateError } = await supabaseClient
        .from("invoices")
        .update({
          insurance_payment_status: newStatus,
          insurance_paid_amount: paidAmount || null,
          insurance_paid_date: paidDate || paidAt,
        })
        .eq("id", submission.invoice_id);

      if (invoiceUpdateError) {
        console.error("Error syncing insurance payment to invoice:", invoiceUpdateError);
      }
    }

    return NextResponse.json({
      success: true,
      submission: updatedSubmission,
      invoiceSynced: ['paid', 'partially_paid'].includes(newStatus),
    });
  } catch (error) {
    console.error("Error in update-status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch submission status and history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get("submissionId");
    const consultationId = searchParams.get("consultationId");

    // Verify user authentication
    const { data: authData } = await supabaseClient.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    let query = supabaseClient
      .from("medidata_submissions")
      .select(`
        *,
        history:medidata_submission_history(*)
      `);

    if (submissionId) {
      query = query.eq("id", submissionId);
    } else if (consultationId) {
      // Support both invoice_id and legacy consultation_id lookups
      query = query.or(`invoice_id.eq.${consultationId},consultation_id.eq.${consultationId}`);
    } else {
      return NextResponse.json(
        { error: "Submission ID or Invoice ID is required" },
        { status: 400 }
      );
    }

    const { data: submissions, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching submissions:", error);
      return NextResponse.json(
        { error: "Failed to fetch submissions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      submissions: submissions || [],
    });
  } catch (error) {
    console.error("Error in get-status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
