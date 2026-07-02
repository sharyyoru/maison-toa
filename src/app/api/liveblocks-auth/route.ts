import { NextRequest, NextResponse } from "next/server";
import { Liveblocks } from "@liveblocks/node";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const roomPattern = /^patient:([0-9a-fA-F-]{36}):consultation(?:-create|:([0-9a-fA-F-]{36}))$/;

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
  if (!roomPattern.test(room)) {
    return NextResponse.json({ error: "Invalid room" }, { status: 403 });
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
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

  return new NextResponse(responseBody, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
