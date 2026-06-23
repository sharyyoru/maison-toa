import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail as sendEmailViaResend, isEmailConfigured } from "@/lib/email";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  generatePatientConfirmationEmail,
  generateDoctorNotificationEmail,
  generatePatientReminderEmail,
} from "@/lib/appointmentEmails";

export const runtime = "nodejs";

const emailFromAddress = process.env.EMAIL_FROM_ADDRESS || "info@mail.maisontoa.com";
const emailFromName = process.env.EMAIL_FROM_NAME || "Maison Toa";

type AppointmentCreatedPayload = {
  appointmentId: string;
  patientId?: string | null;
  language?: string;
  formUrl?: string;
  patient?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    gender?: string | null;
  };
  appointment?: {
    date?: string | null;
    service?: string | null;
    doctorName?: string | null;
    doctorEmail?: string | null;
    location?: string | null;
  };
};

function resolvePath(object: unknown, path: string): unknown {
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
  return parts.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    if (!(key in (current as Record<string, unknown>))) return undefined;
    return (current as Record<string, unknown>)[key];
  }, object);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#123;/g, "{")
    .replace(/&#125;/g, "}")
    .replace(/&lbrace;/g, "{")
    .replace(/&rbrace;/g, "}")
    .replace(/&#x7b;/gi, "{")
    .replace(/&#x7d;/gi, "}");
}

function renderTemplate(template: string, context: unknown): string {
  if (!template) return "";
  const decoded = decodeHtmlEntities(template);
  return decoded.replace(/{{\s*([^}]+?)\s*}}/g, (_match, rawPath) => {
    const value = resolvePath(context, String(rawPath));
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\r?\n/g)
    .map((line) => (line.length === 0 ? "<br />" : line))
    .join("<br />");
}

function sanitizeTelLinks(html: string): string {
  let result = html.replace(/href\s*=\s*(["'])tel%3A/gi, "href=$1tel:");
  result = result.replace(/href\s*=\s*(["'])tel:%2B/gi, "href=$1tel:+");
  result = result.replace(
    /href\s*=\s*["']tel:([^"']+)["']/gi,
    (_match, phoneNumber) => {
      let decoded = phoneNumber;
      try {
        decoded = decodeURIComponent(phoneNumber);
      } catch {
        // keep original
      }
      decoded = decoded
        .replace(/&nbsp;/gi, "")
        .replace(/&#160;/g, "")
        .replace(/&amp;/gi, "&")
        .replace(/&plus;/gi, "+")
        .replace(/\u00A0/g, "");
      const cleaned = decoded.replace(/[^0-9+]/g, "");
      return `href="tel:${cleaned}"`;
    },
  );
  return result;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AppointmentCreatedPayload>;

    const appointmentId = body.appointmentId?.trim();
    if (!appointmentId) {
      return NextResponse.json(
        { error: "Missing required field: appointmentId" },
        { status: 400 },
      );
    }

    // Resolve patient + appointment context. Prefer the payload (so emails are
    // identical to the booking flow), falling back to the database when needed.
    let patientId = body.patientId?.trim() || null;
    const language = body.language === "fr" ? "fr" : "en";

    let firstName = body.patient?.first_name || "";
    let lastName = body.patient?.last_name || "";
    let patientEmail = body.patient?.email || null;
    let patientPhone = body.patient?.phone || null;
    let patientGender = body.patient?.gender || undefined;

    let appointmentDateIso = body.appointment?.date || null;
    let service = body.appointment?.service || "";
    let doctorName = body.appointment?.doctorName || "";
    let doctorEmail = body.appointment?.doctorEmail || null;
    let location = body.appointment?.location || null;

    // Fill any missing context from the appointment + patient records.
    if (!appointmentDateIso || !patientId || !patientEmail) {
      const { data: appt } = await supabaseAdmin
        .from("appointments")
        .select("id, patient_id, start_time, reason, location")
        .eq("id", appointmentId)
        .maybeSingle();

      if (appt) {
        patientId = patientId || (appt as any).patient_id || null;
        appointmentDateIso = appointmentDateIso || (appt as any).start_time || null;
        location = location || (appt as any).location || null;
        if (!service) service = (appt as any).reason || "";
      }

      if (patientId && (!patientEmail || !firstName)) {
        const { data: pat } = await supabaseAdmin
          .from("patients")
          .select("first_name, last_name, email, phone")
          .eq("id", patientId)
          .maybeSingle();
        if (pat) {
          firstName = firstName || (pat as any).first_name || "";
          lastName = lastName || (pat as any).last_name || "";
          patientEmail = patientEmail || (pat as any).email || null;
          patientPhone = patientPhone || (pat as any).phone || null;
        }
      }
    }

    const appointmentDate = appointmentDateIso ? new Date(appointmentDateIso) : null;
    const patientName = `${firstName} ${lastName}`.trim();
    const formUrl = body.formUrl;

    // Load active appointment_created workflows.
    const { data: workflows, error: workflowsError } = await supabaseAdmin
      .from("workflows")
      .select("id, name, trigger_type, active, config")
      .eq("trigger_type", "appointment_created")
      .eq("active", true);

    if (workflowsError) {
      console.error("Failed to load appointment_created workflows", workflowsError);
      return NextResponse.json({ error: "Failed to load workflows" }, { status: 500 });
    }

    if (!workflows || workflows.length === 0) {
      return NextResponse.json({ ok: true, workflowsRun: 0, actionsRun: 0 });
    }

    const templateContext = {
      patient: {
        id: patientId,
        first_name: firstName,
        last_name: lastName,
        email: patientEmail,
        phone: patientPhone,
        gender: patientGender,
      },
      appointment: {
        id: appointmentId,
        date: appointmentDate ? formatAppointmentDate(appointmentDate, language) : "",
        time: appointmentDate ? formatAppointmentTime(appointmentDate, language) : "",
        service,
        provider: doctorName,
        doctor: doctorName,
        location,
      },
    };

    // Minimal condition evaluator (passes when no condition nodes exist).
    function evaluateConditions(workflowConfig: { nodes?: any[] }): boolean {
      if (!workflowConfig?.nodes) return true;
      const conditionNodes = workflowConfig.nodes.filter((n: any) => n.type === "condition");
      if (conditionNodes.length === 0) return true;

      for (const conditionNode of conditionNodes) {
        const data = conditionNode.data || {};
        const operator = data.operator;
        const value = (data.value || "").toLowerCase();

        let fieldValue = "";
        if (data.field === "patient.email") fieldValue = (patientEmail || "").toLowerCase();
        else if (data.field === "patient.phone") fieldValue = (patientPhone || "").toLowerCase();
        else if (data.field === "appointment.type") fieldValue = (service || "").toLowerCase();
        else if (data.field === "appointment.provider") fieldValue = (doctorName || "").toLowerCase();
        else continue; // unsupported field: ignore

        if (operator === "equals" && fieldValue !== value) return false;
        if (operator === "not_equals" && fieldValue === value) return false;
        if (operator === "contains" && !fieldValue.includes(value)) return false;
        if (operator === "is_empty" && fieldValue !== "") return false;
        if (operator === "is_not_empty" && fieldValue === "") return false;
      }
      return true;
    }

    const matchingWorkflows = (workflows as any[]).filter((w) =>
      evaluateConditions((w.config || {}) as { nodes?: any[] }),
    );

    if (matchingWorkflows.length === 0) {
      return NextResponse.json({ ok: true, workflowsRun: 0, actionsRun: 0 });
    }

    let actionsRun = 0;

    for (const workflow of matchingWorkflows) {
      const { data: enrollment } = await supabaseAdmin
        .from("workflow_enrollments")
        .insert({
          workflow_id: workflow.id,
          patient_id: patientId,
          status: "active",
          trigger_data: {
            trigger_type: "appointment_created",
            appointment_id: appointmentId,
            appointment_date: appointmentDateIso,
            patient: templateContext.patient,
          },
        })
        .select("id")
        .single();

      const enrollmentId = enrollment?.id;

      const workflowConfig = workflow.config as { nodes?: any[] } | null;
      if (!workflowConfig?.nodes || !Array.isArray(workflowConfig.nodes)) continue;

      const steps = workflowConfig.nodes
        .filter((node: any) => node.type === "action" || node.type === "delay")
        .map((node: any) => ({
          step_type: node.type as "action" | "delay",
          action_type: node.type === "delay" ? "delay" : node.data?.actionType || "",
          config: node.type === "delay" ? node.data || {} : node.data?.config || {},
        }));

      let cumulativeDelayMinutes = 0;

      for (const step of steps) {
        if (step.step_type === "delay") {
          const delayConfig = step.config as { delayType?: string; delayValue?: number };
          const delayValue = delayConfig.delayValue || 0;
          const delayType = delayConfig.delayType || "minutes";
          let delayMinutes = 0;
          if (delayType === "minutes") delayMinutes = delayValue;
          else if (delayType === "hours") delayMinutes = delayValue * 60;
          else if (delayType === "days") delayMinutes = delayValue * 24 * 60;
          cumulativeDelayMinutes += delayMinutes;

          if (enrollmentId) {
            await supabaseAdmin.from("workflow_enrollment_steps").insert({
              enrollment_id: enrollmentId,
              step_type: "delay",
              step_action: "delay",
              step_config: step.config,
              status: "completed",
              executed_at: new Date().toISOString(),
              result: { delay_minutes: delayMinutes, cumulative_delay_minutes: cumulativeDelayMinutes },
            });
          }
          continue;
        }

        if (step.action_type !== "send_email") continue;

        const config = (step.config || {}) as {
          email_type?: "custom" | "appointment_confirmation" | "appointment_reminder" | "doctor_notification";
          template_id?: string;
          subject?: string;
          subject_template?: string;
          body_html_template?: string;
          body_template?: string;
          use_html?: boolean;
          recipient?: string;
          user_id?: string;
          email_address?: string;
          send_mode?: "immediate" | "delay" | "recurring" | "reminder_before";
          delay_minutes?: number | null;
          before_value?: number | null;
          before_unit?: "hours" | "days";
        };

        const emailType = config.email_type || "custom";

        // Resolve subject, body, and recipient based on email type.
        let subject = "";
        let bodyHtml = "";
        let recipientEmail: string | null = null;

        if (emailType === "appointment_confirmation") {
          subject = language === "fr"
            ? "Votre rendez-vous au sein de Maison Tóā"
            : "Your appointment at Maison Tóā";
          bodyHtml = generatePatientConfirmationEmail(
            lastName,
            patientGender,
            doctorName,
            appointmentDate || new Date(),
            service,
            location,
            language,
            appointmentId,
            formUrl,
          );
          recipientEmail = patientEmail;
        } else if (emailType === "appointment_reminder") {
          subject = language === "fr" ? "Rappel de votre rendez-vous" : "Appointment reminder";
          bodyHtml = generatePatientReminderEmail(
            lastName,
            patientGender,
            appointmentDate || new Date(),
            service,
            language,
            appointmentId,
          );
          recipientEmail = patientEmail;
        } else if (emailType === "doctor_notification") {
          subject = `New Appointment: ${patientName} - ${appointmentDate ? formatAppointmentDate(appointmentDate) : ""}`;
          bodyHtml = generateDoctorNotificationEmail(
            doctorName,
            patientName,
            patientEmail || "",
            patientPhone,
            appointmentDate || new Date(),
            service,
            null,
            location,
          );
          recipientEmail = doctorEmail;
        } else {
          // Custom email: render subject/body templates.
          let templateHtml: string | null = null;
          let templateSubject: string | null = null;
          if (config.template_id) {
            const { data: template } = await supabaseAdmin
              .from("email_templates")
              .select("subject_template, body_template, html_content")
              .eq("id", config.template_id)
              .single();
            if (template) {
              templateHtml = (template as any).html_content || (template as any).body_template;
              templateSubject = (template as any).subject_template;
            }
          }

          subject = renderTemplate(
            config.subject || config.subject_template || templateSubject || "Your appointment at Maison Tóā",
            templateContext,
          );

          if (templateHtml) {
            bodyHtml = renderTemplate(templateHtml, templateContext);
          } else if (config.use_html && config.body_html_template) {
            bodyHtml = renderTemplate(config.body_html_template, templateContext);
          } else {
            bodyHtml = textToHtml(renderTemplate(config.body_template || "", templateContext));
          }
          bodyHtml = sanitizeTelLinks(bodyHtml);

          if (config.recipient === "specific_user" && config.user_id) {
            const { data: user } = await supabaseAdmin
              .from("users")
              .select("email")
              .eq("id", config.user_id)
              .single();
            recipientEmail = (user as any)?.email || null;
          } else if (config.recipient === "specific_email" && config.email_address) {
            recipientEmail = config.email_address;
          } else if (config.recipient === "doctor") {
            recipientEmail = doctorEmail;
          } else {
            recipientEmail = patientEmail;
          }
        }

        if (!recipientEmail) {
          if (enrollmentId) {
            await supabaseAdmin.from("workflow_enrollment_steps").insert({
              enrollment_id: enrollmentId,
              step_type: "action",
              step_action: "send_email",
              step_config: config,
              status: "skipped",
              executed_at: new Date().toISOString(),
              error_message: "No recipient email resolved",
            });
          }
          continue;
        }

        const now = new Date();
        const sendMode = config.send_mode || "immediate";

        // Compute the scheduled send time.
        let scheduledAt: Date | null = null;
        if (sendMode === "reminder_before") {
          if (!appointmentDate) {
            // Cannot schedule a reminder without an appointment date.
            if (enrollmentId) {
              await supabaseAdmin.from("workflow_enrollment_steps").insert({
                enrollment_id: enrollmentId,
                step_type: "action",
                step_action: "send_email",
                step_config: config,
                status: "skipped",
                executed_at: new Date().toISOString(),
                error_message: "No appointment date for reminder_before",
              });
            }
            continue;
          }
          const beforeValue = typeof config.before_value === "number" && config.before_value > 0
            ? config.before_value
            : 24;
          const unitMs = config.before_unit === "days" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
          scheduledAt = new Date(appointmentDate.getTime() - beforeValue * unitMs);
        } else if (sendMode === "delay") {
          const delayMin =
            (typeof config.delay_minutes === "number" && config.delay_minutes > 0 ? config.delay_minutes : 0) +
            cumulativeDelayMinutes;
          if (delayMin > 0) scheduledAt = new Date(now.getTime() + delayMin * 60 * 1000);
        } else if (cumulativeDelayMinutes > 0) {
          scheduledAt = new Date(now.getTime() + cumulativeDelayMinutes * 60 * 1000);
        }

        const isFuture = !!scheduledAt && scheduledAt.getTime() > now.getTime();

        // Future sends (reminders/delays) are queued in scheduled_emails for the
        // cron job — the same reliable path the booking flow already used.
        if (isFuture && scheduledAt) {
          const { error: scheduleError } = await supabaseAdmin
            .from("scheduled_emails")
            .insert({
              patient_id: patientId,
              appointment_id: appointmentId,
              recipient_type: "patient",
              recipient_email: recipientEmail,
              subject,
              body: bodyHtml,
              scheduled_for: scheduledAt.toISOString(),
              status: "pending",
            });

          if (enrollmentId) {
            await supabaseAdmin.from("workflow_enrollment_steps").insert({
              enrollment_id: enrollmentId,
              step_type: "action",
              step_action: "send_email",
              step_config: config,
              status: scheduleError ? "failed" : "scheduled",
              executed_at: new Date().toISOString(),
              error_message: scheduleError?.message,
              result: scheduleError ? undefined : { scheduled_for: scheduledAt.toISOString(), recipient: recipientEmail },
            });
          }
          if (!scheduleError) actionsRun += 1;
          continue;
        }

        // reminder_before whose time is already in the past — skip silently.
        if (sendMode === "reminder_before") {
          if (enrollmentId) {
            await supabaseAdmin.from("workflow_enrollment_steps").insert({
              enrollment_id: enrollmentId,
              step_type: "action",
              step_action: "send_email",
              step_config: config,
              status: "skipped",
              executed_at: new Date().toISOString(),
              error_message: "Reminder time is in the past",
            });
          }
          continue;
        }

        // Immediate send.
        const { data: inserted } = await supabaseAdmin
          .from("emails")
          .insert({
            patient_id: patientId,
            to_address: recipientEmail,
            from_address: null,
            subject,
            body: bodyHtml,
            status: "sent",
            direction: "outbound",
            sent_at: now.toISOString(),
          })
          .select("id")
          .single();

        if (isEmailConfigured()) {
          try {
            const emailId = (inserted as any)?.id as string | undefined;
            await sendEmailViaResend({
              to: recipientEmail,
              subject,
              html: bodyHtml,
              from: emailFromAddress,
              fromName: emailFromName,
              tags: emailId ? [{ name: "email_id", value: emailId }] : undefined,
            });
          } catch (sendError) {
            console.error("Error sending appointment workflow email via Resend", sendError);
          }
        }

        actionsRun += 1;
        if (enrollmentId) {
          await supabaseAdmin.from("workflow_enrollment_steps").insert({
            enrollment_id: enrollmentId,
            step_type: "action",
            step_action: "send_email",
            step_config: config,
            status: "completed",
            executed_at: new Date().toISOString(),
            result: { email_id: (inserted as any)?.id, subject, recipient: recipientEmail },
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      workflowsRun: matchingWorkflows.length,
      actionsRun,
    });
  } catch (error) {
    console.error("Unexpected error in /api/workflows/appointment-created", error);
    return NextResponse.json(
      { error: "Unexpected error running appointment workflows" },
      { status: 500 },
    );
  }
}
