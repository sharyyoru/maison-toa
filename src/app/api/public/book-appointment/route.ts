import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatSwissDateWithWeekday, formatSwissTimeAmPm } from "@/lib/swissTimezone";
import { brandedEmail, infoRow, infoTable, LOGO_URL } from "@/utils/emailTemplate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const mailgunApiKey = process.env.MAILGUN_API_KEY;
const mailgunDomain = process.env.MAILGUN_DOMAIN;
const mailgunFromEmail = process.env.MAILGUN_FROM_EMAIL;
const mailgunFromName = process.env.MAILGUN_FROM_NAME || "Maison Toa";
const mailgunApiBaseUrl = process.env.MAILGUN_API_BASE_URL || "https://api.mailgun.net";

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
};

async function sendEmail(to: string, subject: string, html: string) {
  if (!mailgunApiKey || !mailgunDomain) {
    console.log("Mailgun not configured, skipping email send");
    return;
  }

  const domain = mailgunDomain as string;
  const fromAddress = mailgunFromEmail || `no-reply@${domain}`;

  const formData = new FormData();
  formData.append("from", `${mailgunFromName} <${fromAddress}>`);
  formData.append("to", to);
  formData.append("subject", subject);
  formData.append("html", html);

  const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64");

  const response = await fetch(`${mailgunApiBaseUrl}/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("Error sending email via Mailgun", response.status, text);
    throw new Error(`Failed to send email: ${response.status}`);
  }
}

function formatDate(date: Date, language = "en"): string {
  if (language === "fr") {
    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Europe/Zurich",
    });
  }
  return formatSwissDateWithWeekday(date);
}

function formatTime(date: Date, language = "en"): string {
  if (language === "fr") {
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Zurich",
    });
  }
  return formatSwissTimeAmPm(date);
}

function getSalutation(
  lastName: string,
  gender: string | undefined,
  language: string
): string {
  const isFrench = language === "fr";

  if (gender === "female") {
    return isFrench ? `Chère Madame ${lastName}` : `Dear Ms. ${lastName}`;
  } else if (gender === "male") {
    return isFrench ? `Cher Monsieur ${lastName}` : `Dear Mr. ${lastName}`;
  }
  // Fallback when gender is unknown or "other"
  return isFrench ? "Madame, Monsieur," : "Dear Sir or Madam,";
}

function generatePatientConfirmationEmail(
  lastName: string,
  gender: string | undefined,
  doctorName: string,
  appointmentDate: Date,
  service: string,
  location: string | null,
  language: string,
  appointmentId?: string
): string {
  const isFrench = language === "fr";
  const salutation = getSalutation(lastName, gender, language);

  // Translations
  const t = {
    en: {
      subject: "Your appointment at Maison Tóā",
      confirmed: "We are pleased to confirm your appointment at Maison Tóā.",
      yourAppointment: "Your appointment",
      date: "Date",
      time: "Time",
      treatment: "Treatment",
      practitioner: "Practitioner",
      manageAppointment: "You may manage your appointment at any time.",
      reschedule: "Reschedule my appointment",
      cancel: "Cancel my appointment",
      closing: "We look forward to welcoming you.",
      clinicAddress: "Voie du Chariot 6<br>1003 Lausanne",
    },
    fr: {
      subject: "Votre rendez-vous au sein de Maison Tóā",
      confirmed: "Nous avons le plaisir de vous confirmer votre rendez-vous au sein de Maison Tóā.",
      yourAppointment: "Votre rendez-vous",
      date: "Date",
      time: "Heure",
      treatment: "Soin",
      practitioner: "Praticien",
      manageAppointment: "Vous avez la possibilité de gérer votre rendez-vous à tout moment.",
      reschedule: "Modifier mon rendez-vous",
      cancel: "Annuler mon rendez-vous",
      closing: "Dans l'attente du plaisir de vous accueillir, nous vous prions d'agréer nos salutations distinguées.",
      clinicAddress: "Voie du Chariot 6<br>1003 Lausanne",
    },
  };

  const texts = isFrench ? t.fr : t.en;

  // Build management URL (placeholder - will be implemented when reschedule/cancel pages exist)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";
  const manageUrl = appointmentId
    ? `${appUrl}/appointments/manage?id=${appointmentId}`
    : `${appUrl}/book-appointment`;

  const rows =
    infoRow(texts.practitioner, doctorName) +
    infoRow(texts.date, formatDate(appointmentDate, language)) +
    infoRow(texts.time, formatTime(appointmentDate, language)) +
    infoRow(texts.treatment, service) +
    (location ? infoRow(isFrench ? "Lieu" : "Location", location) : "");

  const body = `
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #1a1a18;">${salutation}</p>
    <p style="margin: 0 0 20px 0; color: #4a4742;">${texts.confirmed}</p>
    <p style="margin: 0 0 8px 0; color: #8a8578; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase;">${texts.yourAppointment}</p>
    ${infoTable(rows)}
    <p style="margin: 16px 0; color: #4a4742;">${texts.manageAppointment}</p>
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 24px 0;">
      <tr>
        <td style="padding: 0 8px 8px 0;">
          <a href="${manageUrl}&action=reschedule" style="display: block; background-color: #1a1a18; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 500;">${texts.reschedule}</a>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 8px 0 0;">
          <a href="${manageUrl}&action=cancel" style="display: block; background-color: #f5f3ef; color: #1a1a18; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 500; border: 1px solid #e8e3db;">${texts.cancel}</a>
        </td>
      </tr>
    </table>
    <p style="margin: 24px 0 0 0; color: #4a4742;">${texts.closing}</p>
    <p style="margin: 8px 0 0 0; color: #1a1a18; font-weight: 500;">Maison Tóā</p>
    <img src="${LOGO_URL}" alt="Maison Tóā" width="80" style="display: block; width: 80px; height: auto; margin: 16px 0 0 0;">
  `;

  return brandedEmail(body);
}

function generateDoctorNotificationEmail(
  doctorName: string,
  patientName: string,
  patientEmail: string,
  patientPhone: string | null,
  appointmentDate: Date,
  service: string,
  notes: string | null,
  location: string | null
): string {
  const patientRows =
    infoRow("Name", patientName) +
    infoRow("Email", patientEmail) +
    (patientPhone ? infoRow("Phone", patientPhone) : "");

  const appointmentRows =
    infoRow("Date", formatDate(appointmentDate)) +
    infoRow("Time", formatTime(appointmentDate)) +
    infoRow("Service", service) +
    (location ? infoRow("Location", location) : "");

  const body = `
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #1a1a18;">Dear ${doctorName},</p>
    <p style="margin: 0 0 4px 0; color: #4a4742;">A new appointment has been booked through the online booking portal.</p>
    <p style="margin: 0 0 4px 0; color: #8a8578; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase;">Patient</p>
    ${infoTable(patientRows)}
    <p style="margin: 0 0 4px 0; color: #8a8578; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase;">Appointment</p>
    ${infoTable(appointmentRows)}
    ${notes ? `<p style="margin: 16px 0 4px 0; color: #8a8578; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase;">Notes</p>
    <p style="margin: 0; color: #4a4742; font-size: 14px;">${notes}</p>` : ""}
  `;

  return brandedEmail(body);
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
      language = "en",
    } = body;

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

    // Look up the provider ID for this doctor to filter appointments correctly
    let providerId: string | null = null;
    const doctorNameClean = doctorName.replace(/^Dr\.\s*/i, "").trim();
    const doctorNameParts = doctorNameClean.split(" ");
    const doctorFirstName = doctorNameParts[0] || "";
    const doctorLastName = doctorNameParts.slice(1).join(" ") || "";
    
    // Try multiple name formats: "FirstName LastName", "LastName FirstName", or partial matches
    const { data: provider } = await supabase
      .from("providers")
      .select("id, name")
      .or(`name.ilike.%${doctorNameClean}%,name.ilike.%${doctorLastName} ${doctorFirstName}%,name.ilike.%${doctorFirstName}%`)
      .limit(1)
      .single();
    
    if (provider) {
      providerId = provider.id;
      console.log(`[Booking] Found provider: ${provider.name} (${provider.id}) for doctor: ${doctorName}`);
    } else {
      console.log(`[Booking] Provider not found for: ${doctorName}, trying alternate lookup...`);
      
      // Try searching by individual name parts
      const { data: altProvider } = await supabase
        .from("providers")
        .select("id, name")
        .or(`name.ilike.%${doctorFirstName}%,name.ilike.%${doctorLastName}%`)
        .limit(10);
      
      if (altProvider && altProvider.length > 0) {
        // Find the best match - one that contains both first and last name
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

    // Doctor-specific capacity: XT and CR can have 3 concurrent, others have 1
    const MULTI_CAPACITY_DOCTORS = ["xavier-tenorio", "cesar-rodriguez"];
    const maxCapacity = MULTI_CAPACITY_DOCTORS.includes(doctorSlug) ? 3 : 1;

    // Check if time slot has capacity for this doctor
    // Use 30-minute slot window to match the check-availability logic
    const slotStart = new Date(appointmentDateObj);
    const slotEnd = new Date(appointmentDateObj.getTime() + 30 * 60 * 1000); // 30 minutes

    console.log(`[Booking] Checking availability for ${doctorName} (${doctorSlug}) at ${slotStart.toISOString()}`);
    console.log(`[Booking] Max capacity for this doctor: ${maxCapacity}`);
    console.log(`[Booking] Provider ID found: ${providerId}`);

    const { data: existingAppointments, error: fetchError } = await supabase
      .from("appointments")
      .select("id, no_patient, provider_id, reason, start_time")
      .gte("start_time", slotStart.toISOString())
      .lt("start_time", slotEnd.toISOString())
      .neq("status", "cancelled");

    if (fetchError) {
      console.error("[Booking] Error fetching appointments:", fetchError);
    }

    console.log(`[Booking] Found ${existingAppointments?.length || 0} total appointments in time range`);

    // Filter to only this doctor's appointments
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

    console.log(`[Booking] Found ${doctorAppointments.length} appointments for ${doctorName}`);
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

    // Check if patient exists or create new — use ilike + limit(1) to handle
    // case-insensitive matching and gracefully tolerate any pre-existing duplicates.
    let patientId: string;
    let patientGender: string | undefined;
    const { data: existingPatients } = await supabase
      .from("patients")
      .select("id, gender")
      .ilike("email", email)
      .limit(1);

    const existingPatient = existingPatients?.[0] ?? null;

    let isNewPatient = false;
    if (existingPatient) {
      patientId = existingPatient.id;
      patientGender = existingPatient.gender ?? undefined;
      console.log(`[Booking] Found existing patient: ${patientId}`);
    } else {
      // Create new patient
      const { data: newPatient, error: patientError } = await supabase
        .from("patients")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: email.toLowerCase(),
          phone: phone || null,
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

    // Calculate end time (1 hour duration)
    const endDateObj = new Date(appointmentDateObj.getTime() + 60 * 60 * 1000);

    // providerId was already looked up earlier for availability check
    // If it wasn't found earlier, try one more lookup method
    if (!providerId) {
      const simpleName = doctorName.replace(/^Dr\.\s*/i, "");
      const { data: providerBySimpleName } = await supabase
        .from("providers")
        .select("id")
        .ilike("name", `%${simpleName.split(" ")[0]}%`)
        .single();
      
      if (providerBySimpleName) {
        providerId = providerBySimpleName.id;
        console.log("Found provider by simple name:", providerBySimpleName.id);
      } else {
        console.log("Provider not found for doctor:", doctorName, "- appointment will not be linked to a specific provider");
      }
    } else {
      console.log("Using provider:", providerId, "for doctor:", doctorName);
    }

    // Build reason field - include [Doctor: Name], [Online Booking], and [Lang: xx] for downstream use
    const reason = `${service}${notes ? ` - ${notes}` : ""} [Doctor: ${doctorName.replace("Dr. ", "")}] [Online Booking] [Lang: ${language}]`;

    // Create the appointment
    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .insert({
        patient_id: patientId,
        provider_id: providerId,
        start_time: appointmentDateObj.toISOString(),
        end_time: endDateObj.toISOString(),
        reason,
        location: location || "Geneva",
        status: "scheduled",
        source: "online_booking",
      })
      .select("id")
      .single();

    if (appointmentError || !appointment) {
      console.error("Error creating appointment:", appointmentError);
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
          body: JSON.stringify({ patient_id: patientId }),
        });
        console.log("✓ Triggered patient-created workflow for new patient:", patientId);
      } catch (err) {
        console.error("✗ Failed to trigger patient-created workflow:", err);
        // Don't fail the booking if workflow trigger fails
      }
    }

    // Send confirmation email to patient
    console.log("Attempting to send confirmation emails...");
    console.log("Mailgun configured:", !!mailgunApiKey && !!mailgunDomain);
    console.log("Patient email:", email);
    console.log("Doctor email:", doctorEmail);
    
    const emailSubject = language === "fr"
      ? `Votre rendez-vous au sein de Maison Tóā`
      : `Your appointment at Maison Tóā`;

    try {
      const patientEmailHtml = generatePatientConfirmationEmail(
        lastName,
        patientGender,
        doctorName,
        appointmentDateObj,
        service,
        location || null,
        language,
        appointment.id
      );
      await sendEmail(email, emailSubject, patientEmailHtml);
      console.log("✓ Patient confirmation email sent successfully to:", email);
    } catch (err) {
      console.error("✗ Error sending patient email:", err);
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
        `New Appointment: ${patientName} - ${formatDate(appointmentDateObj)}`,
        doctorEmailHtml
      );
      console.log("✓ Doctor notification email sent successfully to:", doctorEmail);
    } catch (err) {
      console.error("✗ Error sending doctor email:", err);
    }

    return NextResponse.json({
      ok: true,
      appointmentId: appointment.id,
      message: "Appointment booked successfully",
    });
  } catch (error) {
    console.error("Error booking appointment:", error);
    return NextResponse.json(
      { error: "Failed to book appointment", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
