import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  let body: {
    patientId?: string | null;
    reconstructionType?: string | null;
    playerId?: string | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patientId = body.patientId ?? null;
  const reconstructionTypeRaw = (body.reconstructionType ?? "").toString().trim().toLowerCase();
  const playerId = (body.playerId ?? "").toString().trim();

  if (!patientId || !reconstructionTypeRaw || !playerId) {
    return NextResponse.json(
      { error: "Missing patientId, reconstructionType, or playerId" },
      { status: 400 },
    );
  }

  if (
    reconstructionTypeRaw !== "breast" &&
    reconstructionTypeRaw !== "face" &&
    reconstructionTypeRaw !== "body"
  ) {
    return NextResponse.json({ error: "Invalid reconstructionType" }, { status: 400 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const consultationId = `3D-${now.getTime().toString(36).toUpperCase()}`;

  const prettyType =
    reconstructionTypeRaw === "breast"
      ? "Breast"
      : reconstructionTypeRaw === "face"
        ? "Face"
        : "Body";

  const title = `3D ${prettyType} reconstruction`;

  const contentPayload = {
    reconstruction_type: reconstructionTypeRaw,
    player_id: playerId,
    created_at: nowIso,
  } as const;

  try {
    const { data, error } = await supabaseAdmin
      .from("consultations")
      .insert({
        patient_id: patientId,
        consultation_id: consultationId,
        title,
        record_type: "3d",
        doctor_user_id: null,
        doctor_name: "Aesthetics 3D",
        scheduled_at: nowIso,
        payment_method: null,
        content: JSON.stringify(contentPayload),
        duration_seconds: 0,
        created_by_user_id: null,
        created_by_name: "System",
        is_archived: false,
        archived_at: null,
      })
      .select(
        "id, patient_id, consultation_id, title, content, record_type, doctor_user_id, doctor_name, scheduled_at, payment_method, duration_seconds, invoice_total_amount, invoice_is_complimentary, invoice_is_paid, cash_receipt_path, created_by_user_id, created_by_name, is_archived, archived_at",
      )
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to create 3D consultation" },
        { status: 500 },
      );
    }

    return NextResponse.json({ consultation: data });
  } catch {
    return NextResponse.json(
      { error: "Unexpected error while creating 3D consultation" },
      { status: 500 },
    );
  }
}
