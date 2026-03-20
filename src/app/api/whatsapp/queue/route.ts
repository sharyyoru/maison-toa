import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * Enqueue a WhatsApp message to be sent via a user's WhatsApp Web session.
 * The queue processor on the WhatsApp server will pick it up and send it.
 */
export async function POST(request: Request) {
  try {
    // Get the authenticated user from the Authorization header
    const authHeader = request.headers.get("authorization");
    let senderUserId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user } } = await createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ).auth.getUser(token);
      senderUserId = user?.id ?? null;
    }

    const body = await request.json() as {
      senderUserId?: string;
      toPhone?: string;
      to?: string;
      messageBody?: string;
      message?: string;
      body?: string;
      patientId?: string | null;
      dealId?: string | null;
      workflowId?: string | null;
      enrollmentId?: string | null;
      scheduledAt?: string | null;
    };

    // Allow explicit senderUserId override (for server-to-server calls)
    const effectiveSender = body.senderUserId || senderUserId;
    if (!effectiveSender) {
      return NextResponse.json(
        { error: "Could not determine sender user ID. Please authenticate." },
        { status: 401 },
      );
    }

    const toPhone = (body.toPhone || body.to || "").trim();
    const messageText = (body.messageBody || body.message || body.body || "").trim();

    if (!toPhone) {
      return NextResponse.json(
        { error: "Missing required field: toPhone" },
        { status: 400 },
      );
    }

    if (!messageText) {
      return NextResponse.json(
        { error: "Missing required field: messageBody" },
        { status: 400 },
      );
    }

    const scheduledAt = body.scheduledAt
      ? new Date(body.scheduledAt).toISOString()
      : new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("whatsapp_queue")
      .insert({
        sender_user_id: effectiveSender,
        to_phone: toPhone,
        message_body: messageText,
        patient_id: body.patientId || null,
        deal_id: body.dealId || null,
        workflow_id: body.workflowId || null,
        enrollment_id: body.enrollmentId || null,
        status: "pending",
        scheduled_at: scheduledAt,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Failed to enqueue WhatsApp message:", error);
      return NextResponse.json(
        { error: "Failed to enqueue message" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: (data as { id: string }).id,
      status: "queued",
    });
  } catch (err) {
    console.error("Unexpected error in /api/whatsapp/queue:", err);
    return NextResponse.json(
      { error: "Unexpected error enqueuing message" },
      { status: 500 },
    );
  }
}

/**
 * GET: Fetch WhatsApp queue items for the authenticated user.
 * Pulls directly from whatsapp_queue in Supabase (your DB).
 * Used by the WhatsApp panel notifications tab.
 */
export async function GET(request: NextRequest) {
  try {
    // Try Authorization header first, then fall back to cookie-based auth
    const authHeader = request.headers.get("authorization");
    let senderUserId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const { data: { user } } = await createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        ).auth.getUser(token);
        senderUserId = user?.id ?? null;
      } catch (authErr) {
        console.error("WhatsApp queue GET: auth error:", authErr);
      }
    }

    if (!senderUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const statusFilter = searchParams.get("status"); // null = all non-sent
    const limit = parseInt(searchParams.get("limit") || "50");

    // Fetch WhatsApp queue items from Supabase
    // Use a simple select first, then enrich with patient/deal data
    const { data: items, error } = await supabaseAdmin
      .from("whatsapp_queue")
      .select("*")
      .eq("sender_user_id", senderUserId)
      .in("status", statusFilter
        ? [statusFilter]
        : ["pending", "sending", "failed", "session_failed"])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch WhatsApp queue:", error);
      return NextResponse.json({ error: "Failed to fetch queue", details: error.message }, { status: 500 });
    }

    // Enrich with patient and deal names
    const enriched = await Promise.all((items || []).map(async (item) => {
      let patient = null;
      let deal = null;
      let workflow = null;

      if (item.patient_id) {
        const { data } = await supabaseAdmin
          .from("patients")
          .select("id, first_name, last_name, phone")
          .eq("id", item.patient_id)
          .single();
        patient = data;
      }
      if (item.deal_id) {
        const { data } = await supabaseAdmin
          .from("deals")
          .select("id, name")
          .eq("id", item.deal_id)
          .single();
        deal = data;
      }
      if (item.workflow_id) {
        const { data } = await supabaseAdmin
          .from("workflows")
          .select("id, name")
          .eq("id", item.workflow_id)
          .single();
        workflow = data;
      }

      return { ...item, patient, deal, workflow };
    }));

    return NextResponse.json({ items: enriched });
  } catch (err: any) {
    console.error("WhatsApp queue GET error:", err?.message || err);
    return NextResponse.json({ error: "Internal server error", details: err?.message }, { status: 500 });
  }
}

/**
 * PATCH: Retry failed/session_failed queue items.
 * Body: { id?: string, retryAll?: boolean }
 * - id: retry a single item
 * - retryAll: retry all session_failed + failed items for this user
 */
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    let senderUserId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const { data: { user } } = await createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        ).auth.getUser(token);
        senderUserId = user?.id ?? null;
      } catch { /* ignore */ }
    }

    if (!senderUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as { id?: string; retryAll?: boolean };

    if (body.retryAll) {
      // Retry all failed/session_failed items for this user
      const { data, error } = await supabaseAdmin
        .from("whatsapp_queue")
        .update({
          status: "pending",
          scheduled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("sender_user_id", senderUserId)
        .in("status", ["failed", "session_failed"])
        .select("id");

      if (error) {
        return NextResponse.json({ error: "Failed to retry", details: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, retried: data?.length || 0 });
    }

    if (body.id) {
      // Retry a single item
      const { error } = await supabaseAdmin
        .from("whatsapp_queue")
        .update({
          status: "pending",
          scheduled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", body.id)
        .eq("sender_user_id", senderUserId)
        .in("status", ["failed", "session_failed"]);

      if (error) {
        return NextResponse.json({ error: "Failed to retry", details: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, retried: 1 });
    }

    return NextResponse.json({ error: "Provide id or retryAll" }, { status: 400 });
  } catch (err: any) {
    console.error("WhatsApp queue PATCH error:", err?.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
