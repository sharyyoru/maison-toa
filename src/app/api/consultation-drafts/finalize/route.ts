import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  const draftId = text(body?.draftId);
  const patientId = text(body?.patientId);

  if (!draftId || !patientId) {
    return NextResponse.json({ error: "Missing draft or patient" }, { status: 400 });
  }

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
      collab_room_id: null,
    })
    .eq("id", draftId)
    .eq("patient_id", patientId)
    .select(
      "id, patient_id, consultation_id, title, content, record_type, doctor_user_id, doctor_name, scheduled_at, payment_method, duration_seconds, invoice_total_amount, invoice_is_complimentary, invoice_is_paid, invoice_status, invoice_paid_amount, cash_receipt_path, invoice_pdf_path, payment_link_token, payrexx_payment_link, payrexx_payment_status, created_by_user_id, created_by_name, is_archived, archived_at, diagnosis_code, ref_icd10, collab_room_id, is_draft",
    )
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to finalize consultation draft" },
      { status: 500 },
    );
  }

  return NextResponse.json({ consultation: data });
}
