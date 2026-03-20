import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllForms, getFormById } from "@/lib/formDefinitions";

// GET /api/forms - Get all form definitions or a specific one
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get("formId");

    if (formId) {
      const form = getFormById(formId);
      if (!form) {
        return NextResponse.json(
          { error: "Form not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ form });
    }

    const forms = getAllForms();
    return NextResponse.json({ forms });
  } catch (error) {
    console.error("Error fetching forms:", error);
    return NextResponse.json(
      { error: "Failed to fetch forms" },
      { status: 500 }
    );
  }
}

// POST /api/forms - Create a new form submission link for a patient
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { patientId, formId } = body;

    if (!patientId || !formId) {
      return NextResponse.json(
        { error: "Missing required fields: patientId, formId" },
        { status: 400 }
      );
    }

    const form = getFormById(formId);
    if (!form) {
      return NextResponse.json(
        { error: "Invalid form ID" },
        { status: 400 }
      );
    }

    // Create a new form submission record with a unique token
    const { data, error } = await supabaseAdmin
      .from("patient_form_submissions")
      .insert({
        patient_id: patientId,
        form_id: formId,
        form_name: form.language === "fr" && form.nameFr ? form.nameFr : form.name,
        status: "pending",
        submission_data: {},
      })
      .select("id, token, expires_at")
      .single();

    if (error) {
      console.error("Error creating form submission:", error);
      return NextResponse.json(
        { error: "Failed to create form submission" },
        { status: 500 }
      );
    }

    // Get the host from request headers to generate correct URL
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const formUrl = `${protocol}://${host}/form/${formId}?token=${data.token}`;

    return NextResponse.json({
      success: true,
      submissionId: data.id,
      token: data.token,
      formUrl,
      expiresAt: data.expires_at,
    });
  } catch (error) {
    console.error("Error creating form submission:", error);
    return NextResponse.json(
      { error: "Failed to create form submission" },
      { status: 500 }
    );
  }
}
