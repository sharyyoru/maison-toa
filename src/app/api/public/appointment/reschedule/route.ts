import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseSwissDateTimeLocal, formatSwissDateWithWeekday, formatSwissTimeAmPm } from "@/lib/swissTimezone";
import { brandedEmail, infoRow, infoTable, LOGO_URL } from "@/utils/emailTemplate";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const mailgunApiKey = process.env.MAILGUN_API_KEY;
const mailgunDomain = process.env.MAILGUN_DOMAIN;
const mailgunFromEmail = process.env.MAILGUN_FROM_EMAIL;
const mailgunFromName = process.env.MAILGUN_FROM_NAME || "Maison Toa";
const mailgunApiBaseUrl = process.env.MAILGUN_API_BASE_URL || "https://api.mailgun.net";

async function sendEmail(to: string, subject: string, html: string) {
  if (!mailgunApiKey || !mailgunDomain) return;
  const fromAddress = mailgunFromEmail || `no-reply@${mailgunDomain}`;
  const formData = new FormData();
  formData.append("from", `${mailgunFromName} <${fromAddress}>`);
  formData.append("to", to);
  formData.append("subject", subject);
  formData.append("html", html);
  const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64");
  await fetch(`${mailgunApiBaseUrl}/v3/${mailgunDomain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body: formData,
  });
}

function getSalutation(lastName: string, gender: string | null, language: string): string {
  const fr = language === "fr";
  if (gender === "female") return fr ? `Chère Madame ${lastName}` : `Dear Ms. ${lastName}`;
  if (gender === "male") return fr ? `Cher Monsieur ${lastName}` : `Dear Mr. ${lastName}`;
  return fr ? "Madame, Monsieur," : "Dear Sir or Madam,";
}

function parseServiceFromReason(reason: string | null): string {
  if (!reason) return "";
  return reason
    .replace(/\s*\[Doctor:[^\]]*\]/gi, "")
    .replace(/\s*\[Online Booking\]/gi, "")
    .replace(/\s*\[Lang:[^\]]*\]/gi, "")
    .replace(/\s*-\s*$/, "")
    .trim();
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

export async function POST(request: Request) {
  try {
    const { id, newAppointmentDate } = await request.json();

    if (!id || !newAppointmentDate) {
      return NextResponse.json({ error: "Missing id or newAppointmentDate" }, { status: 400 });
    }

    // Fetch appointment
    const { data: appt, error: apptError } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, status, reason, location, patient_id, provider_id")
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
    const newStartDate = parseSwissDateTimeLocal(newAppointmentDate);
    const newEndDate = new Date(newStartDate.getTime() + 60 * 60 * 1000); // 1 hour

    // Update appointment times
    const { error: updateError } = await supabase
      .from("appointments")
      .update({
        start_time: newStartDate.toISOString(),
        end_time: newEndDate.toISOString(),
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

    let doctorName = "";
    if (appt.provider_id) {
      const { data: provider } = await supabase
        .from("providers")
        .select("name")
        .eq("id", appt.provider_id)
        .single();
      doctorName = provider?.name ?? "";
    }
    if (!doctorName && appt.reason) {
      const match = appt.reason.match(/\[Doctor:\s*(.+?)\s*\]/i);
      if (match) doctorName = match[1];
    }

    // Send reschedule confirmation email
    if (patient?.email) {
      try {
        const html = generateRescheduleEmail(
          patient.last_name ?? "",
          patient.gender ?? null,
          doctorName,
          newStartDate,
          parseServiceFromReason(appt.reason),
          language,
          id
        );
        const subject = language === "fr"
          ? "Ajustement de votre rendez-vous chez Maison Tóā"
          : "Your appointment at Maison Tóā has been adjusted";
        await sendEmail(patient.email, subject, html);
      } catch (err) {
        console.error("Failed to send reschedule email:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Appointment rescheduled",
      newDate: formatSwissDateWithWeekday(newStartDate),
      newTime: newStartDate.toLocaleTimeString("fr-FR", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Zurich",
      }),
    });
  } catch (err) {
    console.error("Reschedule error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
