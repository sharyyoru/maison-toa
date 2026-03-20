import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface EmbedLeadPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  countryCode?: string;
  service?: string;
  location?: string;
  message?: string;
  isExistingPatient?: boolean;
  formType: string;
  // Attribution
  sourceUrl?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as EmbedLeadPayload;
    const {
      firstName,
      lastName,
      email,
      phone,
      countryCode,
      service,
      location,
      message,
      isExistingPatient,
      formType,
      sourceUrl,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
    } = body;

    // Validate required fields
    if (!firstName || !lastName || !email || !formType) {
      return NextResponse.json(
        { error: "Missing required fields: firstName, lastName, email, formType" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get IP and user agent from request headers
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || 
                      request.headers.get("x-real-ip") || 
                      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Insert the lead
    const { data: lead, error: insertError } = await supabase
      .from("embed_form_leads")
      .insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        country_code: countryCode || "+41",
        service: service || null,
        location: location || null,
        message: message || null,
        is_existing_patient: isExistingPatient || false,
        form_type: formType,
        source_url: sourceUrl || null,
        referrer: referrer || null,
        utm_source: utmSource || null,
        utm_medium: utmMedium || null,
        utm_campaign: utmCampaign || null,
        utm_term: utmTerm || null,
        utm_content: utmContent || null,
        status: "new",
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error inserting embed lead:", insertError);
      return NextResponse.json(
        { error: "Failed to save lead" },
        { status: 500 }
      );
    }

    // Optionally create patient record if doesn't exist
    const { data: existingPatient } = await supabase
      .from("patients")
      .select("id")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    let patientId: string;
    let isNewPatient = false;

    if (!existingPatient) {
      // Create new patient
      const { data: newPatient } = await supabase
        .from("patients")
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone ? `${countryCode || "+41"}${phone.trim().replace(/^0+/, "")}` : null,
          source: `embed_${formType}`,
        })
        .select("id")
        .single();

      if (newPatient) {
        patientId = newPatient.id;
        isNewPatient = true;

        // Update lead with patient ID
        await supabase
          .from("embed_form_leads")
          .update({ 
            converted_to_patient_id: newPatient.id,
            status: "converted"
          })
          .eq("id", lead.id);
      } else {
        patientId = "";
      }
    } else {
      // Existing patient - still need to create deal and task for new inquiry
      patientId = existingPatient.id;
      
      // Mark as existing patient
      await supabase
        .from("embed_form_leads")
        .update({ 
          converted_to_patient_id: existingPatient.id,
          is_existing_patient: true
        })
        .eq("id", lead.id);
    }

    // Trigger workflow for BOTH new and existing patients
    // This ensures deals and tasks are created for all embed form submissions
    if (patientId) {
      try {
        const url = new URL(request.url);
        const baseUrl = `${url.protocol}//${url.host}`;
        
        // For new patients, trigger the full patient_created workflow
        // For existing patients, trigger deal creation via embed-lead-workflow
        if (isNewPatient) {
          await fetch(`${baseUrl}/api/workflows/patient-created`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patient_id: patientId }),
          });
        } else {
          // For existing patients, create deal and task directly
          await fetch(`${baseUrl}/api/workflows/embed-lead-followup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              patient_id: patientId,
              lead_id: lead.id,
              form_type: formType,
              service: service || null,
              location: location || null,
            }),
          });
        }
      } catch {
        // Don't block on workflow failure
        console.error("Failed to trigger workflow for embed lead");
      }
    }

    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      message: "Lead captured successfully",
    });
  } catch (error) {
    console.error("Error in embed-lead API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
