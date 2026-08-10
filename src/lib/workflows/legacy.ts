import type { ConditionExpression, WorkflowGraph, WorkflowGraphNode, WorkflowGraphEdge } from "./types";

export type LegacyWorkflowNode = {
  id: string;
  type: "trigger" | "condition" | "delay" | "action" | "exit";
  data: Record<string, any>;
  nextNodeId?: string | null;
  trueBranchId?: string | null;
  falseBranchId?: string | null;
};

function expressionFromLegacy(data: Record<string, any>): ConditionExpression {
  if (data.expression) return data.expression as ConditionExpression;
  return { kind: "rule", field: data.field || "patient.email", operator: data.operator || "is_not_empty", value: data.value };
}

export function legacyNodesToGraph(source: LegacyWorkflowNode[]): WorkflowGraph {
  const nodes: WorkflowGraphNode[] = source.map((node) => {
    if (node.type === "trigger") return { id: node.id, type: "trigger", data: { triggerType: node.data.triggerType, config: node.data.config || {} } } as WorkflowGraphNode;
    if (node.type === "condition") return { id: node.id, type: "condition", data: { expression: expressionFromLegacy(node.data), label: node.data.label } };
    if (node.type === "delay") return { id: node.id, type: "delay", data: { value: node.data.delayValue ?? node.data.value ?? 1, unit: node.data.delayType ?? node.data.unit ?? "hours", anchor: node.data.delayAnchor ?? node.data.anchor ?? "reached_at" } };
    if (node.type === "exit") return { id: node.id, type: "exit", data: { reason: node.data.reason } };
    return { id: node.id, type: "action", data: { actionType: node.data.actionType, config: node.data.config || {} } } as WorkflowGraphNode;
  });
  const edges: WorkflowGraphEdge[] = [];
  for (const node of source) {
    const links = node.type === "condition"
      ? [{ target: node.trueBranchId || node.nextNodeId, branch: "yes" as const }, { target: node.falseBranchId, branch: "no" as const }]
      : [{ target: node.nextNodeId, branch: "next" as const }];
    for (const link of links) if (link.target) edges.push({ id: `${node.id}-${link.branch}-${link.target}`, source: node.id, target: link.target, branch: link.branch });
  }
  // A legacy condition was a filter rather than a visible decision. Preserve that behavior with an explicit No exit.
  for (const condition of nodes.filter((node) => node.type === "condition")) {
    if (!edges.some((edge) => edge.source === condition.id && edge.branch === "no")) {
      const exitId = `${condition.id}_no_exit`;
      nodes.push({ id: exitId, type: "exit", data: { reason: "Condition did not match" } });
      edges.push({ id: `${condition.id}-no-${exitId}`, source: condition.id, target: exitId, branch: "no" });
    }
  }
  for (const node of [...nodes]) {
    if (node.type === "exit" || node.type === "condition" || edges.some((edge) => edge.source === node.id)) continue;
    const exitId = `${node.id}_exit`;
    nodes.push({ id: exitId, type: "exit", data: { reason: "Workflow completed" } });
    edges.push({ id: `${node.id}-next-${exitId}`, source: node.id, target: exitId, branch: "next" });
  }
  return { schemaVersion: 2, nodes, edges };
}

export function graphToLegacyNodes(graph: WorkflowGraph): LegacyWorkflowNode[] {
  return graph.nodes.map((node) => {
    const outgoing = graph.edges.filter((edge) => edge.source === node.id);
    let data: Record<string, any>;
    if (node.type === "condition") {
      const rule = node.data.expression.kind === "rule" ? node.data.expression : undefined;
      data = { expression: node.data.expression, label: node.data.label, field: rule?.field, operator: rule?.operator, value: rule?.value ?? "" };
    } else if (node.type === "delay") data = { delayValue: node.data.value, delayType: node.data.unit, delayAnchor: node.data.anchor };
    else if (node.type === "trigger") data = { triggerType: node.data.triggerType, config: node.data.config };
    else if (node.type === "action") data = { actionType: node.data.actionType, config: node.data.config };
    else data = { reason: node.data.reason };
    return {
      id: node.id, type: node.type, data,
      nextNodeId: outgoing.find((edge) => edge.branch === "next")?.target,
      trueBranchId: outgoing.find((edge) => edge.branch === "yes")?.target,
      falseBranchId: outgoing.find((edge) => edge.branch === "no")?.target,
    };
  });
}
