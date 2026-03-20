import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatSwissDateWithWeekday, formatSwissTimeAmPm, parseSwissDateTimeLocal } from "@/lib/swissTimezone";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const mailgunApiKey = process.env.MAILGUN_API_KEY;
const mailgunDomain = process.env.MAILGUN_DOMAIN;
const mailgunFromEmail = process.env.MAILGUN_FROM_EMAIL;
const mailgunFromName = process.env.MAILGUN_FROM_NAME || "Aesthetics Clinic";
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

function formatDate(date: Date): string {
  return formatSwissDateWithWeekday(date);
}

function formatTime(date: Date): string {
  return formatSwissTimeAmPm(date);
}

function generatePatientConfirmationEmail(
  patientName: string,
  doctorName: string,
  appointmentDate: Date,
  service: string,
  location: string | null
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <div style="background: #1e293b; padding: 40px 30px; border-radius: 16px 16px 0 0; text-align: center;">
    <img src="https://cdn.jsdelivr.net/gh/sharyyoru/aestheticclinic@main/public/logos/aesthetics-logo.svg" alt="Aesthetics Clinic" style="height: 40px; margin-bottom: 20px; filter: brightness(0) invert(1);">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Appointment Confirmed!</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Thank you for booking with us</p>
  </div>
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
    <p style="font-size: 18px; margin-bottom: 24px; color: #1e293b;">Dear <strong>${patientName}</strong>,</p>
    <p style="margin-bottom: 24px; color: #475569;">Your appointment has been successfully scheduled. We look forward to seeing you!</p>
    
    <div style="background: #f8fafc; padding: 24px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
      <h3 style="margin: 0 0 16px 0; color: #1e293b; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Appointment Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Doctor</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${doctorName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Date</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${formatDate(appointmentDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Time</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${formatTime(appointmentDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Service</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${service}</td>
        </tr>
        ${location ? `
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Location</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${location}</td>
        </tr>
        ` : ""}
      </table>
    </div>
    
    <div style="background: #fef3c7; padding: 16px; border-radius: 8px; border-left: 4px solid #1e293b; margin-bottom: 24px;">
      <p style="margin: 0; color: #1e293b; font-size: 14px;">
        <strong>Important:</strong> If you need to reschedule or cancel your appointment, please contact us at least 24 hours in advance.
      </p>
    </div>
    
    <p style="margin-bottom: 0; color: #475569;">Best regards,<br><strong style="color: #1e293b;">Aesthetics Clinic Team</strong></p>
  </div>
  <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
    <p style="margin: 0;">© ${new Date().getFullYear()} Aesthetics Clinic. All rights reserved.</p>
  </div>
</body>
</html>`;
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
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <div style="background: #1e293b; padding: 40px 30px; border-radius: 16px 16px 0 0; text-align: center;">
    <img src="https://cdn.jsdelivr.net/gh/sharyyoru/aestheticclinic@main/public/logos/aesthetics-logo.svg" alt="Aesthetics Clinic" style="height: 40px; margin-bottom: 20px; filter: brightness(0) invert(1);">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">New Appointment Booked</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Via Online Booking</p>
  </div>
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
    <p style="font-size: 18px; margin-bottom: 24px; color: #1e293b;">Hi <strong>${doctorName}</strong>,</p>
    <p style="margin-bottom: 24px; color: #475569;">A new appointment has been booked through the online booking system.</p>
    
    <div style="background: #f8fafc; padding: 24px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
      <h3 style="margin: 0 0 16px 0; color: #1e293b; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Patient Information</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Name</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${patientName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Email</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${patientEmail}</td>
        </tr>
        ${patientPhone ? `
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Phone</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${patientPhone}</td>
        </tr>
        ` : ""}
      </table>
    </div>

    <div style="background: #f1f5f9; padding: 24px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #cbd5e1;">
      <h3 style="margin: 0 0 16px 0; color: #1e293b; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Appointment Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Date</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${formatDate(appointmentDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Time</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${formatTime(appointmentDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Service</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${service}</td>
        </tr>
        ${location ? `
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Location</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${location}</td>
        </tr>
        ` : ""}
      </table>
    </div>
    
    ${notes ? `
    <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; font-weight: 600;">Patient Notes:</p>
      <p style="margin: 0; color: #1e293b; font-size: 14px;">${notes}</p>
    </div>
    ` : ""}
    
    <p style="margin-bottom: 0; color: #475569;">This appointment has been added to your agenda.</p>
  </div>
  <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
    <p style="margin: 0;">© ${new Date().getFullYear()} Aesthetics Clinic. All rights reserved.</p>
  </div>
</body>
</html>`;
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
    // Parse the datetime-local string as Swiss timezone to ensure correct UTC time
    const appointmentDateObj = parseSwissDateTimeLocal(appointmentDate);

    // Look up the provider ID for this doctor to filter appointments correctly
    let providerId: string | null = null;
    const doctorNameClean = doctorName.replace(/^Dr\.\s*/i, "").trim();
    
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .or(`name.ilike.*${doctorNameClean}*,name.ilike.*${doctorNameClean.split(" ")[0]}*`)
      .limit(1)
      .single();
    
    if (provider) {
      providerId = provider.id;
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

    // Check if patient exists or create new
    let patientId: string;
    const { data: existingPatient } = await supabase
      .from("patients")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

    let isNewPatient = false;
    if (existingPatient) {
      patientId = existingPatient.id;
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

    // Build reason field - include [Doctor: Name] for calendar filtering
    const reason = `${service}${notes ? ` - ${notes}` : ""} [Doctor: ${doctorName.replace("Dr. ", "")}] [Online Booking]`;

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
        source: "manual",
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
    
    try {
      const patientEmailHtml = generatePatientConfirmationEmail(
        patientName,
        doctorName,
        appointmentDateObj,
        service,
        location || null
      );
      await sendEmail(
        email,
        `Appointment Confirmed - ${formatDate(appointmentDateObj)} at ${formatTime(appointmentDateObj)}`,
        patientEmailHtml
      );
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
