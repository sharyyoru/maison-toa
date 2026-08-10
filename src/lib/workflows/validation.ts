import type { ConditionExpression, WorkflowGraph, WorkflowGraphEdge } from "./types";

export type WorkflowValidationIssue = {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

function validateExpression(expression: ConditionExpression, nodeId: string, issues: WorkflowValidationIssue[]) {
  if (expression.kind === "rule") {
    if (!expression.field || !expression.operator) issues.push({ code: "invalid_rule", message: "Condition rules require a field and operator.", nodeId });
    return;
  }
  if (expression.kind === "not") return validateExpression(expression.child, nodeId, issues);
  if (expression.children.length === 0) issues.push({ code: "empty_group", message: "Condition groups must contain at least one rule.", nodeId });
  expression.children.forEach((child) => validateExpression(child, nodeId, issues));
}

export function validateWorkflowGraph(graph: WorkflowGraph): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) issues.push({ code: "duplicate_node", message: `Duplicate node id: ${node.id}`, nodeId: node.id });
    nodeIds.add(node.id);
    if (node.type === "condition") validateExpression(node.data.expression, node.id, issues);
    if (node.type === "delay" && (!Number.isFinite(node.data.value) || node.data.value <= 0)) {
      issues.push({ code: "invalid_delay", message: "Delay must be greater than zero.", nodeId: node.id });
    }
  }

  const triggers = graph.nodes.filter((node) => node.type === "trigger");
  if (triggers.length !== 1) issues.push({ code: "trigger_count", message: "A workflow must have exactly one trigger." });

  const outgoing = new Map<string, WorkflowGraphEdge[]>();
  const incoming = new Map<string, WorkflowGraphEdge[]>();
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ code: "dangling_edge", message: "Edge references a missing node.", edgeId: edge.id });
      continue;
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  }

  for (const node of graph.nodes) {
    const edges = outgoing.get(node.id) ?? [];
    if (node.type === "exit" && edges.length) issues.push({ code: "exit_has_edge", message: "Exit nodes cannot have outgoing connections.", nodeId: node.id });
    if (node.type === "condition") {
      const branches = new Set(edges.map((edge) => edge.branch));
      if (edges.length !== 2 || !branches.has("yes") || !branches.has("no")) {
        issues.push({ code: "condition_branches", message: "Conditions require one Yes and one No branch.", nodeId: node.id });
      }
    } else if (node.type !== "exit" && edges.length !== 1) {
      issues.push({ code: "next_edge", message: "This node requires exactly one Next connection.", nodeId: node.id });
    }
    if (node.type !== "trigger" && !(incoming.get(node.id)?.length)) issues.push({ code: "unreachable", message: "Node is not connected to the workflow.", nodeId: node.id });
  }

  const trigger = triggers[0];
  if (trigger) {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) { issues.push({ code: "cycle", message: "Workflow graphs cannot contain cycles.", nodeId: id }); return; }
      if (visited.has(id)) return;
      visiting.add(id);
      (outgoing.get(id) ?? []).forEach((edge) => visit(edge.target));
      visiting.delete(id);
      visited.add(id);
    };
    visit(trigger.id);
    graph.nodes.filter((node) => !visited.has(node.id)).forEach((node) => issues.push({ code: "unreachable", message: "Node cannot be reached from the trigger.", nodeId: node.id }));
  }

  return issues.filter((issue, index, all) => index === all.findIndex((other) => other.code === issue.code && other.nodeId === issue.nodeId && other.edgeId === issue.edgeId));
}

