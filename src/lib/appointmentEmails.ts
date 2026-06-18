import { formatSwissDateWithWeekday, formatSwissTimeAmPm } from "@/lib/swissTimezone";
import { brandedEmail, infoRow, infoTable, LOGO_URL } from "@/utils/emailTemplate";

export function formatAppointmentDate(date: Date, language = "en"): string {
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

export function formatAppointmentTime(date: Date, language = "en"): string {
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

export function getSalutation(
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

export function generatePatientConfirmationEmail(
  lastName: string,
  gender: string | undefined,
  doctorName: string,
  appointmentDate: Date,
  service: string,
  location: string | null,
  language: string,
  appointmentId?: string,
  formUrl?: string
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
      clinicAddress: "Voie du Chariot 6<br>1003 Lausanne",
      prepareVisit: "To prepare your visit in the best conditions, please confirm your attendance and complete your patient information form prior to your appointment via the link below.",
      confirmAndComplete: "Confirm my appointment & complete my file",
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
      prepareVisit: "Afin de préparer votre venue dans les meilleures conditions, nous vous invitons à confirmer votre présence et à compléter votre fiche patient avant votre rendez-vous via le lien ci-dessous.",
      confirmAndComplete: "Confirmer ma présence & compléter ma fiche patient",
    },
  };

  const texts = isFrench ? t.fr : t.en;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";
  const manageUrl = appointmentId
    ? `${appUrl}/appointments/manage?id=${appointmentId}`
    : `${appUrl}/book-appointment`;

  const rows =
    infoRow(texts.practitioner, doctorName) +
    infoRow(texts.date, formatAppointmentDate(appointmentDate, language)) +
    infoRow(texts.time, formatAppointmentTime(appointmentDate, language)) +
    infoRow(texts.treatment, service) +
    (location ? infoRow(isFrench ? "Lieu" : "Location", location) : "");

  const body = `
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #1a1a18;">${salutation}</p>
    <p style="margin: 0 0 20px 0; color: #4a4742;">${texts.confirmed}</p>
    <p style="margin: 0 0 8px 0; color: #8a8578; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase;">${texts.yourAppointment}</p>
    ${infoTable(rows)}
    ${formUrl ? `
    <p style="margin: 24px 0 16px 0; color: #4a4742;">${texts.prepareVisit}</p>
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 0 0 24px 0;">
      <tr>
        <td>
          <a href="${formUrl}" style="display: block; background-color: #0ea5e9; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 600;">${texts.confirmAndComplete}</a>
        </td>
      </tr>
    </table>
    ` : ''}
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

export function generateDoctorNotificationEmail(
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
    infoRow("Date", formatAppointmentDate(appointmentDate)) +
    infoRow("Time", formatAppointmentTime(appointmentDate)) +
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

export function generatePatientReminderEmail(
  lastName: string,
  gender: string | undefined,
  appointmentDate: Date,
  service: string,
  language: string,
  appointmentId: string
): string {
  const isFrench = language === "fr";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";
  const manageUrl = `${appUrl}/appointments/manage?id=${appointmentId}`;
  const salutation = isFrench
    ? gender === "female"
      ? `Ch&egrave;re Madame ${lastName}`
      : gender === "male"
        ? `Cher Monsieur ${lastName}`
        : "Madame, Monsieur,"
    : gender === "female"
      ? `Dear Madam ${lastName}`
      : gender === "male"
        ? `Dear Sir ${lastName}`
        : "Dear Sir or Madam,";

  const rows = isFrench
    ? infoRow("Date", formatAppointmentDate(appointmentDate, language)) +
      infoRow("Heure", formatAppointmentTime(appointmentDate, language)) +
      infoRow("Soin", service)
    : infoRow("Date", formatAppointmentDate(appointmentDate, language)) +
      infoRow("Time", formatAppointmentTime(appointmentDate, language)) +
      infoRow("Treatment", service);

  const body = isFrench
    ? `
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #1a1a18;">${salutation}</p>
    <p style="margin: 0 0 8px 0; color: #4a4742;">Nous souhaitions vous rappeler votre prochain rendez-vous au sein de Maison T&oacute;&#257;.</p>
    ${infoTable(rows)}
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 24px 0;">
      <tr>
        <td style="padding: 0 8px 8px 0;">
          <a href="${manageUrl}&action=reschedule" style="display: block; background-color: #1a1a18; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 500;">Modifier mon rendez-vous</a>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 8px 0 0;">
          <a href="${manageUrl}&action=cancel" style="display: block; background-color: #f5f3ef; color: #1a1a18; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 500; border: 1px solid #e8e3db;">Annuler mon rendez-vous</a>
        </td>
      </tr>
    </table>
    <p style="margin: 24px 0 0 0; color: #4a4742;">Dans l&rsquo;attente du plaisir de vous accueillir,</p>
    <p style="margin: 8px 0 0 0; color: #1a1a18; font-weight: 500;">Maison T&oacute;&#257;</p>
    <img src="${LOGO_URL}" alt="Maison T&oacute;&#257;" width="80" style="display: block; width: 80px; height: auto; margin: 16px 0 0 0;">
  `
    : `
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #1a1a18;">${salutation}</p>
    <p style="margin: 0 0 8px 0; color: #4a4742;">This is a reminder of your upcoming appointment at Maison T&oacute;&#257;.</p>
    ${infoTable(rows)}
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 24px 0;">
      <tr>
        <td style="padding: 0 8px 8px 0;">
          <a href="${manageUrl}&action=reschedule" style="display: block; background-color: #1a1a18; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 500;">Reschedule my appointment</a>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 8px 0 0;">
          <a href="${manageUrl}&action=cancel" style="display: block; background-color: #f5f3ef; color: #1a1a18; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; font-size: 14px; font-weight: 500; border: 1px solid #e8e3db;">Cancel my appointment</a>
        </td>
      </tr>
    </table>
    <p style="margin: 24px 0 0 0; color: #4a4742;">We look forward to welcoming you.</p>
    <p style="margin: 8px 0 0 0; color: #1a1a18; font-weight: 500;">Maison T&oacute;&#257;</p>
    <img src="${LOGO_URL}" alt="Maison T&oacute;&#257;" width="80" style="display: block; width: 80px; height: auto; margin: 16px 0 0 0;">
  `;

  return brandedEmail(body);
}
