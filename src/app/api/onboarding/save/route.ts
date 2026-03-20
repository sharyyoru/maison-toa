import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { submissionId, step, data } = body;

    if (!submissionId || !step || !data) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build update object based on step
    let updateData: Record<string, any> = {
      current_step: step,
      updated_at: new Date().toISOString(),
    };

    switch (step) {
      case 1: // Practice Identity
        updateData = {
          ...updateData,
          practice_name: data.practiceName,
          practice_location: data.practiceLocation,
          practice_address: data.practiceAddress,
          practice_phone: data.practicePhone,
          practice_email: data.practiceEmail,
          practice_website: data.practiceWebsite,
          main_contact_name: data.mainContactName,
          main_contact_email: data.mainContactEmail,
          main_contact_phone: data.mainContactPhone,
          main_contact_role: data.mainContactRole,
        };
        break;

      case 2: // User Management
        updateData = {
          ...updateData,
          expected_user_count: data.expectedUserCount,
          user_directory: data.userDirectory || [],
          access_levels: data.accessLevels || [],
          departments: data.departments || [],
        };
        break;

      case 3: // Data Migration
        updateData = {
          ...updateData,
          current_software: data.currentSoftware,
          current_software_other: data.currentSoftwareOther,
          data_access_authorized: data.dataAccessAuthorized,
          migration_contact_name: data.migrationContactName,
          migration_contact_email: data.migrationContactEmail,
          storage_estimate: data.storageEstimate,
          patient_file_count: data.patientFileCount,
        };
        break;

      case 4: // Clinical Services
        updateData = {
          ...updateData,
          service_categories: data.serviceCategories || [],
          services_list: data.servicesList || [],
          services_file_url: data.servicesFileUrl,
        };
        break;

      case 5: // Marketing & Growth
        updateData = {
          ...updateData,
          lead_sources: data.leadSources || [],
          marketing_automations: data.marketingAutomations || [],
          additional_notes: data.additionalNotes,
        };
        break;

      case 6: // Compliance & Submit
        updateData = {
          ...updateData,
          gdpr_consent: data.gdprConsent,
          hipaa_acknowledgment: data.hipaaAcknowledgment,
          terms_accepted: data.termsAccepted,
          status: "completed",
          completed_at: new Date().toISOString(),
        };
        break;
    }

    const { data: updated, error } = await supabase
      .from("clinic_onboarding_submissions")
      .update(updateData)
      .eq("id", submissionId)
      .select("id, current_step, status")
      .single();

    if (error) {
      console.error("Error updating submission:", error);
      return NextResponse.json(
        { error: "Failed to save progress" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      submission: updated,
    });
  } catch (error) {
    console.error("Error in save:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch submission data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get("id");

    if (!submissionId) {
      return NextResponse.json(
        { error: "Submission ID is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("clinic_onboarding_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      submission: data,
    });
  } catch (error) {
    console.error("Error fetching submission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
