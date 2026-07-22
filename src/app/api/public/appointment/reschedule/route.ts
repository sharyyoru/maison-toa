import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatSwissDateWithWeekday, formatSwissTimeAmPm, formatSwissYmd, getSwissSlotString, parseSwissDateTimeLocal } from "@/lib/swissTimezone";
import { brandedEmail, infoRow, infoTable, LOGO_URL } from "@/utils/emailTemplate";
import { sendEmail as sendEmailViaResend, isEmailConfigured } from "@/lib/email";
import { cleanAppointmentReason } from "@/lib/appointmentUtils";
import { nameToSlug } from "@/lib/doctorAvailability";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PATIENT_SELF_SERVICE_CC_EMAIL = "info@maisontoa.com";
const ADMIN_NOTIFICATION_EMAIL = "louise.goerig@maisontoa.com.";

async function sendEmail(to: string, subject: string, html: string, cc?: string) {
  if (!isEmailConfigured()) return;
  
  const result = await sendEmailViaResend({ to, subject, html, cc });
  if (!result.success) {
    console.error("Error sending email via Resend:", result.error);
  }
}

function getSalutation(lastName: string, gender: string | null, language: string): string {
  const fr = language === "fr";
  if (gender === "female") return fr ? `Chère Madame ${lastName}` : `Dear Ms. ${lastName}`;
  if (gender === "male") return fr ? `Cher Monsieur ${lastName}` : `Dear Mr. ${lastName}`;
  return fr ? "Madame, Monsieur," : "Dear Sir or Madam,";
}

function generateRescheduleEmail(
  lastName: string,
  gender: string | null,
  doctorName: string,
  newDate: Date,
  service: string,
  language: string,
  appointmentId: string
): string {
  const fr = language === "fr";
  const salutation = getSalutation(lastName, gender, language);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";
  const rescheduleUrl = `${appUrl}/appointments/manage?id=${appointmentId}&action=reschedule`;

  const rows =
    infoRow("Date", newDate.toLocaleDateString(fr ? "fr-FR" : "en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Zurich",
    })) +
    infoRow(fr ? "Heure" : "Time", fr
      ? newDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Zurich" })
      : formatSwissTimeAmPm(newDate)
    ) +
    infoRow(fr ? "Soin" : "Treatment", service) +
    infoRow(fr ? "Praticien" : "Practitioner", doctorName);

  const body = `
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #1a1a18;">${salutation}</p>
    <p style="margin: 0 0 20px 0; color: #4a4742;">
      ${fr ? "Votre rendez-vous a été ajusté comme suit." : "Your appointment has been adjusted as follows."}
    </p>
    ${infoTable(rows)}
    <p style="margin: 16px 0; color: #4a4742;">
      ${fr ? "Nous nous réjouissons de vous accueillir." : "We look forward to welcoming you."}
    </p>
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 24px 0;">
      <tr>
        <td>
          <a href="${rescheduleUrl}"
             style="display: block; background-color: #1a1a18; color: #ffffff; text-decoration: none;
                    padding: 14px 24px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 500;">
            ${fr ? "Modifier mon rendez-vous" : "Reschedule my appointment"}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; color: #4a4742;">
      ${fr ? "Veuillez agréer nos salutations distinguées." : "Yours sincerely,"}
    </p>
    <p style="margin: 0 0 0 0; color: #1a1a18; font-weight: 500;">Maison Tóā</p>
    <img src="${LOGO_URL}" alt="Maison Tóā" width="80"
         style="display: block; width: 80px; height: auto; margin: 16px 0 0 0;">
  `;

  return brandedEmail(body);
}

function parseLangFromReason(reason: string | null): string {
  if (!reason) return "fr";
  const match = reason.match(/\[Lang:\s*(fr|en)\s*\]/i);
  return match ? match[1].toLowerCase() : "fr";
}

function getDoctorNameFromReason(reason: string | null): string {
  if (!reason) return "";
  const match = reason.match(/\[Doctor:\s*(.+?)\s*\]/i);
  return match ? match[1].trim() : "";
}

export async function POST(request: Request) {
  try {
    const { id, newAppointmentDate } = await request.json();

    if (!id || !newAppointmentDate) {
      return NextResponse.json({ error: "Missing id or newAppointmentDate" }, { status: 400 });
    }

    // Fetch appointment
    const { data: appt, error: apptError } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, status, reason, location, patient_id, provider_id, tracking_params")
      .eq("id", id)
      .single();

    if (apptError || !appt) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    if (appt.status === "cancelled") {
      return NextResponse.json({ error: "Cannot reschedule a cancelled appointment" }, { status: 410 });
    }

    const language = parseLangFromReason(appt.reason ?? null);

    // Parse new date (ISO string from Swiss local time)
    const newPatientStartDate = parseSwissDateTimeLocal(newAppointmentDate);
    const trackingParams = (appt.tracking_params || {}) as Record<string, string>;
    const currentPatientStart = trackingParams.patient_appointment_start
      ? new Date(trackingParams.patient_appointment_start)
      : new Date(appt.start_time);
    const doctorOffsetMs = new Date(appt.start_time).getTime() - currentPatientStart.getTime();
    const newStartDate = new Date(newPatientStartDate.getTime() + doctorOffsetMs);
    const originalDurationMs = Math.max(
      60_000,
      new Date(appt.end_time).getTime() - new Date(appt.start_time).getTime(),
    );
    const newEndDate = new Date(newStartDate.getTime() + originalDurationMs);

    let doctorName = "";
    if (appt.provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("name")
        .eq("id", appt.provider_id)
        .single();
      doctorName = provider?.name ?? "";
    }
    if (!doctorName) {
      doctorName = getDoctorNameFromReason(appt.reason);
    }

    const doctorSlug = doctorName ? nameToSlug(doctorName) : "";
    const requestedDate = formatSwissYmd(newStartDate);
    const requestedTime = getSwissSlotString(newStartDate);

    if (!doctorSlug || !requestedDate || !requestedTime) {
      return NextResponse.json({ error: "Unable to verify doctor availability" }, { status: 400 });
    }

    const slotsUrl = new URL("/api/public/appointment/slots", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
    slotsUrl.searchParams.set("doctorSlug", doctorSlug);
    slotsUrl.searchParams.set("date", requestedDate);
    slotsUrl.searchParams.set("excludeId", id);
    const slotsRes = await fetch(slotsUrl);
    const slotsData = await slotsRes.json();
    const availableSlots: string[] = Array.isArray(slotsData.availableSlots) ? slotsData.availableSlots : [];

    if (!slotsRes.ok || !availableSlots.includes(requestedTime)) {
      return NextResponse.json(
        { error: "This time slot is no longer available. Please choose another time." },
        { status: 409 }
      );
    }


    const { data: linkedAppointment, error: linkedAppointmentError } = await supabase
      .from("appointments")
      .select("id, provider_id, start_time, end_time")
      .eq("linked_parent_appointment_id", id)
      .maybeSingle();
    if (linkedAppointmentError) {
      console.error("Failed to load mirrored appointment:", linkedAppointmentError);
      return NextResponse.json({ error: "Failed to verify the additional calendar." }, { status: 500 });
    }
    if (linkedAppointment?.provider_id) {
      const linkedDurationMs = Math.max(
        60_000,
        new Date(linkedAppointment.end_time).getTime() - new Date(linkedAppointment.start_time).getTime(),
      );
      const bookingDeltaMs = newPatientStartDate.getTime() - currentPatientStart.getTime();
      const linkedStart = new Date(new Date(linkedAppointment.start_time).getTime() + bookingDeltaMs);
      const linkedEnd = new Date(linkedStart.getTime() + linkedDurationMs);
      const { data: linkedConflicts, error: linkedConflictError } = await supabase
        .from("appointments")
        .select("id")
        .eq("provider_id", linkedAppointment.provider_id)
        .neq("id", linkedAppointment.id)
        .lt("start_time", linkedEnd.toISOString())
        .gt("end_time", linkedStart.toISOString())
        .not("status", "in", "(cancelled,no_show)")
        .limit(1);
      if (linkedConflictError) {
        console.error("Failed to verify mirrored calendar:", linkedConflictError);
        return NextResponse.json({ error: "Failed to verify the additional calendar." }, { status: 500 });
      }
      if (linkedConflicts && linkedConflicts.length > 0) {
        return NextResponse.json(
          { error: "The additional calendar is no longer available. Please choose another time." },
          { status: 409 },
        );
      }
    }

    // Update appointment times
    const { error: updateError } = await supabase
      .from("appointments")
      .update({
        start_time: newStartDate.toISOString(),
        end_time: newEndDate.toISOString(),
        tracking_params: {
          ...trackingParams,
          patient_appointment_start: newPatientStartDate.toISOString(),
        },
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to reschedule appointment" }, { status: 500 });
    }

    // Fetch patient and doctor info for email
    const { data: patient } = await supabase
      .from("patients")
      .select("first_name, last_name, email, gender")
      .eq("id", appt.patient_id)
      .single();

    // Send reschedule confirmation email
    if (patient?.email) {
      try {
        const html = generateRescheduleEmail(
          patient.last_name ?? "",
          patient.gender ?? null,
          doctorName,
          newPatientStartDate,
          cleanAppointmentReason(appt.reason),
          language,
          id
        );
        const subject = language === "fr"
          ? "Ajustement de votre rendez-vous chez Maison Tóā"
          : "Your appointment at Maison Tóā has been adjusted";
        await sendEmail(patient.email, subject, html, PATIENT_SELF_SERVICE_CC_EMAIL);
      } catch (err) {
        console.error("Failed to send reschedule email:", err);
      }
    }

    // Notify admin
    try {
      const patientName = patient
        ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim()
        : "Unknown patient";
      const service = cleanAppointmentReason(appt.reason) || "-";
      const newDateStr = newPatientStartDate.toLocaleString("en-GB", {
        timeZone: "Europe/Zurich", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      await sendEmail(
        ADMIN_NOTIFICATION_EMAIL,
        `[Reschedule] ${patientName} – ${service}`,
        `<p>A patient has <strong>rescheduled</strong> their appointment.</p>
         <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
           <tr><td><b>Patient:</b></td><td>${patientName}</td></tr>
           <tr><td><b>Service:</b></td><td>${service}</td></tr>
           <tr><td><b>Practitioner:</b></td><td>${doctorName || "-"}</td></tr>
           <tr><td><b>New Date:</b></td><td>${newDateStr}</td></tr>
           <tr><td><b>Location:</b></td><td>${appt.location ?? "-"}</td></tr>
         </table>`
      );
    } catch (err) {
      console.error("Failed to send admin reschedule notification:", err);
    }

    return NextResponse.json({
      ok: true,
      message: "Appointment rescheduled",
      newDate: formatSwissDateWithWeekday(newPatientStartDate),
      newTime: newPatientStartDate.toLocaleTimeString("fr-FR", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Zurich",
      }),
    });
  } catch (err) {
    console.error("Reschedule error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
