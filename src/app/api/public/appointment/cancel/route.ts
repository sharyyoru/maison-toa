import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { brandedEmail, LOGO_URL } from "@/utils/emailTemplate";

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

function generateCancellationEmail(
  lastName: string,
  gender: string | null,
  language: string
): string {
  const fr = language === "fr";
  const salutation = getSalutation(lastName, gender, language);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";

  const body = `
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #1a1a18;">${salutation}</p>
    <p style="margin: 0 0 12px 0; color: #4a4742;">
      ${fr ? "Votre rendez-vous a été annulé." : "Your appointment has been cancelled."}
    </p>
    <p style="margin: 0 0 24px 0; color: #4a4742;">
      ${fr
        ? "Nous restons à votre disposition pour convenir d'un nouveau créneau."
        : "We remain at your disposal to arrange a new appointment."
      }
    </p>
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 0 0 24px 0;">
      <tr>
        <td>
          <a href="${appUrl}/book-appointment"
             style="display: block; background-color: #1a1a18; color: #ffffff; text-decoration: none;
                    padding: 14px 24px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 500;">
            ${fr ? "Prendre un rendez-vous" : "Book an appointment"}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; color: #4a4742;">
      ${fr ? "Nous vous prions d'agréer nos salutations distinguées." : "Yours sincerely,"}
    </p>
    <p style="margin: 0 0 0 0; color: #1a1a18; font-weight: 500;">Maison Tóā</p>
    <img src="${LOGO_URL}" alt="Maison Tóā" width="80"
         style="display: block; width: 80px; height: auto; margin: 16px 0 0 0;">
  `;

  return brandedEmail(body);
}

export async function POST(request: Request) {
  try {
    const { id, language = "en" } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Missing appointment id" }, { status: 400 });
    }

    // Fetch appointment with patient info
    const { data: appt, error: apptError } = await supabase
      .from("appointments")
      .select("id, start_time, status, reason, location, patient_id, provider_id")
      .eq("id", id)
      .single();

    if (apptError || !appt) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    if (appt.status === "cancelled") {
      return NextResponse.json({ error: "Appointment is already cancelled" }, { status: 410 });
    }

    // Fetch patient info
    const { data: patient } = await supabase
      .from("patients")
      .select("first_name, last_name, email, gender")
      .eq("id", appt.patient_id)
      .single();

    // Cancel the appointment
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to cancel appointment" }, { status: 500 });
    }

    // Send cancellation email
    if (patient?.email) {
      try {
        const html = generateCancellationEmail(
          patient.last_name ?? "",
          patient.gender ?? null,
          language
        );
        const subject = language === "fr"
          ? "Annulation de votre rendez-vous"
          : "Appointment cancellation";
        await sendEmail(patient.email, subject, html);
      } catch (err) {
        console.error("Failed to send cancellation email:", err);
      }
    }

    return NextResponse.json({ ok: true, message: "Appointment cancelled" });
  } catch (err) {
    console.error("Cancel error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
