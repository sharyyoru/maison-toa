"use client";

import { useEffect, useMemo, useState } from "react";
import type { ELK } from "elkjs/lib/elk-api";
import {
  Background,
  Controls,
  Edge,
  Handle,
  MarkerType,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export type BuilderCanvasNode = {
  id: string;
  type: "trigger" | "action" | "condition" | "delay" | "exit";
  data: Record<string, any>;
  nextNodeId?: string | null;
  trueBranchId?: string | null;
  falseBranchId?: string | null;
};

type CanvasData = Record<string, unknown> & {
  kind: BuilderCanvasNode["type"];
  title: string;
  description: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onAdd: (id: string, branch: "next" | "yes" | "no", type: "action" | "condition" | "delay" | "exit") => void;
  onDelete: (id: string) => void;
};

const palette = {
  trigger: { border: "#f59e0b", background: "#fffbeb", badge: "#92400e", label: "Trigger", icon: "⚡" },
  condition: { border: "#a855f7", background: "#faf5ff", badge: "#6b21a8", label: "Decision", icon: "⑂" },
  delay: { border: "#3b82f6", background: "#eff6ff", badge: "#1e40af", label: "Delay", icon: "◷" },
  action: { border: "#10b981", background: "#ecfdf5", badge: "#065f46", label: "Action", icon: "⚡" },
  exit: { border: "#64748b", background: "#f8fafc", badge: "#334155", label: "Exit", icon: "■" },
};

function AddStepMenu({ id, branch, compact, onAdd }: {
  id: string;
  branch: "next" | "yes" | "no";
  compact?: boolean;
  onAdd: CanvasData["onAdd"];
}) {
  const [open, setOpen] = useState(false);
  const branchColor = branch === "yes" ? "border-emerald-300 text-emerald-700" : branch === "no" ? "border-rose-300 text-rose-700" : "border-sky-400 text-sky-600";
  return (
    <div className="nodrag relative">
      <button type="button" className={`flex items-center justify-center border bg-white font-semibold shadow-sm hover:bg-slate-50 ${branchColor} ${compact ? "rounded-full px-2 py-1 text-[10px]" : "h-8 w-8 rounded-full border-2 border-dashed"}`} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}>
        {compact ? `+ ${branch.toUpperCase()}` : "+"}
      </button>
      {open && (
        <div className="absolute left-1/2 top-9 z-50 flex -translate-x-1/2 gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
          {(["action", "condition", "delay", "exit"] as const).map((type) => (
            <button key={type} type="button" className="whitespace-nowrap rounded px-2 py-1 text-[10px] font-medium capitalize text-slate-700 hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); onAdd(id, branch, type); setOpen(false); }}>{type === "condition" ? "Decision" : type}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowNodeCard({ id, data }: NodeProps<Node<CanvasData>>) {
  const colors = palette[data.kind];
  const isDecision = data.kind === "condition";
  const isExit = data.kind === "exit";
  return (
    <div
      onClick={() => data.onSelect(id)}
      className="relative w-[360px] cursor-pointer rounded-xl border-2 px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: data.selected ? "#0ea5e9" : colors.border, background: colors.background, boxShadow: data.selected ? "0 0 0 3px #bae6fd" : undefined }}
    >
      {data.kind !== "trigger" && <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400" />}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-xl shadow-sm">{colors.icon}</div>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.badge }}>{colors.label}</span>
          <div className="font-semibold text-slate-900">{data.title}</div>
          <div className="truncate text-xs text-slate-600">{data.description}</div>
        </div>
        {data.kind !== "trigger" && (
          <button type="button" className="nodrag rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500" onClick={(event) => { event.stopPropagation(); data.onDelete(id); }} aria-label="Delete step">×</button>
        )}
      </div>
      {!isExit && !isDecision && (
        <div className="absolute -bottom-4 left-1/2 z-10 -translate-x-1/2"><AddStepMenu id={id} branch="next" onAdd={data.onAdd} /></div>
      )}
      {!isExit && !isDecision && <Handle type="source" position={Position.Bottom} id="next" className="!h-2.5 !w-2.5 !border-2 !border-white !bg-sky-500" />}
      {isDecision && (
        <>
          <div className="absolute -bottom-4 left-1/4 z-10 -translate-x-1/2"><AddStepMenu id={id} branch="yes" compact onAdd={data.onAdd} /></div>
          <div className="absolute -bottom-4 right-1/4 z-10 translate-x-1/2"><AddStepMenu id={id} branch="no" compact onAdd={data.onAdd} /></div>
          <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "25%", background: "#10b981" }} />
          <Handle type="source" position={Position.Bottom} id="no" style={{ left: "75%", background: "#f43f5e" }} />
        </>
      )}
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNodeCard };
let elkPromise: Promise<ELK> | null = null;
function getElk() {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then(({ default: ElkConstructor }) => new ElkConstructor());
  return elkPromise;
}

function humanize(value?: string) {
  if (!value) return "Not configured";
  return value.replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function describe(node: BuilderCanvasNode) {
  if (node.type === "trigger") return { title: humanize(node.data.triggerType), description: "Workflow entry event" };
  if (node.type === "action") return { title: humanize(node.data.actionType), description: "Run configured action" };
  if (node.type === "delay") return { title: "Wait", description: `${node.data.delayValue ?? node.data.value ?? 1} ${node.data.delayType ?? node.data.unit ?? "hours"}` };
  if (node.type === "condition") {
    const field = node.data.field ?? node.data.expression?.field;
    return { title: node.data.label || "Yes / No Decision", description: field ? `${humanize(field)} ${humanize(node.data.operator ?? node.data.expression?.operator)}` : "Configure decision rules" };
  }
  return { title: "Exit Workflow", description: node.data.reason || "End this branch" };
}

function WorkflowCanvasInner({ nodes: sourceNodes, selectedNodeId, onSelect, onAdd, onDelete }: {
  nodes: BuilderCanvasNode[];
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  onAdd: CanvasData["onAdd"];
  onDelete: (id: string) => void;
}) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const edges = useMemo<Edge[]>(() => sourceNodes.flatMap((node) => {
    const candidates = [
      { target: node.nextNodeId, branch: "next" as const },
      { target: node.trueBranchId, branch: "yes" as const },
      { target: node.falseBranchId, branch: "no" as const },
    ];
    return candidates.filter((item) => item.target).map((item) => ({
      id: `${node.id}-${item.branch}-${item.target}`,
      source: node.id,
      target: item.target!,
      sourceHandle: item.branch,
      type: "smoothstep",
      label: item.branch === "next" ? undefined : item.branch.toUpperCase(),
      labelStyle: { fill: item.branch === "yes" ? "#047857" : "#be123c", fontWeight: 700, fontSize: 10 },
      style: { stroke: item.branch === "yes" ? "#10b981" : item.branch === "no" ? "#f43f5e" : "#94a3b8", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: item.branch === "yes" ? "#10b981" : item.branch === "no" ? "#f43f5e" : "#94a3b8" },
    }));
  }), [sourceNodes]);

  useEffect(() => {
    let cancelled = false;
    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.spacing.nodeNode": "70",
        "elk.layered.spacing.nodeNodeBetweenLayers": "90",
        "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      },
      children: sourceNodes.map((node) => ({ id: node.id, width: 360, height: 92 })),
      edges: edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    };
    getElk().then((elk) => elk.layout(graph)).then((layout) => {
      if (cancelled) return;
      setPositions(Object.fromEntries((layout.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }])));
    });
    return () => { cancelled = true; };
  }, [sourceNodes, edges]);

  const nodes = useMemo<Node<CanvasData>[]>(() => sourceNodes.map((node) => ({
    id: node.id,
    type: "workflow",
    position: positions[node.id] ?? { x: 0, y: 0 },
    draggable: false,
    selectable: true,
    data: { kind: node.type, ...describe(node), selected: selectedNodeId === node.id, onSelect, onAdd, onDelete },
  })), [sourceNodes, positions, selectedNodeId, onSelect, onAdd, onDelete]);

  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.25 }} nodesConnectable={false} nodesDraggable={false} elementsSelectable minZoom={0.25} maxZoom={1.5} proOptions={{ hideAttribution: false }}>
      <Background gap={20} size={1} color="#e2e8f0" />
      <MiniMap pannable zoomable nodeColor={(node) => palette[(node.data as CanvasData).kind].border} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function WorkflowCanvas(props: Parameters<typeof WorkflowCanvasInner>[0]) {
  return <ReactFlowProvider><WorkflowCanvasInner {...props} /></ReactFlowProvider>;
}
