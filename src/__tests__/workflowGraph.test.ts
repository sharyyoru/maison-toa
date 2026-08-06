import assert from "node:assert/strict";
import { addWorkflowDelay } from "../lib/workflows/delay";
import { legacyNodesToGraph } from "../lib/workflows/legacy";
import { validateWorkflowGraph } from "../lib/workflows/validation";

const graph = legacyNodesToGraph([
  { id: "trigger", type: "trigger", data: { triggerType: "appointment_completed", config: {} }, nextNodeId: "condition" },
  { id: "condition", type: "condition", data: { field: "patient.email", operator: "is_not_empty", value: "" }, nextNodeId: "email" },
  { id: "email", type: "action", data: { actionType: "send_email", config: { classification: "marketing" } } },
]);
assert.deepEqual(validateWorkflowGraph(graph), []);
assert.ok(graph.edges.some((edge) => edge.source === "condition" && edge.branch === "no"));
assert.ok(graph.nodes.some((node) => node.type === "exit"));

const invalid = structuredClone(graph);
invalid.edges = invalid.edges.filter((edge) => edge.branch !== "no");
assert.ok(validateWorkflowGraph(invalid).some((issue) => issue.code === "condition_branches"));

assert.equal(addWorkflowDelay(new Date("2026-01-31T09:00:00Z"), { value: 1, unit: "months" }).toISOString(), "2026-02-28T09:00:00.000Z");
assert.equal(addWorkflowDelay(new Date("2026-03-20T09:00:00Z"), { value: 2, unit: "weeks" }).toISOString(), "2026-04-03T09:00:00.000Z");

console.log("workflowGraph.test.ts: all assertions passed");
