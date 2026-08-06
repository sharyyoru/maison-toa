import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireWorkflowAdmin } from "@/lib/workflows/auth";

export async function POST(request: Request) {
  const auth = await requireWorkflowAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { workflowId, newName } = await request.json() as { workflowId?: string; newName?: string };
  if (!workflowId) return NextResponse.json({ error: "workflowId is required" }, { status: 400 });
  const { data: original } = await supabaseAdmin.from("workflows").select("*").eq("id", workflowId).maybeSingle();
  if (!original) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  const { data: copy, error } = await supabaseAdmin.from("workflows").insert({ name: newName || `${original.name} (Copy)`, trigger_type: original.trigger_type, active: false, config: original.config, engine_version: original.engine_version || 1, migration_status: original.engine_version === 2 ? "ready" : "legacy" }).select("*").single();
  if (error || !copy) return NextResponse.json({ error: error?.message || "Could not duplicate workflow" }, { status: 500 });
  if (original.engine_version === 2 && (original.draft_version_id || original.published_version_id)) {
    const { data: sourceVersion } = await supabaseAdmin.from("workflow_versions").select("graph").eq("id", original.draft_version_id || original.published_version_id).single();
    const { data: draft, error: draftError } = await supabaseAdmin.from("workflow_versions").insert({ workflow_id: copy.id, version: 1, status: "draft", graph: sourceVersion?.graph || { schemaVersion: 2, nodes: [], edges: [] }, created_by_user_id: auth.userId }).select("id").single();
    if (draftError || !draft) { await supabaseAdmin.from("workflows").delete().eq("id", copy.id); return NextResponse.json({ error: draftError?.message || "Could not duplicate version" }, { status: 500 }); }
    await supabaseAdmin.from("workflows").update({ draft_version_id: draft.id }).eq("id", copy.id);
  }
  return NextResponse.json({ workflow: copy }, { status: 201 });
}
