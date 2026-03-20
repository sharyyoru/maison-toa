import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseSwissDateTimeLocal } from "@/lib/swissTimezone";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const mailgunApiKey = process.env.MAILGUN_API_KEY;
const mailgunDomain = process.env.MAILGUN_DOMAIN;
const mailgunFromEmail = process.env.MAILGUN_FROM_EMAIL;
const mailgunFromName = process.env.MAILGUN_FROM_NAME || "Clinic";
const mailgunApiBaseUrl = process.env.MAILGUN_API_BASE_URL || "https://api.mailgun.net";

type CreateAppointmentPayload = {
  patientId: string;
  dealId?: string | null;
  providerId?: string | null;
  title?: string;
  appointmentDate: string;
  durationMinutes?: number;
  location?: string;
  notes?: string;
  sendPatientEmail?: boolean;
  sendUserEmail?: boolean;
  scheduleReminder?: boolean;
  appointmentType?: "appointment" | "operation";
};

// Mailgun only allows scheduling emails up to 24 hours in advance
const MAILGUN_MAX_SCHEDULE_HOURS = 24;

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  scheduledFor?: Date | null
): Promise<{ sent: boolean; scheduled: boolean; reason?: string }> {
  if (!mailgunApiKey || !mailgunDomain) {
    console.log("Mailgun not configured, skipping email send");
    return { sent: false, scheduled: false, reason: "Mailgun not configured" };
  }

  const domain = mailgunDomain as string;
  const fromAddress = mailgunFromEmail || `no-reply@${domain}`;

  const formData = new FormData();
  formData.append("from", `${mailgunFromName} <${fromAddress}>`);
  formData.append("to", to);
  formData.append("subject", subject);
  formData.append("html", html);

  // Check if we can use Mailgun's scheduled delivery (must be within 24 hours)
  const now = Date.now();
  const maxScheduleTime = now + MAILGUN_MAX_SCHEDULE_HOURS * 60 * 60 * 1000;
  
  if (scheduledFor && scheduledFor.getTime() > now) {
    if (scheduledFor.getTime() <= maxScheduleTime) {
      // Within 24 hours - use Mailgun's scheduled delivery
      formData.append("o:deliverytime", scheduledFor.toUTCString());
    } else {
      // Beyond 24 hours - don't send now, will be handled by cron job from scheduled_emails table
      console.log(`Email scheduled for ${scheduledFor.toISOString()} is beyond Mailgun's 24-hour limit. Will be sent by cron job.`);
      return { sent: false, scheduled: true, reason: "Beyond 24-hour limit, stored for cron job" };
    }
  }

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
  
  return { sent: true, scheduled: !!scheduledFor };
}

function formatAppointmentDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function generatePatientEmailHtml(
  patientName: string,
  appointmentDate: Date,
  location: string | null,
  notes: string | null
): string {
  const formattedDate = formatAppointmentDate(appointmentDate);
  
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
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Dear ${patientName},</p>
    <p style="margin-bottom: 20px;">Your appointment has been scheduled. Here are the details:</p>
    
    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0 0 10px 0;"><strong>📅 Date & Time:</strong> ${formattedDate}</p>
      ${location ? `<p style="margin: 0 0 10px 0;"><strong>📍 Location:</strong> ${location}</p>` : ""}
      ${notes ? `<p style="margin: 0;"><strong>📝 Notes:</strong> ${notes}</p>` : ""}
    </div>
    
    <p style="margin-bottom: 20px;">If you need to reschedule or cancel, please contact us as soon as possible.</p>
    
    <p style="margin-bottom: 0;">Best regards,<br><strong>Your Clinic Team</strong></p>
  </div>
</body>
</html>`;
}

function generateUserEmailHtml(
  userName: string,
  patientName: string,
  patientEmail: string,
  appointmentDate: Date,
  location: string | null,
  notes: string | null
): string {
  const formattedDate = formatAppointmentDate(appointmentDate);
  
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
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">New Appointment Scheduled</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Via CRM Booking</p>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${userName},</p>
    <p style="margin-bottom: 20px;">A new appointment has been scheduled with one of your patients:</p>
    
    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0 0 10px 0;"><strong>👤 Patient:</strong> ${patientName}</p>
      <p style="margin: 0 0 10px 0;"><strong>📧 Email:</strong> ${patientEmail}</p>
      <p style="margin: 0 0 10px 0;"><strong>📅 Date & Time:</strong> ${formattedDate}</p>
      ${location ? `<p style="margin: 0 0 10px 0;"><strong>📍 Location:</strong> ${location}</p>` : ""}
      ${notes ? `<p style="margin: 0;"><strong>📝 Notes:</strong> ${notes}</p>` : ""}
    </div>
    
    <p style="margin-bottom: 0;">This appointment has been added to the patient's record in the CRM.</p>
  </div>
</body>
</html>`;
}

function generateReminderEmailHtml(
  recipientName: string,
  isPatient: boolean,
  patientName: string,
  appointmentDate: Date,
  location: string | null
): string {
  const formattedDate = formatAppointmentDate(appointmentDate);
  
  if (isPatient) {
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
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">⏰ Appointment Reminder</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Don't forget your upcoming appointment</p>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Dear ${recipientName},</p>
    <p style="margin-bottom: 20px;"><strong>This is a friendly reminder</strong> that you have an appointment scheduled for tomorrow:</p>
    
    <div style="background: #fffbeb; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
      <p style="margin: 0 0 10px 0;"><strong>📅 Date & Time:</strong> ${formattedDate}</p>
      ${location ? `<p style="margin: 0;"><strong>📍 Location:</strong> ${location}</p>` : ""}
    </div>
    
    <p style="margin-bottom: 20px;">If you need to reschedule, please contact us as soon as possible.</p>
    
    <p style="margin-bottom: 0;">We look forward to seeing you!<br><strong>Your Clinic Team</strong></p>
  </div>
</body>
</html>`;
  }
  
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
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">⏰ Appointment Reminder</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Tomorrow's patient appointment</p>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${recipientName},</p>
    <p style="margin-bottom: 20px;"><strong>Reminder:</strong> You have an appointment scheduled for tomorrow with a patient:</p>
    
    <div style="background: #fffbeb; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
      <p style="margin: 0 0 10px 0;"><strong>👤 Patient:</strong> ${patientName}</p>
      <p style="margin: 0 0 10px 0;"><strong>📅 Date & Time:</strong> ${formattedDate}</p>
      ${location ? `<p style="margin: 0;"><strong>📍 Location:</strong> ${location}</p>` : ""}
    </div>
  </div>
</body>
</html>`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateAppointmentPayload;

    const {
      patientId,
      dealId,
      providerId,
      title,
      appointmentDate,
      durationMinutes = 60,
      location,
      notes,
      sendPatientEmail = true,
      sendUserEmail = true,
      scheduleReminder = true,
      appointmentType = "appointment",
    } = body;

    if (!patientId || !appointmentDate) {
      return NextResponse.json(
        { error: "Missing required fields: patientId, appointmentDate" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get patient details
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, first_name, last_name, email")
      .eq("id", patientId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: "Patient not found" },
        { status: 404 }
      );
    }

    const patientName = [patient.first_name, patient.last_name]
      .filter(Boolean)
      .join(" ") || "Patient";
    const patientEmail = patient.email;

    // Get service name from deal if dealId provided
    let serviceName: string | null = null;
    if (dealId) {
      const { data: dealData } = await supabase
        .from("deals")
        .select("service_id, service:services(name)")
        .eq("id", dealId)
        .single();
      
      if (dealData?.service && Array.isArray(dealData.service) && dealData.service[0]?.name) {
        serviceName = dealData.service[0].name;
      } else if (dealData?.service && typeof dealData.service === 'object' && 'name' in dealData.service) {
        serviceName = (dealData.service as { name: string }).name;
      }
    }

    // Get user details if providerId (userId) provided
    let assignedUserName = "Staff Member";
    let assignedUserEmail: string | null = null;

    if (providerId) {
      // providerId is actually a user ID from the platform users
      const { data: userData } = await supabase.auth.admin.getUserById(providerId);
      if (userData?.user) {
        const meta = userData.user.user_metadata || {};
        assignedUserName = meta.full_name || 
                          [meta.first_name, meta.last_name].filter(Boolean).join(" ") || 
                          userData.user.email?.split("@")[0] || "Staff Member";
        assignedUserEmail = userData.user.email || null;
      }
    }

    // Parse the datetime-local string as Swiss timezone to ensure correct UTC time
    // This fixes the 1-hour offset issue when server runs in UTC
    const appointmentDateObj = parseSwissDateTimeLocal(appointmentDate);

    // Calculate end time from duration
    const endDateObj = new Date(appointmentDateObj.getTime() + durationMinutes * 60 * 1000);

    // Build reason field with patient name and service
    let reason = patientName;
    if (serviceName) {
      reason += ` - ${serviceName}`;
    }
    if (assignedUserName && assignedUserName !== "Staff Member") {
      reason += ` [Doctor: ${assignedUserName}]`;
    }
    // Add category for operation type appointments
    if (appointmentType === "operation") {
      reason += ` [Category: OP Surgery]`;
    }

    // Create the appointment using the existing schema
    // Note: provider_id has a foreign key to providers table, so we leave it null
    // when assigning to a platform user (staff info is stored in the reason field)
    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .insert({
        patient_id: patientId,
        provider_id: null,
        start_time: appointmentDateObj.toISOString(),
        end_time: endDateObj.toISOString(),
        reason,
        title: title || null,
        notes: notes || null,
        location: location || null,
        status: "scheduled",
        source: "manual",
      })
      .select("id")
      .single();

    if (appointmentError || !appointment) {
      console.error("Error creating appointment:", appointmentError);
      return NextResponse.json(
        { error: "Failed to create appointment", details: appointmentError?.message },
        { status: 500 }
      );
    }

    const appointmentId = appointment.id;

    // Send confirmation emails in parallel (non-blocking for faster response)
    const confirmationEmailPromises: Promise<void>[] = [];

    // Send confirmation email to patient
    if (sendPatientEmail && patientEmail) {
      confirmationEmailPromises.push((async () => {
        try {
          const patientEmailHtml = generatePatientEmailHtml(
            patientName,
            appointmentDateObj,
            location || null,
            notes || null
          );
          await sendEmail(
            patientEmail,
            `Appointment Confirmed - ${formatAppointmentDate(appointmentDateObj)}`,
            patientEmailHtml
          );
          console.log("Patient confirmation email sent to:", patientEmail);
        } catch (err) {
          console.error("Error sending patient email:", err);
        }
      })());
    }

    // Send notification email to provider/staff
    if (sendUserEmail && assignedUserEmail) {
      confirmationEmailPromises.push((async () => {
        try {
          const userEmailHtml = generateUserEmailHtml(
            assignedUserName,
            patientName,
            patientEmail || "Not provided",
            appointmentDateObj,
            location || null,
            notes || null
          );
          await sendEmail(
            assignedUserEmail,
            `New Appointment: ${patientName} - ${formatAppointmentDate(appointmentDateObj)}`,
            userEmailHtml
          );
          console.log("Provider notification email sent to:", assignedUserEmail);
        } catch (err) {
          console.error("Error sending provider email:", err);
        }
      })());
    }

    // Wait for confirmation emails (these are important, so we wait)
    // But they run in parallel, so it's faster than sequential
    await Promise.allSettled(confirmationEmailPromises);

    // Schedule reminder emails for 1 day before (non-blocking)
    if (scheduleReminder) {
      const reminderDate = new Date(appointmentDateObj);
      reminderDate.setDate(reminderDate.getDate() - 1);

      // Only schedule if reminder date is in the future
      if (reminderDate.getTime() > Date.now()) {
        // Run reminder scheduling in background (don't await to prevent blocking)
        const scheduleReminders = async () => {
          const reminderPromises: Promise<void>[] = [];

          // Schedule patient reminder
          if (patientEmail) {
            reminderPromises.push((async () => {
              try {
                const patientReminderHtml = generateReminderEmailHtml(
                  patientName,
                  true,
                  patientName,
                  appointmentDateObj,
                  location || null
                );

                // Always store in scheduled_emails table for cron job backup
                await supabase.from("scheduled_emails").insert({
                  patient_id: patientId,
                  appointment_id: appointmentId,
                  recipient_type: "patient",
                  recipient_email: patientEmail,
                  subject: `Reminder: Appointment Tomorrow - ${formatAppointmentDate(appointmentDateObj)}`,
                  body: patientReminderHtml,
                  scheduled_for: reminderDate.toISOString(),
                  status: "pending",
                });

                // Try to send via Mailgun (will skip if beyond 24-hour limit)
                const result = await sendEmail(
                  patientEmail,
                  `Reminder: Appointment Tomorrow - ${formatAppointmentDate(appointmentDateObj)}`,
                  patientReminderHtml,
                  reminderDate
                );
                
                // If Mailgun sent/scheduled it, mark as sent in DB
                if (result.sent) {
                  await supabase.from("scheduled_emails")
                    .update({ status: "sent" })
                    .eq("appointment_id", appointmentId)
                    .eq("recipient_type", "patient");
                }
                
                console.log("Patient reminder scheduled for:", reminderDate.toISOString(), result);
              } catch (err) {
                console.error("Error scheduling patient reminder:", err);
                // Don't throw - this is a non-critical operation
              }
            })());
          }

          // Schedule provider reminder
          if (assignedUserEmail) {
            reminderPromises.push((async () => {
              try {
                const providerReminderHtml = generateReminderEmailHtml(
                  assignedUserName,
                  false,
                  patientName,
                  appointmentDateObj,
                  location || null
                );

                // Always store in scheduled_emails table for cron job backup
                await supabase.from("scheduled_emails").insert({
                  patient_id: patientId,
                  appointment_id: appointmentId,
                  recipient_type: "provider",
                  recipient_email: assignedUserEmail,
                  subject: `Reminder: Appointment with ${patientName} Tomorrow`,
                  body: providerReminderHtml,
                  scheduled_for: reminderDate.toISOString(),
                  status: "pending",
                });

                // Try to send via Mailgun (will skip if beyond 24-hour limit)
                const result = await sendEmail(
                  assignedUserEmail,
                  `Reminder: Appointment with ${patientName} Tomorrow`,
                  providerReminderHtml,
                  reminderDate
                );
                
                // If Mailgun sent/scheduled it, mark as sent in DB
                if (result.sent) {
                  await supabase.from("scheduled_emails")
                    .update({ status: "sent" })
                    .eq("appointment_id", appointmentId)
                    .eq("recipient_type", "provider");
                }
                
                console.log("Provider reminder scheduled for:", reminderDate.toISOString(), result);
              } catch (err) {
                console.error("Error scheduling provider reminder:", err);
                // Don't throw - this is a non-critical operation
              }
            })());
          }

          // Run all reminder scheduling in parallel
          await Promise.allSettled(reminderPromises);
        };

        // Fire and forget - don't block the response
        scheduleReminders().catch(err => {
          console.error("Error in reminder scheduling:", err);
        });
      }
    }

    return NextResponse.json({
      ok: true,
      appointmentId,
      message: "Appointment created successfully",
      emailsSent: {
        patient: sendPatientEmail && !!patientEmail,
        provider: sendUserEmail && !!assignedUserEmail,
      },
      reminderScheduled: scheduleReminder,
    });
  } catch (error) {
    console.error("Error creating appointment:", error);
    return NextResponse.json(
      { error: "Failed to create appointment", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
