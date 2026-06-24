import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { sanitizePhone, sanitizeTown, sanitizeCountry } from "@/lib/patientSanitize";
import { brandedEmail, LOGO_URL } from "@/utils/emailTemplate";
import { normalizePatientLanguage } from "@/lib/languagePreference";

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

    // If this is a patient information form, update the patient record
    if (submission.form_id.startsWith("patient-information-")) {
      const patientUpdate: Record<string, unknown> = {};

      // Map form fields to patient record fields
      if (submissionData.first_name) patientUpdate.first_name = submissionData.first_name;
      if (submissionData.last_name) patientUpdate.last_name = submissionData.last_name;
      if (submissionData.email) patientUpdate.email = submissionData.email.toLowerCase();
      if (submissionData.phone) patientUpdate.phone = sanitizePhone(submissionData.phone);
      if (submissionData.gender) patientUpdate.gender = submissionData.gender;
      if (submissionData.dob) patientUpdate.dob = submissionData.dob;
      if (submissionData.street_address) {
        // Combine street address and number if both provided
        const fullAddress = submissionData.street_number 
          ? `${submissionData.street_address} ${submissionData.street_number}`
          : submissionData.street_address;
        patientUpdate.street_address = fullAddress;
      }
      if (submissionData.postal_code) patientUpdate.postal_code = submissionData.postal_code;
      if (submissionData.town) patientUpdate.town = sanitizeTown(submissionData.town);
      if (submissionData.country) patientUpdate.country = sanitizeCountry(submissionData.country);
      if (submissionData.language_preference) {
        patientUpdate.language_preference = normalizePatientLanguage(submissionData.language_preference, "fr");
      }

      // Only update if there are fields to update
      if (Object.keys(patientUpdate).length > 0) {
        const { error: patientUpdateError } = await supabaseAdmin
          .from("patients")
          .update(patientUpdate)
          .eq("id", submission.patient_id);

        if (patientUpdateError) {
          console.error("Error updating patient record:", patientUpdateError);
          // Don't fail the whole submission, just log the error
        }
      }
    }

    // Send confirmation email to patient
    if (isEmailConfigured()) {
      try {
        const { data: patient } = await supabaseAdmin
          .from("patients")
          .select("first_name, last_name, email, language_preference")
          .eq("id", submission.patient_id)
          .single();

        if (patient?.email) {
          const lang = normalizePatientLanguage(patient.language_preference, "fr");
          const isFrench = lang === "fr";
          const firstName = patient.first_name || "";

          const subject = isFrench
            ? "Confirmation – Votre formulaire a bien été reçu"
            : "Confirmation – Your form has been received";

          const salutation = isFrench
            ? (firstName ? `Bonjour ${firstName},` : "Bonjour,")
            : (firstName ? `Hello ${firstName},` : "Hello,");

          const body = `
            <p style="margin: 0 0 20px 0; font-size: 15px; color: #1a1a18;">${salutation}</p>
            <p style="margin: 0 0 20px 0; color: #4a4742;">
              ${isFrench
                ? "Nous vous confirmons que votre formulaire patient a bien été reçu et enregistré."
                : "We confirm that your patient form has been successfully received and recorded."}
            </p>
            <p style="margin: 0 0 20px 0; color: #4a4742;">
              ${isFrench
                ? "Notre équipe dispose désormais de vos informations et se tient à votre disposition pour toute question."
                : "Our team now has your information and is available for any questions you may have."}
            </p>
            <p style="margin: 24px 0 0 0; color: #4a4742;">
              ${isFrench
                ? "Nous nous réjouissons de vous accueillir prochainement."
                : "We look forward to welcoming you soon."}
            </p>
            <p style="margin: 8px 0 0 0; color: #1a1a18; font-weight: 500;">Maison Tóā</p>
            <img src="${LOGO_URL}" alt="Maison Tóā" width="80" style="display: block; width: 80px; height: auto; margin: 16px 0 0 0;">
          `;

          await sendEmail({
            to: patient.email,
            subject,
            html: brandedEmail(body),
          });

          // Store email record
          await supabaseAdmin.from("emails").insert({
            patient_id: submission.patient_id,
            to_address: patient.email,
            from_address: process.env.EMAIL_FROM_ADDRESS || "info@mail.maisontoa.com",
            subject,
            body: brandedEmail(body),
            direction: "outbound",
            status: "sent",
            sent_at: new Date().toISOString(),
          });
        }
      } catch (emailErr) {
        console.error("Error sending form confirmation email:", emailErr);
        // Non-critical — don't fail the submission
      }
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
          phone,
          gender,
          dob,
          street_address,
          postal_code,
          town,
          country,
          language_preference
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
