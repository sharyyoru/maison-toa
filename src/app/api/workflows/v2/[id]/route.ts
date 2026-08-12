import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireWorkflowAdmin } from "@/lib/workflows/auth";
import { graphToLegacyNodes, legacyNodesToGraph } from "@/lib/workflows/legacy";
import { validateWorkflowGraph } from "@/lib/workflows/validation";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { configWithFlattenedTrigger } from "@/lib/workflows/legacyConfig";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkflowAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const { data: workflow, error } = await supabaseAdmin.from("workflows").select("*").eq("id", id).maybeSingle();
  if (error || !workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (workflow.engine_version === 2 && (workflow.draft_version_id || workflow.published_version_id)) {
    const versionId = workflow.draft_version_id || workflow.published_version_id;
    const { data: version } = await supabaseAdmin.from("workflow_versions").select("id, version, status, graph").eq("id", versionId).single();
    if (version) return NextResponse.json({ ...workflow, version, nodes: graphToLegacyNodes(version.graph as WorkflowGraph) });
  }
  return NextResponse.json({ ...workflow, nodes: workflow.config?.nodes || [] });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkflowAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await request.json();
  const graph = legacyNodesToGraph(Array.isArray(body.nodes) ? body.nodes : []);
  const issues = validateWorkflowGraph(graph);
  if (body.publish && issues.length) return NextResponse.json({ error: "Invalid workflow", issues }, { status: 400 });
  const trigger = graph.nodes.find((node) => node.type === "trigger");
  if (!trigger || trigger.type !== "trigger") return NextResponse.json({ error: "Trigger required" }, { status: 400 });
  const { data: workflow } = await supabaseAdmin.from("workflows").select("id, draft_version_id, published_version_id").eq("id", id).maybeSingle();
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

  let versionId = workflow.draft_version_id as string | null;
  if (versionId) {
    const { error } = await supabaseAdmin.from("workflow_versions").update({ graph, created_by_user_id: auth.userId }).eq("id", versionId).eq("status", "draft");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: latest } = await supabaseAdmin.from("workflow_versions").select("version").eq("workflow_id", id).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: draft, error } = await supabaseAdmin.from("workflow_versions").insert({ workflow_id: id, version: (latest?.version || 0) + 1, status: "draft", graph, created_by_user_id: auth.userId }).select("id").single();
    if (error || !draft) return NextResponse.json({ error: error?.message || "Could not create draft" }, { status: 500 });
    versionId = draft.id;
  }

  const update: Record<string, unknown> = {
    name: String(body.name || "Workflow").trim(), trigger_type: trigger.data.triggerType,
    config: configWithFlattenedTrigger(body.nodes, trigger.data.triggerType), engine_version: 2, draft_version_id: versionId,
    migration_status: "ready", updated_at: new Date().toISOString(),
  };
  if (body.publish) {
    if (workflow.published_version_id) await supabaseAdmin.from("workflow_versions").update({ status: "archived" }).eq("id", workflow.published_version_id);
    await supabaseAdmin.from("workflow_versions").update({ status: "published", published_at: new Date().toISOString() }).eq("id", versionId);
    Object.assign(update, { published_version_id: versionId, draft_version_id: null, active: Boolean(body.active), migration_status: "live" });
  }
  const { error } = await supabaseAdmin.from("workflows").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id, versionId, status: body.publish ? "published" : "draft" });
}
