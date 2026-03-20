import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { shouldCreateDeal } from "@/lib/dealDeduplication";

/**
 * Webhook endpoint for receiving Retell AI Agent call data
 * 
 * Retell sends webhooks for:
 * - call_started: When a call begins
 * - call_ended: When a call ends (includes transcript)
 * - call_analyzed: When post-call analysis is complete
 * 
 * This endpoint creates a new contact in "Request for Information" stage
 */

type RetellCallPayload = {
  event: "call_started" | "call_ended" | "call_analyzed";
  call: {
    call_type: string;
    from_number: string;
    to_number: string;
    direction: "inbound" | "outbound";
    call_id: string;
    agent_id: string;
    call_status: string;
    metadata?: Record<string, unknown>;
    retell_llm_dynamic_variables?: {
      customer_name?: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
      service_interest?: string;
      [key: string]: unknown;
    };
    start_timestamp?: number;
    end_timestamp?: number;
    disconnection_reason?: string;
    transcript?: string;
    transcript_object?: Array<{
      role: string;
      content: string;
      words?: Array<{ word: string; start: number; end: number }>;
    }>;
    call_analysis?: {
      call_summary?: string;
      user_sentiment?: string;
      call_successful?: boolean;
      custom_analysis_data?: Record<string, unknown>;
      [key: string]: unknown;
    };
    opt_out_sensitive_data_storage?: boolean;
  };
};

type HubspotService = {
  id: string;
  name: string;
};

/**
 * Extract customer info from transcript or dynamic variables
 */
function extractCustomerInfo(call: RetellCallPayload["call"]): {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  serviceInterest: string;
} {
  const vars = call.retell_llm_dynamic_variables || {};
  const metadata = call.metadata || {};
  
  // Try to get name from various sources
  let firstName = (vars.first_name as string) || "";
  let lastName = (vars.last_name as string) || "";
  
  // If we have customer_name but not first/last, split it
  if (!firstName && vars.customer_name) {
    const nameParts = (vars.customer_name as string).trim().split(/\s+/);
    firstName = nameParts[0] || "";
    lastName = nameParts.slice(1).join(" ") || "";
  }
  
  // Check metadata as fallback
  if (!firstName && metadata.first_name) {
    firstName = metadata.first_name as string;
  }
  if (!lastName && metadata.last_name) {
    lastName = metadata.last_name as string;
  }
  
  // Phone from caller ID or variables
  let phone = (vars.phone as string) || call.from_number || "";
  
  // Email from variables or metadata
  let email = (vars.email as string) || (metadata.email as string) || "";
  
  // Service interest
  let serviceInterest = (vars.service_interest as string) || (metadata.service_interest as string) || "";
  
  return { firstName, lastName, phone, email, serviceInterest };
}

/**
 * Match a service interest string to the closest service
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
    { keywords: ["consultation", "consult", "rendez-vous"], serviceNames: ["consultation", "consult"] },
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

  // Partial match
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
    const payload = (await request.json()) as RetellCallPayload;
    
    console.log("[Retell Agent] Received webhook:", payload.event, payload.call?.call_id);

    // Only process call_ended events (has full transcript and caller info)
    if (payload.event !== "call_ended") {
      console.log("[Retell Agent] Ignoring event:", payload.event);
      return NextResponse.json({ success: true, message: `Event ${payload.event} acknowledged` });
    }

    const call = payload.call;
    if (!call) {
      return NextResponse.json(
        { success: false, error: "Missing call data" },
        { status: 400 }
      );
    }

    // Extract customer information
    const { firstName, lastName, phone, email, serviceInterest } = extractCustomerInfo(call);

    // We need at least a phone number to create a lead
    if (!phone) {
      console.log("[Retell Agent] No phone number available, skipping lead creation");
      return NextResponse.json({ 
        success: true, 
        message: "No phone number available, lead not created" 
      });
    }

    console.log("[Retell Agent] Processing lead:", { firstName, lastName, phone, email, serviceInterest });

    // Check if patient already exists by phone
    const normalizedPhone = phone.replace(/[^\d+]/g, "");
    const phoneVariants = [
      normalizedPhone,
      normalizedPhone.replace(/^\+/, ""),
      normalizedPhone.slice(-9),
    ];

    let patientRow: { id: string; notes: string | null } | null = null;

    for (const phoneVariant of phoneVariants) {
      if (!phoneVariant) continue;
      
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

    // Also check by email if provided
    if (!patientRow && email) {
      const { data: existingByEmail } = await supabaseAdmin
        .from("patients")
        .select("id, notes")
        .eq("email", email.toLowerCase())
        .limit(1)
        .maybeSingle();

      if (existingByEmail) {
        patientRow = existingByEmail;
      }
    }

    let patientId: string;
    let isNewPatient = false;

    // Build notes with Retell call info
    const callDuration = call.end_timestamp && call.start_timestamp 
      ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
      : null;
    
    const leadInfo = {
      source: "Retell AI Agent",
      call_id: call.call_id,
      agent_id: call.agent_id,
      direction: call.direction,
      from_number: call.from_number,
      to_number: call.to_number,
      duration_seconds: callDuration,
      disconnection_reason: call.disconnection_reason,
      service_interest: serviceInterest,
      received_at: new Date().toISOString(),
    };
    
    const transcriptNote = call.transcript 
      ? `\n\nTranscript:\n${call.transcript.substring(0, 2000)}${call.transcript.length > 2000 ? "..." : ""}`
      : "";
    
    const leadNote = `\n\n[Retell AI Call] ${JSON.stringify(leadInfo, null, 2)}${transcriptNote}`;

    if (patientRow) {
      // Update existing patient
      patientId = patientRow.id;
      const existingNotes = patientRow.notes || "";

      const { error: updateError } = await supabaseAdmin
        .from("patients")
        .update({
          ...(firstName && { first_name: firstName }),
          ...(lastName && { last_name: lastName }),
          ...(email && { email: email.toLowerCase() }),
          notes: (existingNotes + leadNote).trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", patientId);

      if (updateError) {
        console.error("[Retell Agent] Failed to update patient:", updateError);
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
          first_name: firstName || "Unknown",
          last_name: lastName || "Caller",
          email: email ? email.toLowerCase() : null,
          phone: normalizedPhone,
          source: "Retell AI Agent",
          lifecycle_stage: "lead",
          notes: leadNote.trim(),
        })
        .select("id")
        .single();

      if (insertError || !newPatient) {
        console.error("[Retell Agent] Failed to create patient:", insertError);
        return NextResponse.json(
          { success: false, error: insertError?.message || "Failed to create patient" },
          { status: 500 }
        );
      }

      patientId = newPatient.id;
    }

    // Get "Request for Information" stage (or default lead stage)
    const { data: requestForInfoStage } = await supabaseAdmin
      .from("deal_stages")
      .select("id")
      .ilike("name", "%request for information%")
      .limit(1)
      .maybeSingle();

    let stageId = requestForInfoStage?.id;

    // Fallback to default lead stage
    if (!stageId) {
      const { data: defaultStage } = await supabaseAdmin
        .from("deal_stages")
        .select("id")
        .eq("is_default", true)
        .eq("type", "lead")
        .single();
      
      stageId = defaultStage?.id;
    }

    // Load services for matching
    const { data: hubspotServices } = await supabaseAdmin
      .from("services")
      .select("id, name");

    const matchedService = matchServiceToHubspot(
      serviceInterest,
      (hubspotServices as HubspotService[]) || []
    );
    const serviceId = matchedService?.id || null;
    const finalServiceInterest = matchedService?.name || serviceInterest || "General Inquiry";

    // Check for existing deal (within 6 hours)
    const dealCheck = await shouldCreateDeal(supabaseAdmin, {
      patientId,
      serviceId: serviceId || undefined,
    });

    let dealId: string;

    if (dealCheck.shouldCreate) {
      // Create new deal in "Request for Information" stage
      const { data: newDeal, error: dealError } = await supabaseAdmin
        .from("deals")
        .insert({
          patient_id: patientId,
          title: `${firstName || "Unknown"} ${lastName || "Caller"} - ${finalServiceInterest}`,
          pipeline: "Lead to Surgery",
          stage_id: stageId,
          service_id: serviceId,
          notes: `Source: Retell AI Agent\nCall ID: ${call.call_id}\nDirection: ${call.direction}\nFrom: ${call.from_number}\nDuration: ${callDuration ? `${callDuration}s` : "N/A"}\nService Interest: ${finalServiceInterest}`,
        })
        .select("id")
        .single();

      if (dealError || !newDeal) {
        console.error("[Retell Agent] Failed to create deal:", dealError);
        return NextResponse.json(
          { success: false, error: dealError?.message || "Failed to create deal" },
          { status: 500 }
        );
      }

      dealId = newDeal.id;
    } else {
      dealId = dealCheck.existingDeal.id;
      console.log(`[Retell Agent] Skipped deal creation — recent deal exists: ${dealId}`);
      
      // Update existing deal with call notes
      await supabaseAdmin
        .from("deals")
        .update({
          notes: `[Retell Call ${new Date().toISOString()}]\nCall ID: ${call.call_id}\nFrom: ${call.from_number}\nDuration: ${callDuration ? `${callDuration}s` : "N/A"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dealId);
    }

    console.log(`[Retell Agent] Lead processed: Patient ${patientId}, Deal ${dealId}, New: ${isNewPatient}`);

    return NextResponse.json({
      success: true,
      data: {
        patient_id: patientId,
        deal_id: dealId,
        is_new_patient: isNewPatient,
        service_matched: matchedService?.name || null,
      },
    });

  } catch (error) {
    console.error("[Retell Agent] Error processing webhook:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// GET for webhook verification
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Retell AI Agent webhook is active",
    endpoint: "/api/webhooks/retell-agent",
    method: "POST",
    events: ["call_started", "call_ended", "call_analyzed"],
    description: "Creates leads in 'Request for Information' stage from Retell AI calls",
  });
}
