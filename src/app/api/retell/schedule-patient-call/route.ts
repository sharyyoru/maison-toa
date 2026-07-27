import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone, RETELL_FROM_NUMBER } from "@/lib/retell";

export const runtime = "nodejs";

function formatReadableDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      patient_id?: string;
      prompt?: string;
      scheduled_for?: string;
      service_name?: string;
      agent_id?: string;
      scheduled_by_email?: string;
      scheduled_by_name?: string;
    };

    const patientId = body.patient_id?.trim();
    const prompt = (body.prompt ?? "").trim();
    const serviceName = (body.service_name ?? "").trim() || "our services";
    const agentId = (body.agent_id ?? "").trim() || null;
    const scheduledByEmail = (body.scheduled_by_email ?? "").trim() || null;
    const scheduledByName = (body.scheduled_by_name ?? "").trim() || null;

    if (!patientId) {
      return NextResponse.json({ error: "patient_id is required" }, { status: 400 });
    }

    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("id, first_name, last_name, phone")
      .eq("id", patientId)
      .maybeSingle();

    if (patientError || !patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    if (!patient.phone) {
      return NextResponse.json(
        { error: "Patient has no phone number – cannot schedule call" },
        { status: 422 },
      );
    }

    const toNumber = normalizePhone(patient.phone as string);

    if (!RETELL_FROM_NUMBER) {
      return NextResponse.json(
        { error: "RETELL_FROM_NUMBER env var not configured" },
        { status: 500 },
      );
    }

    let scheduledFor: string;
    if (body.scheduled_for) {
      const parsed = new Date(body.scheduled_for);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid scheduled_for datetime" }, { status: 400 });
      }
      scheduledFor = parsed.toISOString();
    } else {
      scheduledFor = new Date().toISOString();
    }

    const userName = [patient.first_name, patient.last_name]
      .filter(Boolean)
      .join(" ") || "there";

    const taskContent = [
      prompt && `Prompt: ${prompt}`,
      serviceName !== "our services" && `Topic: ${serviceName}`,
      `Scheduled for: ${formatReadableDateTime(scheduledFor)}`,
      `Patient phone: ${toNumber}`,
      scheduledByName && `Scheduled by: ${scheduledByName}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { data: aiTask, error: taskError } = await supabaseAdmin
      .from("tasks")
      .insert({
        patient_id: patientId,
        name: `AI Call: ${userName === "there" ? patientId : userName}`,
        type: "call",
        priority: "high",
        content: taskContent || "AI call scheduled",
        activity_date: scheduledFor,
        status: "not_started",
        assigned_user_id: null,
        assigned_user_name: "Aliice (AI Call Agent)",
        created_by_name: "Aliice (AI Call Agent)",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (taskError) {
      console.error("Failed to create AI call task:", taskError);
    }

    const { data: scheduled, error: insertError } = await supabaseAdmin
      .from("retell_scheduled_calls")
      .insert({
        patient_id: patientId,
        deal_id: null,
        scheduled_for: scheduledFor,
        status: "pending",
        user_name: patient.first_name ?? userName,
        service_name: serviceName,
        prompt,
        to_number: toNumber,
        task_id: aiTask?.id ?? null,
        agent_id: agentId,
        scheduled_by_email: scheduledByEmail,
        scheduled_by_name: scheduledByName,
      })
      .select("id")
      .single();

    if (insertError || !scheduled) {
      console.error("Failed to insert retell_scheduled_calls:", insertError);
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to schedule call" },
        { status: 500 },
      );
    }

    const scheduledId = (scheduled as { id: string }).id;

    const scheduledCallLog = {
      patient_id: patientId,
      scheduled_call_id: scheduledId,
      direction: "task_outbound",
      from_number: RETELL_FROM_NUMBER,
      to_number: toNumber,
      call_status: "scheduled",
      service_interest: serviceName,
      prompt,
      source: "retell",
      started_at: scheduledFor,
    };

    const { error: logError } = await supabaseAdmin
      .from("call_logs")
      .insert(scheduledCallLog);

    if (logError) {
      console.error("Failed to insert scheduled call log:", logError);
    }

    console.log(
      `AI call scheduled for ${scheduledFor} → patient ${patientId} (${toNumber})`,
    );

    return NextResponse.json({
      ok: true,
      scheduled_call_id: scheduledId,
      scheduled_for: scheduledFor,
      task_id: aiTask?.id ?? null,
    });
  } catch (err: any) {
    console.error("Error in /api/retell/schedule-patient-call:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
