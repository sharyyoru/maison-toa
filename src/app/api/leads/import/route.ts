import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { formatSwissPhone } from "@/lib/phoneFormatter";
import { shouldCreateDeal } from "@/lib/dealDeduplication";

type ImportLead = {
  rowNumber: number;
  created: Date | string | null;
  name: string;
  email: string | null;
  source: string;
  form: string;
  channel: string;
  stage: string;
  owner: string;
  labels: string[];
  phones: {
    primary: string | null;
    secondary: string | null;
    whatsapp: string | null;
  };
  formattedPhones: Array<{ phone: string; source: string; original: string }>;
  bestPhone: string | null;
  service: string;
  detectedService: string | null;
  validationIssues: string[];
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
    { keywords: ["breast", "reduc", "mastopexy"], serviceNames: ["breast reduction", "breast lift", "mastopexy"] },
    { keywords: ["face", "filler", "facial filler"], serviceNames: ["face filler", "facial filler", "filler"] },
    { keywords: ["ha ", "hyaluronic", "ha&", "ha +"], serviceNames: ["ha & filler", "ha filler", "filler", "hyaluronic"] },
    { keywords: ["wrinkle", "ride", "rides", "anti-age", "antiage"], serviceNames: ["wrinkle", "anti-aging", "rides"] },
    { keywords: ["blepharo", "eyelid", "paupière"], serviceNames: ["blepharoplasty", "eyelid"] },
    { keywords: ["micro lipo", "micro-lipo"], serviceNames: ["micro liposuction", "micro lipo"] },
    { keywords: ["lipo", "liposuc"], serviceNames: ["liposuction", "lipo"] },
    { keywords: ["iv vitamin", "iv therapy", "infusion", "drip"], serviceNames: ["iv vitamin", "iv therapy", "infusion"] },
    { keywords: ["rhino", "nose", "nez"], serviceNames: ["rhinoplasty", "nose"] },
    { keywords: ["facelift", "lifting", "face lift"], serviceNames: ["facelift", "face lift"] },
    { keywords: ["botox", "toxin", "botulinum"], serviceNames: ["botox", "botulinum", "toxin"] },
    { keywords: ["lip", "lèvre"], serviceNames: ["lip filler", "lip"] },
    { keywords: ["tummy", "tuck", "abdominoplast"], serviceNames: ["tummy tuck", "abdominoplasty"] },
    { keywords: ["hyperbaric", "oxygen", "hbot"], serviceNames: ["hyperbaric", "hbot", "oxygen"] },
    { keywords: ["hifu"], serviceNames: ["hifu"] },
    { keywords: ["morpheus"], serviceNames: ["morpheus"] },
    { keywords: ["skinbooster"], serviceNames: ["skinbooster"] },
    { keywords: ["emsculpt"], serviceNames: ["emsculpt"] },
    { keywords: ["prp"], serviceNames: ["prp"] },
    { keywords: ["peeling"], serviceNames: ["peeling"] },
    { keywords: ["dermapen"], serviceNames: ["dermapen"] },
    { keywords: ["mesotherap"], serviceNames: ["mesotherapy", "mesotherap"] },
    { keywords: ["laser co2", "co2"], serviceNames: ["laser co2", "co2"] },
    { keywords: ["laser hair"], serviceNames: ["laser hair"] },
    { keywords: ["vascular laser"], serviceNames: ["vascular"] },
    { keywords: ["genesis"], serviceNames: ["genesis"] },
    { keywords: ["cryolipoly", "crypolipoly"], serviceNames: ["cryolipoly", "crypolipoly"] },
    { keywords: ["otoplast"], serviceNames: ["otoplast"] },
    { keywords: ["buttock"], serviceNames: ["buttock"] },
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

/**
 * Check if a patient already exists by email or phone
 */
async function findExistingPatient(
  email: string | null,
  phone: string | null
): Promise<{ id: string; notes: string | null; phone: string | null; email: string | null } | null> {
  if (email) {
    const { data: existingByEmail } = await supabaseAdmin
      .from("patients")
      .select("id, notes, phone, email")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (existingByEmail) return existingByEmail;
  }

  if (phone) {
    // Try different phone formats
    const phoneDigits = phone.replace(/[^\d]/g, "");
    const lastNineDigits = phoneDigits.slice(-9);

    if (lastNineDigits.length >= 9) {
      const { data: existingByPhone } = await supabaseAdmin
        .from("patients")
        .select("id, notes, phone, email")
        .or(`phone.ilike.%${lastNineDigits}%`)
        .limit(1)
        .maybeSingle();

      if (existingByPhone) return existingByPhone;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { leads, service, filename } = await request.json();

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: "No leads provided" },
        { status: 400 }
      );
    }

    if (!service) {
      return NextResponse.json(
        { error: "Service is required" },
        { status: 400 }
      );
    }

    let imported = 0;
    let failed = 0;
    let skippedDuplicates = 0;
    let dealsCreated = 0;
    let dealsSkipped = 0;
    const errors: string[] = [];
    const importedPatientIds: string[] = [];
    const duplicatePatientIds: string[] = [];

    // Get default deal stage for new leads (with fallbacks)
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

    // Build a cache of service name -> { id, name } for per-lead matching
    // This avoids repeated DB lookups for the same service
    const serviceCache = new Map<string, { id: string; name: string }>();
    for (const svc of hubspotServices) {
      serviceCache.set(svc.name.toLowerCase(), svc);
    }

    // Helper: resolve a service interest string to a HubSpot service (match only, never create)
    function resolveService(serviceInterest: string): { id: string; name: string } {
      // Check cache first
      const cacheKey = serviceInterest.toLowerCase().trim();
      const cached = serviceCache.get(cacheKey);
      if (cached) return cached;

      // Try fuzzy match against existing services
      const matched = matchServiceToHubspot(serviceInterest, hubspotServices);
      if (matched) {
        serviceCache.set(cacheKey, matched);
        return matched;
      }

      // No match — leave service_id blank, store the raw interest as the name
      console.log(`No HubSpot service match for "${serviceInterest}" — leaving service_id blank`);
      const fallback = { id: "", name: serviceInterest };
      serviceCache.set(cacheKey, fallback);
      return fallback;
    }

    // Sort leads chronologically by created date (oldest first)
    const sortedLeads = [...(leads as ImportLead[])].sort((a, b) => {
      const dateA = a.created ? new Date(a.created).getTime() : 0;
      const dateB = b.created ? new Date(b.created).getTime() : 0;
      return dateA - dateB;
    });

    console.log(`Processing ${sortedLeads.length} leads in chronological order`);

    for (const lead of sortedLeads) {
      try {
        // Split name into first and last
        const nameParts = lead.name.trim().split(/\s+/);
        const firstName = nameParts[0] || "Unknown";
        const lastName = nameParts.slice(1).join(" ") || "";

        // Format phone number
        let formattedPhone = lead.bestPhone || formatSwissPhone(lead.phones.primary);
        
        // Fallback: if no formatted phone, try the raw phone
        if (!formattedPhone && lead.phones.primary) {
          formattedPhone = lead.phones.primary;
        }
        
        console.log(`[Lead Import] Row ${lead.rowNumber} - ${lead.name}:`);
        console.log(`  Raw phone: ${lead.phones.primary}`);
        console.log(`  Best phone: ${lead.bestPhone}`);
        console.log(`  Final formatted: ${formattedPhone}`);
        
        const normalizedEmail = lead.email?.toLowerCase().trim() || null;

        // Resolve per-lead service from detectedService (Form column), fallback to global service
        const leadServiceInterest = lead.detectedService || service;
        const resolvedService = resolveService(leadServiceInterest);
        const serviceId = resolvedService.id || null;
        const finalServiceInterest = resolvedService.name;

        // Check for existing patient (duplicate prevention)
        const existingPatient = await findExistingPatient(normalizedEmail, formattedPhone);

        let patientId: string;
        let isNewPatient = false;

        if (existingPatient) {
          patientId = existingPatient.id;
          duplicatePatientIds.push(patientId);
          skippedDuplicates++;

          const importNote = `\n\n[Lead Import ${new Date().toISOString().split('T')[0]}] Duplicate found during import from ${filename}. Service: ${finalServiceInterest}, Form: ${lead.form}`;
          const existingNotes = existingPatient.notes || "";

          // Update notes and fill in missing fields (phone, email) from CSV data
          const updateFields: Record<string, string> = {
            notes: (existingNotes + importNote).trim(),
            updated_at: new Date().toISOString(),
          };
          if (formattedPhone && !existingPatient.phone) {
            updateFields.phone = formattedPhone;
          }
          if (normalizedEmail && !existingPatient.email) {
            updateFields.email = normalizedEmail;
          }

          await supabaseAdmin
            .from("patients")
            .update(updateFields)
            .eq("id", patientId);
        } else {
          isNewPatient = true;
          const leadCreatedAt = lead.created ? new Date(lead.created).toISOString() : new Date().toISOString();

          const { data: patient, error: patientError } = await supabaseAdmin
            .from("patients")
            .insert({
              first_name: firstName,
              last_name: lastName,
              email: normalizedEmail,
              phone: formattedPhone,
              source: lead.source || "Lead Import",
              lifecycle_stage: "lead",
              notes: `Imported from ${filename}\nService: ${finalServiceInterest}\nForm: ${lead.form}\nChannel: ${lead.channel}`,
              created_at: leadCreatedAt,
            })
            .select("id")
            .single();

          if (patientError) {
            console.error(`Failed to create patient for ${lead.name}:`, patientError);
            failed++;
            errors.push(`Row ${lead.rowNumber}: ${patientError.message}`);
            continue;
          }

          patientId = patient.id;
          importedPatientIds.push(patientId);
        }

        // Check if deal already exists for this patient with same service (within 6 hours)
        const dealCheck = await shouldCreateDeal(supabaseAdmin, {
          patientId,
          serviceId: serviceId || undefined,
        });

        let dealId: string | null = null;

        if (dealCheck.shouldCreate) {
          // Always use current date for deal creation so dedup window works correctly
          const { data: deal, error: dealError } = await supabaseAdmin
            .from("deals")
            .insert({
              patient_id: patientId,
              title: `${firstName} ${lastName} - ${finalServiceInterest}`,
              pipeline: "Lead to Surgery",
              stage_id: defaultStageId,
              service_id: serviceId,
              notes: `Source: ${lead.source || "Lead Import"}\nImported from ${filename}\nLabels: ${lead.labels.join(", ")}\nService Interest: ${finalServiceInterest}${lead.created ? `\nOriginal lead date: ${lead.created}` : ""}`,
            })
            .select("id")
            .single();

          if (dealError) {
            console.error(`Failed to create deal for ${lead.name}:`, dealError);
            errors.push(`Row ${lead.rowNumber}: Failed to create deal — ${dealError.message}`);
          } else {
            dealId = deal?.id || null;
            dealsCreated++;
          }

          // Trigger workflow for "Request for Information" - only for new deals
          if (dealId && defaultStageId) {
            try {
              await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/workflows/deal-stage-changed`, {
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
            }
          }
        } else {
          dealsSkipped++;
          console.log(`Skipped deal for ${lead.name} — recent deal exists: ${dealCheck.existingDeal.id}`);
        }

        if (isNewPatient) {
          imported++;
        }
      } catch (error) {
        console.error(`Error importing lead row ${lead.rowNumber}:`, error);
        failed++;
        errors.push(`Row ${lead.rowNumber}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    // Track import history
    const { data: importRecord } = await supabaseAdmin
      .from("lead_imports")
      .insert({
        filename,
        service: service,
        total_leads: leads.length,
        imported_count: imported,
        failed_count: failed,
        imported_patient_ids: importedPatientIds,
        errors: errors.length > 0 ? errors : null,
        import_date: new Date().toISOString(),
      })
      .select("id")
      .single();

    return NextResponse.json({
      success: true,
      imported,
      failed,
      skippedDuplicates,
      dealsCreated,
      dealsSkipped,
      duplicatePatientIds: duplicatePatientIds.length > 0 ? duplicatePatientIds : undefined,
      matchedService: service,
      importId: importRecord?.id,
      errors: errors.length > 0 ? errors : undefined,
      message: `Imported ${imported} new patients, ${dealsCreated} deals created${skippedDuplicates > 0 ? `, ${skippedDuplicates} existing patients updated` : ""}${dealsSkipped > 0 ? `, ${dealsSkipped} duplicate deals skipped` : ""}${failed > 0 ? `, ${failed} failed` : ""}`,
    });
  } catch (error) {
    console.error("Lead import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
