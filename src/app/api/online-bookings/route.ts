import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

function generateAdminRescheduleEmail(
  lastName: string,
  gender: string | null,
  newDate: Date,
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
    infoRow(fr ? "Heure" : "Time", newDate.toLocaleTimeString(fr ? "fr-FR" : "en-US", {
      hour: "2-digit", minute: "2-digit", hour12: !fr, timeZone: "Europe/Zurich",
    }));

  const body = `
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #1a1a18;">${salutation}</p>
    <p style="margin: 0 0 20px 0; color: #4a4742;">
      ${fr ? "Votre rendez-vous a été modifié comme suit." : "Your appointment has been updated as follows."}
    </p>
    ${infoTable(rows)}
    <p style="margin: 16px 0; color: #4a4742;">
      ${fr
        ? "Si nécessaire, vous pouvez le modifier à votre convenance."
        : "You may adjust it at your convenience if needed."
      }
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
      ${fr ? "Nous vous remercions pour votre compréhension." : "Yours sincerely,"}
    </p>
    <p style="margin: 0; color: #1a1a18; font-weight: 500;">Maison Tóā</p>
    <img src="${LOGO_URL}" alt="Maison Tóā" width="80"
         style="display: block; width: 80px; height: auto; margin: 16px 0 0 0;">
  `;

  return brandedEmail(body);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // optional filter
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = 50;

  let query = supabase
    .from("appointments")
    .select(
      `id, start_time, end_time, status, reason, location, created_at, provider_id,
       patient:patients(id, first_name, last_name, email, phone, source),
       provider:providers(id, name)`,
      { count: "exact" }
    )
    // Filter to only online bookings — either by source column (after migration)
    // or by the [Online Booking] marker in the reason (before migration back-fill)
    .or("source.eq.online_booking,reason.ilike.*[Online Booking]*")
    .order("start_time", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(
      `reason.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching online bookings:", error);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }

  return NextResponse.json({ bookings: data || [], total: count || 0 });
}

export async function PATCH(request: NextRequest) {
  const { id, status } = await request.json();

  if (!id || !status) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }

  const validStatuses = ["scheduled", "confirmed", "cancelled", "completed", "no_show"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("Error updating booking:", error);
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting booking:", error);
    return NextResponse.json({ error: "Failed to delete booking" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  const { id, start_time, end_time, language = "fr" } = await request.json();

  if (!id || !start_time) {
    return NextResponse.json({ error: "id and start_time are required" }, { status: 400 });
  }

  const updateData: { start_time: string; end_time?: string | null } = { start_time };
  if (end_time !== undefined) {
    updateData.end_time = end_time;
  }

  const { error } = await supabase
    .from("appointments")
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error("Error updating booking date/time:", error);
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }

  // Send notification email to patient (fire-and-forget — don't fail the response)
  try {
    const { data: appt } = await supabase
      .from("appointments")
      .select("patient_id")
      .eq("id", id)
      .single();

    if (appt?.patient_id) {
      const { data: patient } = await supabase
        .from("patients")
        .select("last_name, email, gender")
        .eq("id", appt.patient_id)
        .single();

      if (patient?.email) {
        const html = generateAdminRescheduleEmail(
          patient.last_name ?? "",
          patient.gender ?? null,
          new Date(start_time),
          language,
          id
        );
        const subject = language === "fr"
          ? "Modification de votre rendez-vous"
          : "Appointment update";
        await sendEmail(patient.email, subject, html);
        console.log(`✓ Admin reschedule email sent to ${patient.email}`);
      }
    }
  } catch (emailErr) {
    console.error("✗ Failed to send admin reschedule email:", emailErr);
  }

  return NextResponse.json({ ok: true });
}
