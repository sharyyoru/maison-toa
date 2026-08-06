import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emitWorkflowEvent } from "@/lib/workflows/events";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  const trimmed = text(value).trim();
  return trimmed ? trimmed : null;
}

function userName(user: { email?: string | null; user_metadata?: Record<string, any> | null }) {
  return (
    user.user_metadata?.full_name ||
    [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ") ||
    user.email ||
    "User"
  );
}

async function logConsultationNoteEvent(params: {
  patientId: string;
  consultationId?: string | null;
  collabRoomId?: string | null;
  eventType: string;
  user: { id: string; email?: string | null; user_metadata?: Record<string, any> | null };
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("consultation_note_events").insert({
    patient_id: params.patientId,
    consultation_id: params.consultationId ?? null,
    collab_room_id: params.collabRoomId ?? null,
    event_type: params.eventType,
    actor_user_id: params.user.id,
    actor_name: userName(params.user),
    actor_email: params.user.email ?? null,
    request_id: params.requestId ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) console.error("[consultation-note-events] insert failed", error.message);
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return NextResponse.json({ error: "Missing Supabase access token" }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: "Invalid Supabase access token" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const draftId = text(body?.draftId);
  const patientId = text(body?.patientId);
  const requestId = nullableText(body?.requestId);

  if (!draftId || !patientId) {
    return NextResponse.json({ error: "Missing draft or patient" }, { status: 400 });
  }

  const { data: existingDraft } = await supabaseAdmin
    .from("consultations")
    .select("collab_room_id")
    .eq("id", draftId)
    .eq("patient_id", patientId)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("consultations")
    .update({
      title: text(body?.title).trim() || "Consultation",
      content: text(body?.contentHtml),
      record_type: text(body?.recordType) || "notes",
      doctor_user_id: nullableText(body?.doctorId),
      doctor_name: nullableText(body?.doctorName),
      scheduled_at: text(body?.scheduledAt),
      payment_method: nullableText(body?.paymentMethod),
      duration_seconds:
        typeof body?.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
          ? body.durationSeconds
          : 0,
      diagnosis_code: nullableText(body?.diagnosisCode),
      ref_icd10: nullableText(body?.refIcd10),
      is_draft: false,
      collab_room_id: existingDraft?.collab_room_id ?? null,
    })
    .eq("id", draftId)
    .eq("patient_id", patientId)
    .select(
      "id, patient_id, consultation_id, title, content, record_type, doctor_user_id, doctor_name, scheduled_at, payment_method, duration_seconds, invoice_total_amount, invoice_is_complimentary, invoice_is_paid, invoice_status, invoice_paid_amount, cash_receipt_path, invoice_pdf_path, payment_link_token, payrexx_payment_link, payrexx_payment_status, created_by_user_id, created_by_name, is_archived, archived_at, diagnosis_code, ref_icd10, collab_room_id, is_draft",
    )
    .single();

  if (error || !data) {
    await logConsultationNoteEvent({
      patientId,
      consultationId: draftId,
      collabRoomId: existingDraft?.collab_room_id ?? null,
      eventType: "finalize_failed",
      user,
      requestId,
      metadata: { error: error?.message ?? "Failed to finalize consultation draft" },
    });
    return NextResponse.json(
      { error: error?.message ?? "Failed to finalize consultation draft" },
      { status: 500 },
    );
  }

  await logConsultationNoteEvent({
    patientId,
    consultationId: data.id,
    collabRoomId: data.collab_room_id ?? null,
    eventType: "finalized",
    user,
    requestId,
    metadata: { recordType: data.record_type, title: data.title },
  });

  try {
    await emitWorkflowEvent({
      type: "consultation_completed",
      subjectType: "consultation",
      subjectId: data.id,
      patientId,
      occurredAt: new Date().toISOString(),
      payload: { consultation_id: data.id, consultation_type: data.record_type, title: data.title },
      dedupeKey: `consultation_completed:${data.id}`,
    });
    const { count: treatments } = await supabaseAdmin.from("patient_treatments").select("id", { count: "exact", head: true }).eq("patient_id", patientId).gte("performed_at", data.scheduled_at);
    if (!treatments) {
      await emitWorkflowEvent({
        type: "consultation_without_treatment",
        subjectType: "consultation",
        subjectId: data.id,
        patientId,
        payload: { consultation_id: data.id, consultation_type: data.record_type, title: data.title },
        dedupeKey: `consultation_without_treatment:${data.id}`,
      });
    }
  } catch (workflowError) {
    console.error("[workflow-v2] Failed to emit consultation event", workflowError);
  }

  return NextResponse.json({ consultation: data });
}
