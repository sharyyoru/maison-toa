import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emitWorkflowEvent } from "@/lib/workflows/events";

const roomPattern = /^patient:([0-9a-fA-F-]{36}):consultation(?:-create|:([0-9a-fA-F-]{36}))$/;

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
  const patientId = text(body?.patientId);
  const roomId = text(body?.roomId);
  const draftId = text(body?.draftId);
  const match = roomId.match(roomPattern);

  if (!patientId || !match || match[1] !== patientId) {
    return NextResponse.json({ error: "Invalid patient or room" }, { status: 400 });
  }

  const { data: draftById } = draftId
    ? await supabaseAdmin
        .from("consultations")
        .select("id, consultation_id, is_draft")
        .eq("id", draftId)
        .eq("patient_id", patientId)
        .maybeSingle()
    : { data: null };

  const { data: draftByRoom } = await supabaseAdmin
    .from("consultations")
    .select("id, consultation_id, is_draft")
    .eq("collab_room_id", roomId)
    .maybeSingle();

  const existingDraft = draftById ?? draftByRoom;

  const locked = body?.locked === true;
  const requestId = nullableText(body?.requestId);

  if (draftByRoom && draftByRoom.id !== draftById?.id && !locked) {
    const { error: releaseOtherError } = await supabaseAdmin
      .from("consultations")
      .update({ collab_room_id: null })
      .eq("id", draftByRoom.id);

    if (releaseOtherError) {
      return NextResponse.json(
        { error: releaseOtherError.message ?? "Failed to release active consultation room" },
        { status: 500 },
      );
    }
  }

  if (existingDraft?.is_draft === false && !locked && !draftById) {
    const { error: releaseError } = await supabaseAdmin
      .from("consultations")
      .update({ collab_room_id: null })
      .eq("id", existingDraft.id);

    if (releaseError) {
      return NextResponse.json(
        { error: releaseError.message ?? "Failed to release closed consultation room" },
        { status: 500 },
      );
    }
  }

  let consultationId =
    existingDraft && (draftById || locked || existingDraft.is_draft !== false)
      ? (existingDraft.consultation_id as string | undefined)
      : undefined;
  if (!consultationId) {
    const { data: generatedId, error: rpcError } = await supabaseAdmin.rpc("generate_invoice_number");
    if (rpcError || !generatedId) {
      return NextResponse.json(
        { error: rpcError?.message ?? "Failed to generate consultation id" },
        { status: 500 },
      );
    }
    consultationId = String(generatedId);
  }

  const payload = {
    patient_id: patientId,
    collab_room_id: roomId,
    is_draft: locked ? false : true,
    consultation_id: consultationId,
    title: text(body?.title).trim() || "Consultation Note",
    content: text(body?.contentHtml),
    record_type: text(body?.recordType) || "notes",
    doctor_user_id: nullableText(body?.doctorId),
    doctor_name: nullableText(body?.doctorName),
    scheduled_at: text(body?.scheduledAt),
    diagnosis_code: nullableText(body?.diagnosisCode),
    ref_icd10: nullableText(body?.refIcd10),
  };

  const selectColumns =
    "id, patient_id, consultation_id, title, content, record_type, doctor_user_id, doctor_name, scheduled_at, payment_method, duration_seconds, invoice_total_amount, invoice_is_complimentary, invoice_is_paid, invoice_status, invoice_paid_amount, cash_receipt_path, invoice_pdf_path, payment_link_token, payrexx_payment_link, payrexx_payment_status, created_by_user_id, created_by_name, is_archived, archived_at, diagnosis_code, ref_icd10, collab_room_id, is_draft";

  const query =
    existingDraft && (draftById || (locked && existingDraft.is_draft !== false))
      ? supabaseAdmin
          .from("consultations")
          .update(payload)
          .eq("id", existingDraft.id)
          .select(selectColumns)
          .single()
      : locked
        ? supabaseAdmin.from("consultations").insert(payload).select(selectColumns).single()
        : supabaseAdmin
            .from("consultations")
            .upsert(payload, {
              onConflict: "collab_room_id",
              ignoreDuplicates: false,
            })
            .select(selectColumns)
            .single();

  const { data, error } = await query;

  if (error || !data) {
    await logConsultationNoteEvent({
      patientId,
      consultationId: existingDraft?.id ?? null,
      collabRoomId: roomId,
      eventType: locked ? "lock_failed" : existingDraft ? "autosave_failed" : "create_failed",
      user,
      requestId,
      metadata: { error: error?.message ?? "Failed to save consultation draft" },
    });
    return NextResponse.json(
      { error: error?.message ?? "Failed to save consultation draft" },
      { status: 500 },
    );
  }

  await logConsultationNoteEvent({
    patientId,
    consultationId: data.id,
    collabRoomId: roomId,
    eventType: locked ? "locked" : existingDraft ? "autosaved" : "created",
    user,
    requestId,
    metadata: {
      isDraft: data.is_draft,
      contentLength: text(body?.contentHtml).length,
      title: data.title,
    },
  });

  if (!existingDraft) {
    try {
      await emitWorkflowEvent({ type: "consultation_started", subjectType: "consultation", subjectId: data.id, patientId, payload: { consultation_id: data.id, consultation_type: data.record_type, title: data.title }, dedupeKey: `consultation_started:${data.id}` });
    } catch (workflowError) {
      console.error("[workflow-v2] Failed to emit consultation started event", workflowError);
    }
  }

  return NextResponse.json({ draft: data });
}
