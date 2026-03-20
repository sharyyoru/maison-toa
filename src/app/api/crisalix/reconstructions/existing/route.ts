import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  let patientId: string | null = null;
  let reconstructionType: string | null = null;

  try {
    const body = (await request.json()) as {
      patientId?: string | null;
      reconstructionType?: string | null;
    };
    patientId = body.patientId ?? null;
    reconstructionType = body.reconstructionType ?? null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!patientId || !reconstructionType) {
    return NextResponse.json(
      { error: "Missing patientId or reconstructionType" },
      { status: 400 },
    );
  }

  const type = reconstructionType.toLowerCase();
  if (type !== "breast" && type !== "face" && type !== "body") {
    return NextResponse.json({ exists: false });
  }

  try {
    const { data } = await supabaseAdmin
      .from("crisalix_reconstructions")
      .select("player_id, crisalix_patient_id, created_at")
      .eq("patient_id", patientId)
      .eq("reconstruction_type", type)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data || !data.player_id) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({ exists: true, playerId: data.player_id });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
