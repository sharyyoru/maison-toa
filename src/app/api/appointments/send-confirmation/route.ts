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

type SendConfirmationPayload = {
  appointmentId: string;
  patientEmail: string;
  patientFirstName: string;
  patientLastName: string;
  patientGender?: string;
  doctorName: string;
  appointmentDate: string;
  service: string;
  location?: string;
  language?: string;
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
    },
  };

  const texts = isFrench ? t.fr : t.en;

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendConfirmationPayload;

    const {
      appointmentId,
      patientEmail,
      patientFirstName,
      patientLastName,
      patientGender,
      doctorName,
      appointmentDate,
      service,
      location,
      language = "en",
    } = body;

    if (!patientEmail || !appointmentDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const appointmentDateObj = new Date(appointmentDate);
    const isFrench = language === "fr";

    const emailSubject = isFrench
      ? `Votre rendez-vous au sein de Maison Tóā`
      : `Your appointment at Maison Tóā`;

    const patientEmailHtml = generatePatientConfirmationEmail(
      patientLastName || patientFirstName || "Patient",
      patientGender,
      doctorName || "your practitioner",
      appointmentDateObj,
      service || "Consultation",
      location || null,
      language,
      appointmentId
    );

    await sendEmail(patientEmail, emailSubject, patientEmailHtml);
    console.log("✓ Branded confirmation email sent to:", patientEmail);

    // Store email record in database
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get patient ID from appointment if we have it
    let patientId: string | null = null;
    if (appointmentId) {
      const { data: appointment } = await supabase
        .from("appointments")
        .select("patient_id")
        .eq("id", appointmentId)
        .single();
      
      if (appointment) {
        patientId = appointment.patient_id;
      }
    }

    await supabase.from("emails").insert({
      patient_id: patientId,
      to_address: patientEmail,
      from_address: mailgunFromEmail || `no-reply@${mailgunDomain}`,
      subject: emailSubject,
      body: patientEmailHtml,
      direction: "outbound",
      status: "sent",
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      message: "Confirmation email sent successfully",
    });
  } catch (error) {
    console.error("Error sending confirmation email:", error);
    return NextResponse.json(
      { error: "Failed to send confirmation email", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
