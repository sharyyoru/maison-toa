import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { legacyNodesToGraph, type LegacyWorkflowNode } from "../src/lib/workflows/legacy";
import { validateWorkflowGraph } from "../src/lib/workflows/validation";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const supportedActions = new Set(["send_email", "create_task", "add_internal_note", "add_tag", "remove_tag", "update_patient_property", "notify_staff", "send_notification", "stop_workflow"]);

async function main() {
  const { data: workflows, error } = await supabase.from("workflows").select("id, config, engine_version").order("created_at");
  if (error) throw error;
  let migrated = 0; let needsReview = 0;
  for (const workflow of workflows || []) {
    if (workflow.engine_version === 2) continue;
    const source = ((workflow.config as { nodes?: LegacyWorkflowNode[] } | null)?.nodes || []);
    const graph = legacyNodesToGraph(source);
    const issues = validateWorkflowGraph(graph);
    const unsupported = graph.nodes.filter((node) => node.type === "action" && !supportedActions.has(node.data.actionType));
    const status = issues.length || unsupported.length ? "needs_review" : "shadow";
    const { data: version, error: versionError } = await supabase.from("workflow_versions").insert({ workflow_id: workflow.id, version: 1, status: status === "shadow" ? "published" : "draft", graph, published_at: status === "shadow" ? new Date().toISOString() : null }).select("id").single();
    if (versionError) throw versionError;
    const update = status === "shadow"
      ? { engine_version: 2, migration_status: "shadow", published_version_id: version.id }
      : { engine_version: 2, migration_status: "needs_review", draft_version_id: version.id };
    const { error: updateError } = await supabase.from("workflows").update(update).eq("id", workflow.id); if (updateError) throw updateError;
    if (status === "shadow") migrated++; else needsReview++;
  }
  console.log(JSON.stringify({ migrated, needsReview }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
