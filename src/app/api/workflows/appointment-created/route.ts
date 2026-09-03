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
import { normalizePatientLanguage } from "@/lib/languagePreference";
import { formatSwissYmd } from "@/lib/swissTimezone";
import { resolveLegacyWorkflowConfig } from "@/lib/workflows/legacyConfig";
import { withPatientTemplateVariables } from "@/lib/patientTemplateVariables";

export const runtime = "nodejs";

const emailFromAddress = process.env.EMAIL_FROM_ADDRESS || "info@mail.maisontoa.com";
const emailFromName = process.env.EMAIL_FROM_NAME || "Maison Toa";

type AppointmentCreatedPayload = {
  appointmentId: string;
  triggerType?: "appointment_created" | "appointment_status_changed";
  appointmentStatus?: string;
  previousAppointmentStatus?: string | null;
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
    const triggerType = body.triggerType === "appointment_status_changed"
      ? "appointment_status_changed"
      : "appointment_created";

    // Resolve patient + appointment context. Prefer the payload (so emails are
    // identical to the booking flow), falling back to the database when needed.
    let patientId = body.patientId?.trim() || null;
    const language = normalizePatientLanguage(body.language, "en");

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
    if (!appointmentDateIso || !patientId || !patientEmail || !patientGender) {
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

      if (patientId && (!patientEmail || !firstName || !patientGender)) {
        const { data: pat } = await supabaseAdmin
          .from("patients")
          .select("first_name, last_name, email, phone, gender")
          .eq("id", patientId)
          .maybeSingle();
        if (pat) {
          firstName = firstName || (pat as any).first_name || "";
          lastName = lastName || (pat as any).last_name || "";
          patientEmail = patientEmail || (pat as any).email || null;
          patientPhone = patientPhone || (pat as any).phone || null;
          patientGender = patientGender || (pat as any).gender || undefined;
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
      .eq("trigger_type", triggerType)
      .eq("active", true);

    if (workflowsError) {
      console.error(`Failed to load ${triggerType} workflows`, workflowsError);
      return NextResponse.json({ error: "Failed to load workflows" }, { status: 500 });
    }

    if (!workflows || workflows.length === 0) {
      return NextResponse.json({ ok: true, workflowsRun: 0, actionsRun: 0 });
    }

    const templateContext = {
      patient: withPatientTemplateVariables({
        id: patientId,
        first_name: firstName,
        last_name: lastName,
        email: patientEmail,
        phone: patientPhone,
        gender: patientGender,
      }),
      appointment: {
        id: appointmentId,
        status: body.appointmentStatus || "",
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
        else if (data.field === "appointment.status") fieldValue = (body.appointmentStatus || "").toLowerCase();
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

    const matchingWorkflows = (workflows as any[]).filter((w) => {
      const config = resolveLegacyWorkflowConfig(w.config, triggerType) as {
        nodes?: any[];
        appointment_status?: string;
        appointment_statuses?: string[];
        appointment_status_match_mode?: "includes" | "excludes";
        only_future_appointments_from_activation_day?: boolean;
        future_appointments_activation_day?: string;
      };
      if (triggerType === "appointment_status_changed") {
        // Fall back to the original single-status field for workflows saved
        // before multi-select support was added.
        const selectedStatuses = config.appointment_statuses?.length
          ? config.appointment_statuses
          : config.appointment_status
            ? [config.appointment_status]
            : [];
        if (selectedStatuses.length === 0) return false;

        const statusIsSelected = body.appointmentStatus
          ? selectedStatuses.includes(body.appointmentStatus)
          : false;
        const matchesStatus = config.appointment_status_match_mode === "excludes"
          ? !statusIsSelected
          : statusIsSelected;
        if (!matchesStatus) return false;

        if (config.only_future_appointments_from_activation_day) {
          if (!appointmentDate || !config.future_appointments_activation_day) return false;
          if (formatSwissYmd(appointmentDate) < config.future_appointments_activation_day) return false;
        }
      }
      return evaluateConditions(config);
    });

    if (matchingWorkflows.length === 0) {
      return NextResponse.json({ ok: true, workflowsRun: 0, actionsRun: 0 });
    }

    let actionsRun = 0;

    for (const workflow of matchingWorkflows) {
      const workflowConfig = resolveLegacyWorkflowConfig(workflow.config, triggerType) as {
        nodes?: any[];
        run_once_per_appointment?: boolean;
        run_once_per_patient_per_day?: boolean;
      } | null;

      // Treat the legacy setting as enabled so existing workflows immediately
      // gain the safer patient/day behavior without needing to be re-saved.
      const runOncePerPatientPerDay =
        workflowConfig?.run_once_per_patient_per_day ??
        workflowConfig?.run_once_per_appointment ??
        false;
      const appointmentDay = appointmentDate
        ? formatSwissYmd(appointmentDate)
        : null;

      if (
        triggerType === "appointment_status_changed" &&
        runOncePerPatientPerDay &&
        patientId &&
        appointmentDay
      ) {
        const { data: existingEnrollment, error: existingEnrollmentError } = await supabaseAdmin
          .from("workflow_enrollments")
          .select("id")
          .eq("workflow_id", workflow.id)
          .eq("patient_id", patientId)
          .contains("trigger_data", { appointment_day: appointmentDay })
          .limit(1)
          .maybeSingle();

        if (existingEnrollmentError) {
          console.error("Failed to check daily patient workflow enrollment", existingEnrollmentError);
          continue;
        }
        if (existingEnrollment) continue;
      }

      const { data: enrollment } = await supabaseAdmin
        .from("workflow_enrollments")
        .insert({
          workflow_id: workflow.id,
          patient_id: patientId,
          status: "active",
          trigger_data: {
            trigger_type: triggerType,
            appointment_id: appointmentId,
            appointment_date: appointmentDateIso,
            appointment_day: appointmentDay,
            appointment_status: body.appointmentStatus,
            previous_appointment_status: body.previousAppointmentStatus,
            patient: templateContext.patient,
          },
        })
        .select("id")
        .single();

      const enrollmentId = enrollment?.id;

      if (!workflowConfig?.nodes || !Array.isArray(workflowConfig.nodes)) continue;

      const steps = workflowConfig.nodes
        .filter((node: any) => node.type === "action" || node.type === "delay")
        .map((node: any) => ({
          step_type: node.type as "action" | "delay",
          action_type: node.type === "delay" ? "delay" : node.data?.actionType || "",
          config: node.type === "delay" ? node.data || {} : node.data?.config || {},
        }));

      let cumulativeDelayMinutes = 0;
      const workflowTriggeredAt = new Date();
      let cumulativeDelayAnchor = workflowTriggeredAt;

      for (const step of steps) {
        if (step.step_type === "delay") {
          const delayConfig = step.config as {
            delayType?: string;
            delayValue?: number;
            delayAnchor?: "trigger_time" | "appointment_time";
          };
          const delayValue = delayConfig.delayValue || 0;
          const delayType = delayConfig.delayType || "minutes";
          let delayMinutes = 0;
          if (delayType === "minutes") delayMinutes = delayValue;
          else if (delayType === "hours") delayMinutes = delayValue * 60;
          else if (delayType === "days") delayMinutes = delayValue * 24 * 60;
          cumulativeDelayMinutes += delayMinutes;
          cumulativeDelayAnchor =
            delayConfig.delayAnchor === "appointment_time" && appointmentDate
              ? appointmentDate
              : workflowTriggeredAt;

          if (enrollmentId) {
            await supabaseAdmin.from("workflow_enrollment_steps").insert({
              enrollment_id: enrollmentId,
              step_type: "delay",
              step_action: "delay",
              step_config: step.config,
              status: "completed",
              executed_at: new Date().toISOString(),
              result: {
                delay_minutes: delayMinutes,
                cumulative_delay_minutes: cumulativeDelayMinutes,
                delay_anchor: delayConfig.delayAnchor || "trigger_time",
                delay_anchor_time: cumulativeDelayAnchor.toISOString(),
              },
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
          } else if (config.recipient === "appointment_patient") {
            // patientEmail is resolved from the appointment's patient_id above,
            // including status-change triggers that only provide appointmentId.
            recipientEmail = patientEmail;
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
          if (delayMin > 0) {
            scheduledAt = new Date(cumulativeDelayAnchor.getTime() + delayMin * 60 * 1000);
          }
        } else if (cumulativeDelayMinutes > 0) {
          scheduledAt = new Date(
            cumulativeDelayAnchor.getTime() + cumulativeDelayMinutes * 60 * 1000,
          );
        }

        const isFuture = !!scheduledAt && scheduledAt.getTime() > now.getTime();

        // Let Resend handle delays up to 72 hours so short workflow delays are
        // delivered at their configured time. The hourly database cron remains
        // the fallback for longer schedules (and unconfigured email providers).
        if (isFuture && scheduledAt) {
          const delayMs = scheduledAt.getTime() - now.getTime();
          // Appointment reminders must remain in our database queue so they can
          // be moved or removed when the appointment is rescheduled/cancelled.
          // Once a message is scheduled natively with Resend, its provider ID is
          // not available to the calendar update paths and it becomes stale.
          const canUseProviderScheduling =
            sendMode !== "reminder_before" &&
            isEmailConfigured() &&
            delayMs <= 72 * 60 * 60 * 1000;

          if (canUseProviderScheduling) {
            const sendResult = await sendEmailViaResend({
              to: recipientEmail,
              subject,
              html: bodyHtml,
              from: emailFromAddress,
              fromName: emailFromName,
              scheduledAt,
            });

            if (enrollmentId) {
              await supabaseAdmin.from("workflow_enrollment_steps").insert({
                enrollment_id: enrollmentId,
                step_type: "action",
                step_action: "send_email",
                step_config: config,
                status: sendResult.success ? "scheduled" : "failed",
                executed_at: new Date().toISOString(),
                error_message: sendResult.error,
                result: sendResult.success
                  ? {
                      scheduled_for: scheduledAt.toISOString(),
                      recipient: recipientEmail,
                      provider: "resend",
                      message_id: sendResult.messageId,
                    }
                  : undefined,
              });
            }

            if (sendResult.success) {
              actionsRun += 1;
              continue;
            }
            // If native scheduling fails, retain the job in the database queue
            // so the cron processor can retry it.
          }

          const { error: scheduleError } = await supabaseAdmin
            .from("scheduled_emails")
            .insert({
              patient_id: patientId,
              appointment_id: appointmentId,
              // Keep workflow jobs distinct from the built-in 24-hour patient
              // reminder. Calendar time synchronization only manages the latter.
              recipient_type: "workflow",
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
