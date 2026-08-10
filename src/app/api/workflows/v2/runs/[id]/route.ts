import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireWorkflowAdmin } from "@/lib/workflows/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkflowAdmin(request); if (auth instanceof NextResponse) return auth;
  const { id } = await params; const { action } = await request.json();
  if (action === "cancel") {
    await supabaseAdmin.from("workflow_jobs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("run_id", id).in("status", ["pending", "failed", "running"]);
    const { error } = await supabaseAdmin.from("workflow_runs_v2").update({ status: "cancelled", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (action === "retry") {
    const { data: job } = await supabaseAdmin.from("workflow_jobs").select("id").eq("run_id", id).eq("status", "failed").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!job) return NextResponse.json({ error: "No failed job found" }, { status: 409 });
    await supabaseAdmin.from("workflow_jobs").update({ status: "pending", attempts: 0, available_at: new Date().toISOString(), last_error: null, locked_at: null, locked_by: null }).eq("id", job.id);
    await supabaseAdmin.from("workflow_runs_v2").update({ status: "running", error_message: null, completed_at: null, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Action must be cancel or retry" }, { status: 400 });
}

