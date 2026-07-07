import { NextRequest, NextResponse } from "next/server";
import { Liveblocks } from "@liveblocks/node";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const roomPattern = /^patient:([0-9a-fA-F-]{36}):consultation(?:-create|:([0-9a-fA-F-]{36}))$/;

function userName(user: { email?: string | null; user_metadata?: Record<string, any> | null }) {
  return (
    user.user_metadata?.full_name ||
    [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ") ||
    user.email ||
    "User"
  );
}

async function logLiveblocksEvent(params: {
  patientId: string;
  consultationId?: string | null;
  room: string;
  eventType: string;
  user?: { id: string; email?: string | null; user_metadata?: Record<string, any> | null } | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("consultation_note_events").insert({
    patient_id: params.patientId,
    consultation_id: params.consultationId ?? null,
    collab_room_id: params.room,
    event_type: params.eventType,
    actor_user_id: params.user?.id ?? null,
    actor_name: params.user ? userName(params.user) : null,
    actor_email: params.user?.email ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) console.error("[consultation-note-events] insert failed", error.message);
}

export async function POST(request: NextRequest) {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Liveblocks is not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return NextResponse.json({ error: "Missing Supabase access token" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const room = typeof body?.room === "string" ? body.room : "";
  const roomMatch = room.match(roomPattern);
  if (!roomMatch) {
    return NextResponse.json({ error: "Invalid room" }, { status: 403 });
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    await logLiveblocksEvent({
      patientId: roomMatch[1],
      consultationId: roomMatch[2] ?? null,
      room,
      eventType: "liveblocks_auth_denied",
      metadata: { reason: "invalid_supabase_token" },
    });
    return NextResponse.json({ error: "Invalid Supabase access token" }, { status: 401 });
  }

  const liveblocks = new Liveblocks({ secret });
  const session = liveblocks.prepareSession(user.id, {
    userInfo: {
      name:
        user.user_metadata?.full_name ||
        [user.user_metadata?.first_name, user.user_metadata?.last_name]
          .filter(Boolean)
          .join(" ") ||
        user.email ||
        "User",
      email: user.email ?? null,
    },
  });

  session.allow(room, session.FULL_ACCESS);
  const { body: responseBody, status } = await session.authorize();

  await logLiveblocksEvent({
    patientId: roomMatch[1],
    consultationId: roomMatch[2] ?? null,
    room,
    eventType: status >= 200 && status < 300 ? "liveblocks_auth_allowed" : "liveblocks_auth_denied",
    user,
    metadata: { status },
  });

  return new NextResponse(responseBody, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
