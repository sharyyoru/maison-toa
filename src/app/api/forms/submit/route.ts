import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/forms/submit - Submit form data using token
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, submissionData } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Missing token" },
        { status: 400 }
      );
    }

    if (!submissionData || typeof submissionData !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid submission data" },
        { status: 400 }
      );
    }

    // Find the form submission by token
    const { data: submission, error: fetchError } = await supabaseAdmin
      .from("patient_form_submissions")
      .select("id, patient_id, form_id, status, expires_at")
      .eq("token", token)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json(
        { error: "Invalid or expired form link" },
        { status: 404 }
      );
    }

    // Check if expired
    if (new Date(submission.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This form link has expired" },
        { status: 410 }
      );
    }

    // Check if already submitted
    if (submission.status === "submitted") {
      return NextResponse.json(
        { error: "This form has already been submitted" },
        { status: 409 }
      );
    }

    // Update the submission with the form data
    const { error: updateError } = await supabaseAdmin
      .from("patient_form_submissions")
      .update({
        submission_data: submissionData,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", submission.id);

    if (updateError) {
      console.error("Error submitting form:", updateError);
      return NextResponse.json(
        { error: "Failed to submit form" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Form submitted successfully",
    });
  } catch (error) {
    console.error("Error submitting form:", error);
    return NextResponse.json(
      { error: "Failed to submit form" },
      { status: 500 }
    );
  }
}

// GET /api/forms/submit - Get form submission by token (for pre-filling)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing token" },
        { status: 400 }
      );
    }

    // Find the form submission by token
    const { data: submission, error: fetchError } = await supabaseAdmin
      .from("patient_form_submissions")
      .select(`
        id,
        patient_id,
        form_id,
        form_name,
        status,
        submission_data,
        expires_at,
        submitted_at,
        patients (
          first_name,
          last_name,
          email,
          dob
        )
      `)
      .eq("token", token)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json(
        { error: "Invalid or expired form link" },
        { status: 404 }
      );
    }

    // Check if expired
    if (new Date(submission.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This form link has expired", expired: true },
        { status: 410 }
      );
    }

    return NextResponse.json({
      submission: {
        id: submission.id,
        formId: submission.form_id,
        formName: submission.form_name,
        status: submission.status,
        submissionData: submission.submission_data,
        submittedAt: submission.submitted_at,
        expiresAt: submission.expires_at,
        patient: submission.patients,
      },
    });
  } catch (error) {
    console.error("Error fetching form submission:", error);
    return NextResponse.json(
      { error: "Failed to fetch form submission" },
      { status: 500 }
    );
  }
}
