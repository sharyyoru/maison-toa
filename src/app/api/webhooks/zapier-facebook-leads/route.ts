import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { shouldCreateDeal } from "@/lib/dealDeduplication";

/**
 * Webhook endpoint for receiving Facebook Lead Ads via Zapier
 * 
 * Expected Zapier field mapping:
 * - first_name: Lead's first name
 * - last_name: Lead's last name
 * - email: Lead's email address
 * - phone: Lead's phone number
 * - service_interest: The service/treatment they're interested in
 * - ad_name: (optional) Name of the Facebook ad
 * - campaign_name: (optional) Name of the campaign
 * - form_name: (optional) Name of the lead form
 */

type FacebookLeadPayload = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  phone_number?: string;
  service_interest?: string;
  service?: string;
  ad_name?: string;
  campaign_name?: string;
  form_name?: string;
  created_time?: string;
};

type HubspotService = {
  id: string;
  name: string;
};

/**
 * Match a service interest string to the closest HubSpot service
 * Uses fuzzy matching to find the best match
 */
function matchServiceToHubspot(
  serviceInterest: string,
  hubspotServices: HubspotService[]
): HubspotService | null {
  if (!serviceInterest || hubspotServices.length === 0) return null;

  const normalizedInterest = serviceInterest.toLowerCase().trim();

  // Direct match first
  const directMatch = hubspotServices.find(
    (s) => s.name.toLowerCase() === normalizedInterest
  );
  if (directMatch) return directMatch;

  // Keyword matching patterns for common services
  const serviceKeywords: { keywords: string[]; serviceNames: string[] }[] = [
    { keywords: ["breast", "augment", "implant", "mammoplasty"], serviceNames: ["breast augmentation", "breast"] },
    { keywords: ["face", "filler", "facial filler"], serviceNames: ["face filler", "facial filler", "filler"] },
    { keywords: ["wrinkle", "ride", "rides", "anti-age", "antiage"], serviceNames: ["wrinkle", "anti-aging", "rides"] },
    { keywords: ["blepharo", "eyelid", "paupière"], serviceNames: ["blepharoplasty", "eyelid"] },
    { keywords: ["lipo", "liposuc"], serviceNames: ["liposuction", "lipo"] },
    { keywords: ["iv", "therapy", "infusion", "drip"], serviceNames: ["iv therapy", "infusion"] },
    { keywords: ["rhino", "nose", "nez"], serviceNames: ["rhinoplasty", "nose"] },
    { keywords: ["facelift", "lifting", "face lift"], serviceNames: ["facelift", "face lift"] },
    { keywords: ["botox", "toxin"], serviceNames: ["botox", "botulinum"] },
    { keywords: ["lip", "lèvre"], serviceNames: ["lip filler", "lip"] },
    { keywords: ["tummy", "tuck", "abdominoplast"], serviceNames: ["tummy tuck", "abdominoplasty"] },
    { keywords: ["breast", "lift", "mastopexy"], serviceNames: ["breast lift", "mastopexy"] },
    { keywords: ["hyperbaric", "oxygen", "hbot"], serviceNames: ["hyperbaric", "hbot", "oxygen"] },
    { keywords: ["consultation", "consult"], serviceNames: ["consultation", "consult"] },
  ];

  // Try keyword matching
  for (const { keywords, serviceNames } of serviceKeywords) {
    const hasKeyword = keywords.some((k) => normalizedInterest.includes(k));
    if (hasKeyword) {
      for (const serviceName of serviceNames) {
        const match = hubspotServices.find((s) =>
          s.name.toLowerCase().includes(serviceName)
        );
        if (match) return match;
      }
    }
  }

  // Partial match - find service that contains any word from the interest
  const interestWords = normalizedInterest.split(/\s+/).filter((w) => w.length > 3);
  for (const word of interestWords) {
    const partialMatch = hubspotServices.find((s) =>
      s.name.toLowerCase().includes(word)
    );
    if (partialMatch) return partialMatch;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Parse the incoming payload - Zapier can send as JSON or form data
    let payload: FacebookLeadPayload;
    
    const contentType = request.headers.get("content-type") || "";
    console.log("[Zapier Facebook Leads] Content-Type:", contentType);
    
    // Clone the request to read body for logging
    const bodyText = await request.clone().text();
    console.log("[Zapier Facebook Leads] Raw body:", bodyText.substring(0, 500));
    
    if (contentType.includes("application/json")) {
      try {
        payload = JSON.parse(bodyText);
      } catch (parseError) {
        console.error("[Zapier Facebook Leads] JSON parse error:", parseError);
        return NextResponse.json(
          { success: false, error: "Invalid JSON payload", rawBody: bodyText.substring(0, 200) },
          { status: 400 }
        );
      }
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries()) as unknown as FacebookLeadPayload;
    } else {
      // Try JSON first, fallback to form data
      try {
        payload = JSON.parse(bodyText);
      } catch {
        try {
          const formData = await request.formData();
          payload = Object.fromEntries(formData.entries()) as unknown as FacebookLeadPayload;
        } catch (formError) {
          console.error("[Zapier Facebook Leads] Failed to parse as form data:", formError);
          return NextResponse.json(
            { success: false, error: "Could not parse request body as JSON or form data" },
            { status: 400 }
          );
        }
      }
    }

    console.log("Received Facebook Lead via Zapier:", JSON.stringify(payload, null, 2));

    // Extract and normalize fields
    let firstName = payload.first_name || "";
    let lastName = payload.last_name || "";
    
    // Handle full_name if first/last not provided
    if (!firstName && !lastName && payload.full_name) {
      const nameParts = payload.full_name.trim().split(/\s+/);
      firstName = nameParts[0] || "Unknown";
      lastName = nameParts.slice(1).join(" ") || "";
    }

    // Default to "Unknown" if no name provided
    if (!firstName) firstName = "Unknown";

    const email = payload.email?.toLowerCase().trim() || null;
    const phone = payload.phone || payload.phone_number || null;
    const serviceInterest = payload.service_interest || payload.service || "General Inquiry";
    const adName = payload.ad_name || null;
    const campaignName = payload.campaign_name || null;
    const formName = payload.form_name || null;

    // Validate required fields
    if (!email && !phone) {
      console.error("[Zapier Facebook Leads] Missing email and phone:", { payload });
      return NextResponse.json(
        { 
          success: false, 
          error: "At least email or phone is required",
          received: {
            first_name: firstName,
            last_name: lastName,
            email: email,
            phone: phone,
          }
        },
        { status: 400 }
      );
    }

    // Check for existing patient by email or phone
    let patientRow: { id: string; notes: string | null } | null = null;

    if (email) {
      const { data: existingByEmail } = await supabaseAdmin
        .from("patients")
        .select("id, notes")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();

      if (existingByEmail) {
        patientRow = existingByEmail;
      }
    }

    if (!patientRow && phone) {
      // Try different phone formats
      const phoneVariants = [
        phone,
        phone.replace(/\s+/g, ""),
        phone.replace(/[^\d+]/g, ""),
      ];

      for (const phoneVariant of phoneVariants) {
        const { data: existingByPhone } = await supabaseAdmin
          .from("patients")
          .select("id, notes")
          .or(`phone.eq.${phoneVariant},phone.ilike.%${phoneVariant.slice(-9)}%`)
          .limit(1)
          .maybeSingle();

        if (existingByPhone) {
          patientRow = existingByPhone;
          break;
        }
      }
    }

    let patientId: string;
    let isNewPatient = false;

    // Build notes with Facebook lead info
    const leadInfo = {
      source: "Facebook Lead Ads",
      ad_name: adName,
      campaign_name: campaignName,
      form_name: formName,
      service_interest: serviceInterest,
      received_at: new Date().toISOString(),
    };
    const leadNote = `\n\n[Facebook Lead] ${JSON.stringify(leadInfo, null, 2)}`;

    if (patientRow) {
      // Update existing patient
      patientId = patientRow.id;
      const existingNotes = patientRow.notes || "";

      const { error: updateError } = await supabaseAdmin
        .from("patients")
        .update({
          first_name: firstName,
          last_name: lastName,
          ...(email && { email }),
          ...(phone && { phone }),
          notes: (existingNotes + leadNote).trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", patientId);

      if (updateError) {
        console.error("Failed to update patient:", updateError);
        return NextResponse.json(
          { success: false, error: updateError.message },
          { status: 500 }
        );
      }
    } else {
      // Create new patient
      isNewPatient = true;

      const { data: newPatient, error: insertError } = await supabaseAdmin
        .from("patients")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          source: "Facebook Lead Ads",
          lifecycle_stage: "lead",
          notes: leadNote.trim(),
        })
        .select("id")
        .single();

      if (insertError || !newPatient) {
        console.error("Failed to create patient:", insertError);
        return NextResponse.json(
          { success: false, error: insertError?.message || "Failed to create patient" },
          { status: 500 }
        );
      }

      patientId = newPatient.id;
    }

    // Get default deal stage for new leads
    let defaultStageId: string | undefined;

    // Try: is_default=true AND type='lead' (exclude demo stages)
    const { data: defaultLeadStage } = await supabaseAdmin
      .from("deal_stages")
      .select("id")
      .eq("is_default", true)
      .eq("type", "lead")
      .eq("is_demo", false)
      .limit(1)
      .maybeSingle();

    defaultStageId = defaultLeadStage?.id;

    // Fallback: any non-demo stage with is_default=true
    if (!defaultStageId) {
      const { data: anyDefaultStage } = await supabaseAdmin
        .from("deal_stages")
        .select("id")
        .eq("is_default", true)
        .eq("is_demo", false)
        .limit(1)
        .maybeSingle();
      defaultStageId = anyDefaultStage?.id;
    }

    // Fallback: first non-demo stage by sort_order
    if (!defaultStageId) {
      const { data: firstStage } = await supabaseAdmin
        .from("deal_stages")
        .select("id")
        .eq("is_demo", false)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      defaultStageId = firstStage?.id;
    }

    if (!defaultStageId) {
      console.error("[Zapier Facebook Leads] No deal stages found in database");
      return NextResponse.json(
        { success: false, error: "No deal stages configured" },
        { status: 500 }
      );
    }

    // Load HubSpot services for matching
    const { data: hubspotCategory } = await supabaseAdmin
      .from("service_categories")
      .select("id")
      .eq("name", "Hubspot")
      .single();

    let hubspotServices: HubspotService[] = [];
    if (hubspotCategory) {
      const { data: services } = await supabaseAdmin
        .from("services")
        .select("id, name")
        .eq("category_id", hubspotCategory.id)
        .eq("is_active", true);
      hubspotServices = (services as HubspotService[]) || [];
    }

    // Match the service interest to a HubSpot service
    const matchedService = matchServiceToHubspot(serviceInterest, hubspotServices);
    const serviceId = matchedService?.id || null;
    const finalServiceInterest = matchedService?.name || serviceInterest;

    console.log(`Service interest "${serviceInterest}" matched to HubSpot service: ${matchedService?.name || "None"}`);

    // Check if deal already exists for this patient with same service (within 6 hours)
    const dealCheck = await shouldCreateDeal(supabaseAdmin, {
      patientId,
      serviceId: serviceId || undefined,
    });

    let dealId: string | null = null;

    if (dealCheck.shouldCreate) {
      // Create new deal with matched service
      const { data: newDeal, error: dealError } = await supabaseAdmin
        .from("deals")
        .insert({
          patient_id: patientId,
          title: `${firstName} ${lastName} - ${finalServiceInterest}`,
          pipeline: "Lead to Surgery",
          stage_id: defaultStageId,
          service_id: serviceId,
          notes: `Source: Facebook Lead Ads\nFacebook Ad: ${adName || "N/A"}\nCampaign: ${campaignName || "N/A"}\nForm: ${formName || "N/A"}\nService Interest: ${finalServiceInterest}`,
        })
        .select("id")
        .single();

      if (dealError) {
        console.error("Failed to create deal:", dealError);
        // Don't fail the whole request - patient was created
      } else {
        dealId = newDeal?.id || null;
      }

      // Trigger workflow for new lead
      if (dealId && defaultStageId) {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aestheticclinic.vercel.app";
          await fetch(`${baseUrl}/api/workflows/deal-stage-changed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dealId,
              patientId,
              fromStageId: null,
              toStageId: defaultStageId,
              pipeline: "Lead to Surgery",
            }),
          });
        } catch (workflowError) {
          console.error("Failed to trigger workflow:", workflowError);
          // Don't fail the request for workflow errors
        }
      }
    } else {
      dealId = dealCheck.existingDeal.id;
      console.log(`Skipped deal creation — recent deal exists: ${dealId}`);
    }

    console.log(`Facebook Lead processed: Patient ${patientId}, Deal ${dealId}, New: ${isNewPatient}`);

    return NextResponse.json({
      success: true,
      patientId,
      dealId,
      isNewPatient,
      message: isNewPatient 
        ? `New lead created: ${firstName} ${lastName}` 
        : `Existing patient updated: ${firstName} ${lastName}`,
    });

  } catch (error) {
    console.error("Error processing Facebook Lead webhook:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Internal server error" 
      },
      { status: 500 }
    );
  }
}

// Also handle GET for Zapier webhook verification
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "ok",
    message: "Facebook Lead Ads webhook is active",
    endpoint: "/api/webhooks/zapier-facebook-leads",
    method: "POST",
    required_fields: ["email OR phone"],
    optional_fields: [
      "first_name",
      "last_name", 
      "full_name",
      "service_interest",
      "ad_name",
      "campaign_name",
      "form_name"
    ],
  });
}
