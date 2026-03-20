import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

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
    const path = rawPath.trim();
    const value = resolvePath(context, path);
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

type ResendPayload = {
  deals: { id: string; patient_id: string; owner_id?: string }[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResendPayload;
    const { deals } = body;

    if (!deals || !Array.isArray(deals) || deals.length === 0) {
      return NextResponse.json(
        { error: "deals array is required" },
        { status: 400 },
      );
    }

    // Find the active workflow with send_whatsapp action
    const { data: workflows, error: wfError } = await supabaseAdmin
      .from("workflows")
      .select("id, name, config")
      .eq("trigger_type", "deal_stage_changed")
      .eq("active", true);

    if (wfError || !workflows || workflows.length === 0) {
      return NextResponse.json(
        { error: "No active deal_stage_changed workflows found" },
        { status: 404 },
      );
    }

    // Find the workflow that has a send_whatsapp action
    let targetWorkflow: { id: string; name: string; config: any } | null = null;
    type WaConfig = {
      message_template?: string;
      send_mode?: string;
      delay_hours?: number | null;
      recurring_days?: number | null;
      recurring_times?: number | null;
    };
    let whatsappConfig: WaConfig | null = null;

    for (const wf of workflows) {
      // Check new builder format (config.nodes)
      const config = wf.config as { nodes?: any[] } | null;
      if (config?.nodes && Array.isArray(config.nodes)) {
        const waNode = config.nodes.find(
          (n: any) =>
            n.type === "action" &&
            (n.data?.actionType === "send_whatsapp" || n.data?.action_type === "send_whatsapp")
        );
        if (waNode) {
          targetWorkflow = wf;
          whatsappConfig = (waNode.data?.config || {}) as WaConfig;
          break;
        }
      }

      // Fallback: check old workflow_actions table
      const { data: actions } = await supabaseAdmin
        .from("workflow_actions")
        .select("action_type, config")
        .eq("workflow_id", wf.id)
        .eq("action_type", "send_whatsapp")
        .limit(1);

      if (actions && actions.length > 0) {
        targetWorkflow = wf;
        whatsappConfig = (actions[0].config || {}) as WaConfig;
        break;
      }
    }

    if (!targetWorkflow || !whatsappConfig) {
      return NextResponse.json(
        { error: "No workflow with send_whatsapp action found" },
        { status: 404 },
      );
    }

    const messageTemplate = whatsappConfig.message_template ||
      "Hi {{patient.first_name}}, we wanted to follow up on your inquiry. Please let us know if you have any questions.";

    const results: { dealId: string; status: string; error?: string }[] = [];
    let queued = 0;
    let skipped = 0;
    let failed = 0;

    for (const dealInput of deals) {
      const dealId = dealInput.id;

      try {
        // Fetch the deal with owner info
        const { data: deal, error: dealError } = await supabaseAdmin
          .from("deals")
          .select("id, patient_id, title, pipeline, notes, owner_id, owner_name, service_id")
          .eq("id", dealId)
          .maybeSingle();

        if (dealError || !deal) {
          results.push({ dealId, status: "failed", error: "Deal not found" });
          failed++;
          continue;
        }

        // Fetch patient
        const { data: patient, error: patientError } = await supabaseAdmin
          .from("patients")
          .select("id, first_name, last_name, email, phone")
          .eq("id", deal.patient_id)
          .maybeSingle();

        if (patientError || !patient) {
          results.push({ dealId, status: "failed", error: "Patient not found" });
          failed++;
          continue;
        }

        if (!patient.phone) {
          results.push({ dealId, status: "skipped", error: "No phone number" });
          skipped++;
          continue;
        }

        const senderUserId = deal.owner_id;
        if (!senderUserId) {
          results.push({ dealId, status: "skipped", error: "No deal owner (sender)" });
          skipped++;
          continue;
        }

        // Check if a WhatsApp message was already sent for this deal
        const { data: existingQueue } = await supabaseAdmin
          .from("whatsapp_queue")
          .select("id, status")
          .eq("deal_id", dealId)
          .limit(1);

        if (existingQueue && existingQueue.length > 0) {
          results.push({ dealId, status: "skipped", error: `Already has queue entry (status: ${existingQueue[0].status})` });
          skipped++;
          continue;
        }

        // Build template context
        const templateContext = {
          patient: {
            id: patient.id,
            first_name: patient.first_name,
            last_name: patient.last_name,
            email: patient.email,
            phone: patient.phone,
          },
          deal: {
            id: deal.id,
            title: deal.title,
            pipeline: deal.pipeline,
            notes: deal.notes,
          },
          clinic: {
            name: "Aesthetic Clinic",
          },
        };

        const messageBody = renderTemplate(messageTemplate, templateContext);

        const { error: insertError } = await supabaseAdmin
          .from("whatsapp_queue")
          .insert({
            sender_user_id: senderUserId,
            to_phone: patient.phone,
            message_body: messageBody,
            patient_id: patient.id,
            deal_id: deal.id,
            workflow_id: targetWorkflow.id,
            status: "pending",
            scheduled_at: new Date().toISOString(),
          });

        if (insertError) {
          results.push({ dealId, status: "failed", error: insertError.message });
          failed++;
        } else {
          results.push({ dealId, status: "queued" });
          queued++;
        }
      } catch (err) {
        results.push({ dealId, status: "failed", error: String(err) });
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      workflow: targetWorkflow.name,
      total: deals.length,
      queued,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    console.error("Error in resend-whatsapp:", error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 },
    );
  }
}
