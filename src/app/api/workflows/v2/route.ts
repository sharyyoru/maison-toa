import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireWorkflowAdmin } from "@/lib/workflows/auth";
import { legacyNodesToGraph } from "@/lib/workflows/legacy";
import { validateWorkflowGraph } from "@/lib/workflows/validation";

export async function POST(request: Request) {
  const auth = await requireWorkflowAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json();
  const graph = legacyNodesToGraph(Array.isArray(body.nodes) ? body.nodes : []);
  const issues = validateWorkflowGraph(graph);
  if (body.publish && issues.length) return NextResponse.json({ error: "Invalid workflow", issues }, { status: 400 });
  const trigger = graph.nodes.find((node) => node.type === "trigger");
  if (!trigger || trigger.type !== "trigger") return NextResponse.json({ error: "Trigger required" }, { status: 400 });

  const { data: workflow, error } = await supabaseAdmin.from("workflows").insert({
    name: String(body.name || "New Workflow").trim(), trigger_type: trigger.data.triggerType,
    active: Boolean(body.active && body.publish), config: { nodes: body.nodes }, engine_version: 2,
    migration_status: body.publish ? "live" : "ready",
  }).select("id").single();
  if (error || !workflow) return NextResponse.json({ error: error?.message || "Could not create workflow" }, { status: 500 });

  const status = body.publish ? "published" : "draft";
  const { data: version, error: versionError } = await supabaseAdmin.from("workflow_versions").insert({
    workflow_id: workflow.id, version: 1, status, graph, created_by_user_id: auth.userId,
    published_at: body.publish ? new Date().toISOString() : null,
  }).select("id").single();
  if (versionError || !version) {
    await supabaseAdmin.from("workflows").delete().eq("id", workflow.id);
    return NextResponse.json({ error: versionError?.message || "Could not create version" }, { status: 500 });
  }
  await supabaseAdmin.from("workflows").update(body.publish ? { published_version_id: version.id } : { draft_version_id: version.id }).eq("id", workflow.id);
  return NextResponse.json({ id: workflow.id, versionId: version.id, status }, { status: 201 });
}
