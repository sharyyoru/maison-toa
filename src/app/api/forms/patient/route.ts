import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/forms/patient?patientId=xxx - Get all form submissions for a patient
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");

    if (!patientId) {
      return NextResponse.json(
        { error: "Missing patientId" },
        { status: 400 }
      );
    }

    const { data: submissions, error } = await supabaseAdmin
      .from("patient_form_submissions")
      .select(`
        id,
        form_id,
        form_name,
        status,
        submission_data,
        submitted_at,
        created_at,
        expires_at,
        reviewed_by,
        reviewed_at,
        notes,
        token
      `)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching patient forms:", error);
      return NextResponse.json(
        { error: "Failed to fetch patient forms" },
        { status: 500 }
      );
    }

    // Generate form URLs for pending submissions
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const submissionsWithUrls = (submissions || []).map((sub) => ({
      ...sub,
      formUrl: sub.status === "pending" ? `${appUrl}/form/${sub.form_id}?token=${sub.token}` : null,
    }));

    return NextResponse.json({ submissions: submissionsWithUrls });
  } catch (error) {
    console.error("Error fetching patient forms:", error);
    return NextResponse.json(
      { error: "Failed to fetch patient forms" },
      { status: 500 }
    );
  }
}

// PATCH /api/forms/patient - Update form submission (mark as reviewed, add notes)
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { submissionId, status, notes, reviewedBy } = body;

    if (!submissionId) {
      return NextResponse.json(
        { error: "Missing submissionId" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    
    if (status) {
      updateData.status = status;
    }
    
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    
    if (status === "reviewed" && reviewedBy) {
      updateData.reviewed_by = reviewedBy;
      updateData.reviewed_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from("patient_form_submissions")
      .update(updateData)
      .eq("id", submissionId)
      .select()
      .single();

    if (error) {
      console.error("Error updating form submission:", error);
      return NextResponse.json(
        { error: "Failed to update form submission" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, submission: data });
  } catch (error) {
    console.error("Error updating form submission:", error);
    return NextResponse.json(
      { error: "Failed to update form submission" },
      { status: 500 }
    );
  }
}
