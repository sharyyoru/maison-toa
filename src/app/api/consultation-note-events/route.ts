import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  const trimmed = text(value).trim();
  return trimmed ? trimmed : null;
}

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { user: null, error: "Missing Supabase access token" };

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) return { user: null, error: "Invalid Supabase access token" };
  return { user, error: null };
}

function userName(user: NonNullable<Awaited<ReturnType<typeof getUserFromRequest>>["user"]>) {
  return (
    user.user_metadata?.full_name ||
    [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ") ||
    user.email ||
    "User"
  );
}

export async function GET(request: NextRequest) {
  const { user, error: authError } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: authError }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patientId") ?? "";
  const consultationId = searchParams.get("consultationId") ?? "";

  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("consultation_note_events")
    .select("id, patient_id, consultation_id, collab_room_id, event_type, actor_user_id, actor_name, actor_email, client_id, request_id, metadata, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (consultationId) query = query.eq("consultation_id", consultationId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, error: authError } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: authError }, { status: 401 });

  const body = await request.json().catch(() => null);
  const patientId = text(body?.patientId);
  const eventType = text(body?.eventType);

  if (!patientId || !eventType) {
    return NextResponse.json({ error: "Missing patientId or eventType" }, { status: 400 });
  }

  const metadata =
    body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata
      : {};

  const { error } = await supabaseAdmin.from("consultation_note_events").insert({
    patient_id: patientId,
    consultation_id: nullableText(body?.consultationId),
    collab_room_id: nullableText(body?.collabRoomId),
    event_type: eventType,
    actor_user_id: user.id,
    actor_name: userName(user),
    actor_email: user.email ?? null,
    client_id: nullableText(body?.clientId),
    request_id: nullableText(body?.requestId),
    metadata,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
