import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendEmail as sendEmailViaResend, isEmailConfigured } from "@/lib/email";
import { stripHtml } from "@/lib/patientSanitize";
import {
  formatAppointmentDate,
  generatePatientConfirmationEmail,
  generateDoctorNotificationEmail,
  generatePatientReminderEmail,
} from "@/lib/appointmentEmails";
import { normalizePatientLanguage } from "@/lib/languagePreference";
import { resolveBookingDoctorCalendar } from "@/lib/bookingDoctorCalendar";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type BookingPayload = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  appointmentDate: string;
  service: string;
  doctorSlug: string;
  doctorName: string;
  doctorEmail: string;
  notes?: string;
  location?: string;
  language?: string;
  gender?: string;
  treatmentId?: string;
};

type TreatmentBookingDetails = {
  duration_minutes?: number | null;
  linked_service_id?: string | null;
  service_category_id?: string | null;
  assigned_service_categories?: {
    name?: string | null;
    color?: string | null;
  } | null;
  services?: {
    service_categories?: {
      name?: string | null;
      color?: string | null;
    } | null;
  } | null;
  booking_categories?: {
    name?: string | null;
  } | null;
};

async function findBookingDealStageId(supabase: SupabaseClient): Promise<string | null> {
  const { data: appointmentStage } = await supabase
    .from("deal_stages")
    .select("id")
    .ilike("name", "%appointment set%")
    .eq("is_demo", false)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (appointmentStage?.id) return appointmentStage.id;

  const { data: anyAppointmentStage } = await supabase
    .from("deal_stages")
    .select("id")
    .ilike("name", "%appointment set%")
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (anyAppointmentStage?.id) return anyAppointmentStage.id;

  const { data: requestStage } = await supabase
    .from("deal_stages")
    .select("id")
    .ilike("name", "%request for information%")
    .eq("is_demo", false)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (requestStage?.id) return requestStage.id;

  const { data: anyRequestStage } = await supabase
    .from("deal_stages")
    .select("id")
    .ilike("name", "%request for information%")
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (anyRequestStage?.id) return anyRequestStage.id;

  const { data: defaultStage } = await supabase
    .from("deal_stages")
    .select("id")
    .eq("is_default", true)
    .eq("is_demo", false)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (defaultStage?.id) return defaultStage.id;

  const { data: anyDefaultStage } = await supabase
    .from("deal_stages")
    .select("id")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (anyDefaultStage?.id) return anyDefaultStage.id;

  const { data: firstStage } = await supabase
    .from("deal_stages")
    .select("id")
    .eq("is_demo", false)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (firstStage?.id) return firstStage.id;

  const { data: anyFirstStage } = await supabase
    .from("deal_stages")
    .select("id")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (anyFirstStage?.id) return anyFirstStage.id;

  const { data: createdStage, error: createStageError } = await supabase
    .from("deal_stages")
    .insert({
      name: "Appointment Set",
      type: "consultation",
      sort_order: 10,
      is_default: true,
      is_demo: false,
    })
    .select("id")
    .single<{ id: string }>();

  if (createStageError) {
    console.error("[Booking] Could not create fallback deal stage:", createStageError);
  }

  return createdStage?.id ?? null;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!isEmailConfigured()) {
    console.log("Resend not configured, skipping email send");
    return;
  }

  const result = await sendEmailViaResend({
    to,
    subject,
    html,
  });

  if (!result.success) {
    console.error("Error sending email via Resend:", result.error);
    throw new Error(`Failed to send email: ${result.error}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BookingPayload;

    const {
      firstName,
      lastName,
      email,
      phone,
      appointmentDate,
      service,
      doctorSlug,
      doctorName,
      doctorEmail,
      notes,
      location,
      language: requestedLanguage = "en",
      treatmentId,
    } = body;
    let language = normalizePatientLanguage(requestedLanguage, "en");

    // Validate required fields
    if (!firstName || !lastName || !email || !appointmentDate || !service || !doctorSlug || !doctorName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const patientName = `${firstName} ${lastName}`;
    // The booking page already sends the correct UTC ISO string via createSwissDateTime().toISOString()
    // So we just parse it directly - no need for additional timezone conversion
    const appointmentDateObj = new Date(appointmentDate);

    // Use the exact /appointments calendar selected on the booking doctor.
    // Keep the legacy name lookup only for doctors that are not mapped yet.
    let providerId: string | null = null;
    const doctorNameClean = doctorName.replace(/^Dr\.\s*/i, "").trim();
    const doctorNameParts = doctorNameClean.split(" ");
    const doctorFirstName = doctorNameParts[0] || "";
    const doctorLastName = doctorNameParts.slice(1).join(" ") || "";
    
    const calendarLink = await resolveBookingDoctorCalendar(supabase, doctorSlug);
    if (calendarLink?.providerId) {
      providerId = calendarLink.providerId;
      console.log(
        `[Booking] Using mapped calendar: ${calendarLink.bookingDoctorName} -> ${calendarLink.providerName} (${providerId})`
      );
    }

    if (!providerId) {
      // Try multiple name formats: "FirstName LastName", "LastName FirstName", or partial matches
      const { data: provider } = await supabase
        .from("providers")
        .select("id, name")
        .in("role", ["doctor", "nurse", "technician"])
        .or(`name.ilike.%${doctorNameClean}%,name.ilike.%${doctorLastName} ${doctorFirstName}%,name.ilike.%${doctorFirstName}%`)
        .limit(1)
        .maybeSingle();

      if (provider) {
        providerId = provider.id;
        console.log(`[Booking] Found provider: ${provider.name} (${provider.id}) for doctor: ${doctorName}`);
      } else {
        console.log(`[Booking] Provider not found for: ${doctorName}, trying alternate lookup...`);

        const { data: altProvider } = await supabase
          .from("providers")
          .select("id, name")
          .in("role", ["doctor", "nurse", "technician"])
          .or(`name.ilike.%${doctorFirstName}%,name.ilike.%${doctorLastName}%`)
          .limit(10);

        if (altProvider && altProvider.length > 0) {
          const bestMatch = altProvider.find(p => {
            const pName = (p.name || "").toLowerCase();
            return pName.includes(doctorFirstName.toLowerCase()) && pName.includes(doctorLastName.toLowerCase());
          });

          if (bestMatch) {
            providerId = bestMatch.id;
            console.log(`[Booking] Found provider via alternate lookup: ${bestMatch.name} (${bestMatch.id})`);
          }
        }
      }
    }

    // Doctor-specific capacity: XT and CR can have 3 concurrent, others have 1
    const MULTI_CAPACITY_DOCTORS = ["xavier-tenorio", "cesar-rodriguez"];
    const maxCapacity = MULTI_CAPACITY_DOCTORS.includes(doctorSlug) ? 3 : 1;

    // Look up treatment duration and category metadata; fall back to 60 min if not found
    let durationMinutes = 60;
    let categoryName: string | null = null;
    let treatmentServiceId: string | null = null;
    if (treatmentId) {
      const { data: treatmentData } = await supabase
        .from("booking_treatments")
        .select(`
          duration_minutes,
          linked_service_id,
          service_category_id,
          assigned_service_categories:service_category_id(name, color),
          services:linked_service_id(
            service_categories(name, color)
          ),
          booking_categories(name)
        `)
        .eq("id", treatmentId)
        .single<TreatmentBookingDetails>();

      if (treatmentData?.duration_minutes) {
        durationMinutes = treatmentData.duration_minutes;
      }

      treatmentServiceId = treatmentData?.linked_service_id ?? null;

      categoryName =
        treatmentData?.assigned_service_categories?.name?.trim() ||
        treatmentData?.services?.service_categories?.name?.trim() ||
        treatmentData?.booking_categories?.name?.trim() ||
        null;
    }

    if (!treatmentServiceId) {
      const normalizedServiceName = service.trim();
      const serviceSearchTerms = [
        normalizedServiceName,
        ...normalizedServiceName
          .split(/\s+/)
          .map((term) => term.replace(/[^\p{L}\p{N}-]/gu, ""))
          .filter((term) => term.length >= 3),
      ];

      for (const searchTerm of [...new Set(serviceSearchTerms)]) {
        const { data: matchingServices } = await supabase
          .from("services")
          .select("id")
          .ilike("name", `%${searchTerm}%`)
          .limit(1);

        if (matchingServices?.[0]?.id) {
          treatmentServiceId = matchingServices[0].id;
          break;
        }
      }
    }

    // Check if time slot has capacity for this doctor using full overlap detection.
    const apptStart = appointmentDateObj;
    const apptEnd = new Date(appointmentDateObj.getTime() + durationMinutes * 60 * 1000);

    console.log(`[Booking] Checking availability for ${doctorName} (${doctorSlug}) at ${apptStart.toISOString()}`);
    console.log(`[Booking] Max capacity for this doctor: ${maxCapacity}`);
    console.log(`[Booking] Provider ID found: ${providerId}`);

    const { data: existingAppointments, error: fetchError } = await supabase
      .from("appointments")
      .select("id, no_patient, provider_id, reason, start_time, end_time")
      .lt("start_time", apptEnd.toISOString())
      .gt("end_time", apptStart.toISOString())
      .neq("status", "cancelled");

    if (fetchError) {
      console.error("[Booking] Error fetching appointments:", fetchError);
    }

    console.log(`[Booking] Found ${existingAppointments?.length || 0} total appointments in time range`);

    // Filter to only this doctor's appointments (excluding placeholder/blocking ones)
    const doctorAppointments = (existingAppointments || []).filter((apt) => {
      // Skip placeholder appointments
      if (apt.no_patient === true) return false;
      
      // Check by provider_id first (most reliable)
      if (providerId && apt.provider_id === providerId) {
        return true;
      }
      
      // Fallback: check the reason field for [Doctor: Name] pattern
      if (apt.reason) {
        const match = apt.reason.match(/\[Doctor:\s*(.+?)\s*\]/i);
        if (match && match[1].toLowerCase().includes(doctorNameClean.toLowerCase())) {
          return true;
        }
      }
      
      return false;
    });

    console.log(`[Booking] Found ${doctorAppointments.length} overlapping appointments for ${doctorName}`);
    console.log(`[Booking] Appointments:`, doctorAppointments.map(a => ({ id: a.id, provider_id: a.provider_id, reason: a.reason?.substring(0, 50) })));

    // Only block if provider has reached maximum capacity
    if (doctorAppointments.length >= maxCapacity) {
      console.log(`[Booking] REJECTED: ${doctorAppointments.length} >= ${maxCapacity}`);
      return NextResponse.json(
        { error: `This time slot is fully booked (${doctorAppointments.length}/${maxCapacity}). Please choose another time.` },
        { status: 409 }
      );
    }

    console.log(`[Booking] ALLOWED: ${doctorAppointments.length} < ${maxCapacity}`);

    // ── Machine availability check ──
    // Look up if the treatment requires a machine:
    // 1. Direct machine_id on booking_treatments (preferred)
    // 2. Fallback: linked_service_id → service_machines
    let resolvedMachineId: string | null = null;
    if (treatmentId) {
      const { data: treatmentRow } = await supabase
        .from("booking_treatments")
        .select("machine_id, linked_service_id")
        .eq("id", treatmentId)
        .single();

      if (treatmentRow?.machine_id) {
        // Direct assignment on booking treatment
        resolvedMachineId = treatmentRow.machine_id;
        const { data: machine } = await supabase
          .from("machines")
          .select("max_concurrent, name")
          .eq("id", resolvedMachineId)
          .single();

        if (machine) {
          const { data: machineAppts } = await supabase
            .from("appointments")
            .select("id, appointment_group_id")
            .contains("machine_ids", [resolvedMachineId])
            .lt("start_time", apptEnd.toISOString())
            .gt("end_time", apptStart.toISOString())
            .not("status", "in", "(cancelled,no_show)");

          if (machineAppts) {
            const uniqueUses = new Set(machineAppts.map((a) => a.appointment_group_id || a.id));
            if (uniqueUses.size >= machine.max_concurrent) {
              console.log(`[Booking] REJECTED: Machine ${machine.name} at capacity (${uniqueUses.size}/${machine.max_concurrent})`);
              return NextResponse.json(
                { error: `The ${machine.name} is not available at this time. Please choose another slot.` },
                { status: 409 }
              );
            }
          }
        }
      } else if (treatmentRow?.linked_service_id) {
        const { data: machineMapping } = await supabase
          .from("service_machines")
          .select("machine_id, machines(max_concurrent, name)")
          .eq("service_id", treatmentRow.linked_service_id)
          .limit(1)
          .single();

        if (machineMapping) {
          resolvedMachineId = machineMapping.machine_id;
          const machine = machineMapping.machines as any;
          const maxConcurrent = machine?.max_concurrent ?? 1;

          // Count overlapping appointments using this machine (dedup by group)
          const { data: machineAppts } = await supabase
            .from("appointments")
            .select("id, appointment_group_id")
            .contains("machine_ids", [resolvedMachineId])
            .lt("start_time", apptEnd.toISOString())
            .gt("end_time", apptStart.toISOString())
            .not("status", "in", "(cancelled,no_show)");

          if (machineAppts) {
            const uniqueUses = new Set(machineAppts.map((a) => a.appointment_group_id || a.id));
            if (uniqueUses.size >= maxConcurrent) {
              console.log(`[Booking] REJECTED: Machine ${machine?.name} at capacity (${uniqueUses.size}/${maxConcurrent})`);
              return NextResponse.json(
                { error: `The ${machine?.name || "required machine"} is not available at this time. Please choose another slot.` },
                { status: 409 }
              );
            }
          }
        }
      }
    }

    // Check if patient exists or create new — use ilike + limit(1) to handle
    // case-insensitive matching and gracefully tolerate any pre-existing duplicates.
    let patientId: string;
    let patientGender: string | undefined;
    const { data: existingPatients } = await supabase
      .from("patients")
      .select("id, gender, language_preference")
      .ilike("email", email)
      .limit(1);

    const existingPatient = existingPatients?.[0] ?? null;

    let isNewPatient = false;
    if (existingPatient) {
      patientId = existingPatient.id;
      patientGender = existingPatient.gender ?? undefined;
      language = normalizePatientLanguage(existingPatient.language_preference, language);
      console.log(`[Booking] Found existing patient: ${patientId}`);
    } else {
      // Create new patient
      const { data: newPatient, error: patientError } = await supabase
        .from("patients")
        .insert({
          first_name: stripHtml(firstName) ?? firstName,
          last_name: stripHtml(lastName) ?? lastName,
          email: email.toLowerCase(),
          phone: phone || null,
          language_preference: language,
          source: "online_booking",
        })
        .select("id")
        .single();

      if (patientError || !newPatient) {
        console.error("Error creating patient:", patientError);
        return NextResponse.json(
          { error: "Failed to create patient record" },
          { status: 500 }
        );
      }

      patientId = newPatient.id;
      isNewPatient = true;
    }

    // providerId was already looked up earlier for availability check
    // If it wasn't found earlier, try one more lookup method
    if (!providerId) {
      const simpleName = doctorName.replace(/^Dr\.\s*/i, "");
      const { data: providerBySimpleName } = await supabase
        .from("providers")
        .select("id")
        .in("role", ["doctor", "nurse", "technician"])
        .ilike("name", `%${simpleName.split(" ")[0]}%`)
        .limit(1)
        .maybeSingle();
      
      if (providerBySimpleName) {
        providerId = providerBySimpleName.id;
        console.log("Found provider by simple name:", providerBySimpleName.id);
      } else {
        console.log("Provider not found for doctor:", doctorName, "- appointment will not be linked to a specific provider");
      }
    } else {
      console.log("Using provider:", providerId, "for doctor:", doctorName);
    }

    // Build reason field - service info only, notes go into the dedicated notes column
    const categoryTag = categoryName ? ` [Category: ${categoryName}]` : "";
    const safeService = stripHtml(service) ?? service;
    const reason = `${safeService} [Doctor: ${doctorName.replace("Dr. ", "")}] [Online Booking] [Lang: ${language}]${categoryTag}`;

    const bookingDealStageId = await findBookingDealStageId(supabase);
    if (!bookingDealStageId) {
      console.error("[Booking] Could not find a deal stage for online booking deal creation");
      return NextResponse.json(
        { error: "Failed to create booking deal" },
        { status: 500 }
      );
    }

    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .insert({
        patient_id: patientId,
        stage_id: bookingDealStageId,
        service_id: treatmentServiceId,
        title: `${patientName} - ${service}`,
        pipeline: "Online Booking",
        contact_label: "Online Booking",
        location: location || "Geneva",
        notes: [
          `Auto-created from online appointment booking on ${new Date().toISOString()}.`,
          `Treatment: ${service}`,
          `Doctor: ${doctorName}`,
          `Appointment: ${appointmentDateObj.toISOString()}`,
          notes ? `Patient notes: ${notes}` : null,
        ].filter(Boolean).join("\n"),
      })
      .select("id")
      .single();

    if (dealError || !deal) {
      console.error("[Booking] Error creating deal:", dealError);
      return NextResponse.json(
        { error: "Failed to create booking deal" },
        { status: 500 }
      );
    }

    // Create the appointment
    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .insert({
        patient_id: patientId,
        deal_id: deal.id,
        provider_id: providerId,
        start_time: appointmentDateObj.toISOString(),
        end_time: apptEnd.toISOString(),
        reason,
        notes: stripHtml(notes) || null,
        location: location || "Geneva",
        status: "scheduled",
        source: "online_booking",
        machine_ids: resolvedMachineId ? [resolvedMachineId] : [],
      })
      .select("id")
      .single();

    if (appointmentError || !appointment) {
      console.error("Error creating appointment:", appointmentError);
      await supabase.from("deals").delete().eq("id", deal.id);
      return NextResponse.json(
        { error: "Failed to create appointment" },
        { status: 500 }
      );
    }

    // If this is a new patient, trigger the patient-created workflow to create deal and task
    if (isNewPatient) {
      try {
        // Get the base URL from the request
        const url = new URL(request.url);
        const baseUrl = `${url.protocol}//${url.host}`;
        
        await fetch(`${baseUrl}/api/workflows/patient-created`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patient_id: patientId, skipDealCreation: true }),
        });
        console.log("✓ Triggered patient-created workflow for new patient:", patientId);
      } catch (err) {
        console.error("✗ Failed to trigger patient-created workflow:", err);
        // Don't fail the booking if workflow trigger fails
      }
    }

    // Send confirmation email to patient
    console.log("Attempting to send confirmation emails...");
    console.log("Email service configured:", isEmailConfigured());
    console.log("Patient email:", email);
    console.log("Doctor email:", doctorEmail);
    
    const emailSubject = language === "fr"
      ? `Votre rendez-vous au sein de Maison Tóā`
      : `Your appointment at Maison Tóā`;

    // Auto-create patient information form and get the URL
    let formUrl: string | undefined;
    const isFrench = language === "fr";
    try {
      const formId = isFrench ? "patient-information-fr" : "patient-information-en";
      const formName = isFrench ? "Informations patient" : "Patient Information Form";
      
      const { data: completedForm, error: completedFormError } = await supabase
        .from("patient_form_submissions")
        .select("id")
        .eq("patient_id", patientId)
        .like("form_id", "patient-information-%")
        .eq("status", "submitted")
        .limit(1)
        .maybeSingle();

      if (completedFormError) {
        console.error("Error checking completed patient form:", completedFormError);
      }

      if (!completedForm) {
        // Create form submission record
        const { data: formSubmission, error: formError } = await supabase
          .from("patient_form_submissions")
          .insert({
            patient_id: patientId,
            form_id: formId,
            form_name: formName,
            status: "pending",
            submission_data: {},
          })
          .select("id, token")
          .single();

        if (!formError && formSubmission) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";
          formUrl = `${appUrl}/form/${formId}?token=${formSubmission.token}`;
          console.log("✓ Patient form created with URL:", formUrl);
        }
      }
    } catch (formErr) {
      console.error("Error creating patient form:", formErr);
      // Continue without form - non-critical
    }

    // Trigger the appointment-created workflow engine. If an active workflow
    // handles the booking confirmation, it owns the patient confirmation +
    // reminder. Otherwise we fall back to the hardcoded emails below so that
    // confirmations can never silently stop going out.
    let handledByWorkflow = false;
    try {
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      const wfRes = await fetch(`${baseUrl}/api/workflows/appointment-created`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: appointment.id,
          patientId,
          language,
          formUrl,
          patient: {
            first_name: firstName,
            last_name: lastName,
            email,
            phone: phone || null,
            gender: patientGender,
          },
          appointment: {
            date: appointmentDateObj.toISOString(),
            service,
            doctorName,
            doctorEmail,
            location: location || null,
          },
        }),
      });

      if (wfRes.ok) {
        const wfJson = await wfRes.json().catch(() => ({}));
        if (typeof wfJson?.workflowsRun === "number" && wfJson.workflowsRun > 0) {
          handledByWorkflow = true;
          console.log(
            `✓ Appointment-created workflow handled confirmation (${wfJson.workflowsRun} workflow(s), ${wfJson.actionsRun ?? 0} action(s))`,
          );
        }
      } else {
        console.warn("Appointment-created workflow returned non-OK status:", wfRes.status);
      }
    } catch (err) {
      console.error("✗ Failed to trigger appointment-created workflow:", err);
      // Fall back to hardcoded emails below.
    }

    if (!handledByWorkflow) {
      try {
        const patientEmailHtml = generatePatientConfirmationEmail(
          lastName,
          patientGender,
          doctorName,
          appointmentDateObj,
          service,
          location || null,
          language,
          appointment.id,
          formUrl
        );
        await sendEmail(email, emailSubject, patientEmailHtml);
        console.log("✓ Patient confirmation email sent successfully to:", email);
      } catch (err) {
        console.error("✗ Error sending patient email:", err);
      }
    }

    // Send notification email to doctor
    try {
      const doctorEmailHtml = generateDoctorNotificationEmail(
        doctorName,
        patientName,
        email,
        phone || null,
        appointmentDateObj,
        service,
        notes || null,
        location || null
      );
      await sendEmail(
        doctorEmail,
        `New Appointment: ${patientName} - ${formatAppointmentDate(appointmentDateObj)}`,
        doctorEmailHtml
      );
      console.log("✓ Doctor notification email sent successfully to:", doctorEmail);
    } catch (err) {
      console.error("✗ Error sending doctor email:", err);
    }

    let reminderScheduled = false;
    const reminderDate = new Date(appointmentDateObj);
    reminderDate.setDate(reminderDate.getDate() - 1);

    if (!handledByWorkflow && reminderDate.getTime() > Date.now()) {
      try {
        const reminderHtml = generatePatientReminderEmail(
          lastName,
          patientGender,
          appointmentDateObj,
          service,
          language,
          appointment.id
        );

        const { error: reminderError } = await supabase.from("scheduled_emails").insert({
          patient_id: patientId,
          appointment_id: appointment.id,
          recipient_type: "patient",
          recipient_email: email,
          subject: language === "fr" ? "Rappel de votre rendez-vous" : "Appointment reminder",
          body: reminderHtml,
          scheduled_for: reminderDate.toISOString(),
          status: "pending",
        });

        if (reminderError) {
          console.error("Error scheduling patient reminder email:", reminderError);
        } else {
          reminderScheduled = true;
          console.log("✓ Patient reminder email scheduled for:", reminderDate.toISOString());
        }
      } catch (err) {
        console.error("Error scheduling patient reminder email:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      appointmentId: appointment.id,
      message: "Appointment booked successfully",
      reminderScheduled,
    });
  } catch (error) {
    console.error("Error booking appointment:", error);
    return NextResponse.json(
      { error: "Failed to book appointment", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
