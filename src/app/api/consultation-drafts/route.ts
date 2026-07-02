import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const roomPattern = /^patient:([0-9a-fA-F-]{36}):consultation-create$/;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  const trimmed = text(value).trim();
  return trimmed ? trimmed : null;
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
  const match = roomId.match(roomPattern);

  if (!patientId || !match || match[1] !== patientId) {
    return NextResponse.json({ error: "Invalid patient or room" }, { status: 400 });
  }

  const { data: existingDraft } = await supabaseAdmin
    .from("consultations")
    .select("consultation_id")
    .eq("collab_room_id", roomId)
    .maybeSingle();

  let consultationId = existingDraft?.consultation_id as string | undefined;
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
    is_draft: body?.locked === true ? false : true,
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

  const { data, error } = await supabaseAdmin
    .from("consultations")
    .upsert(payload, {
      onConflict: "collab_room_id",
      ignoreDuplicates: false,
    })
    .select(
      "id, patient_id, consultation_id, title, content, record_type, doctor_user_id, doctor_name, scheduled_at, payment_method, duration_seconds, invoice_total_amount, invoice_is_complimentary, invoice_is_paid, invoice_status, invoice_paid_amount, cash_receipt_path, invoice_pdf_path, payment_link_token, payrexx_payment_link, payrexx_payment_status, created_by_user_id, created_by_name, is_archived, archived_at, diagnosis_code, ref_icd10, collab_room_id, is_draft",
    )
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save consultation draft" },
      { status: 500 },
    );
  }

  return NextResponse.json({ draft: data });
}
