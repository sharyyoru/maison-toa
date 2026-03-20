"use client";

import { useState, useCallback, useRef } from "react";
import { CANTON_TAX_POINT_VALUES, type SwissCanton } from "@/lib/tardoc";

type FlatChapter = { code: string; name: string };

type TreeNode = {
  code: string;
  name: string;
  expanded: boolean;
  loading: boolean;
  services: any[] | null; // null = not loaded, [] = loaded but empty
};

type TardocAccordionTreeProps = {
  canton: SwissCanton;
  onAddService: (svc: any) => void;
};

// ─── Hierarchy helpers ───────────────────────────────────────────────────────
// TARDOC codes follow this pattern:
//   Level 0 (main):   single letter          → A, C, E, G, J / K, M, P, R, T, V, W
//   Level 1 (sub):    two letters             → AA, AG, AK, CA, CG
//   Level 2 (group):  two letters.two digits  → AA.00, AA.05, AG.01
//   Level 3 (service): full code              → AA.00.0010, AA.05.0020

function getDirectChildren(allChapters: FlatChapter[], parentCode: string): FlatChapter[] {
  const seen = new Set<string>();
  const results: FlatChapter[] = [];

  for (const ch of allChapters) {
    if (ch.code === parentCode || seen.has(ch.code)) continue;
    let isChild = false;

    if (parentCode === "") {
      // Root: pick single-letter codes (A, C, E, G, M, P, R, T, V, W)
      // Also handle multi-char main chapters like "J / K"
      isChild = ch.code.length === 1 || /^[A-Z]\s*\/\s*[A-Z]$/.test(ch.code);
    } else if (parentCode.length === 1) {
      // Main chapter (A) → sub-chapters (AA, AG, AK): 2-letter, starts with parent, no dot
      isChild = ch.code.length === 2 && !ch.code.includes(".") && ch.code[0] === parentCode;
    } else if (/^[A-Z]\s*\/\s*[A-Z]$/.test(parentCode)) {
      // Special main chapter like "J / K" → sub-chapters starting with J or K
      const letters = parentCode.replace(/\s/g, "").split("/");
      isChild = ch.code.length === 2 && !ch.code.includes(".") && letters.includes(ch.code[0]);
    } else if (ch.code.length === 2 && !parentCode.includes(".")) {
      // This shouldn't match — parentCode is 2 letters, child is also 2 letters
      isChild = false;
    } else if (!parentCode.includes(".") && parentCode.length === 2) {
      // Sub-chapter (AA) → service groups (AA.00, AA.05): starts with "AA.", one dot only
      isChild = ch.code.startsWith(parentCode + ".") && ch.code.indexOf(".", parentCode.length + 1) === -1;
    }

    if (isChild) {
      seen.add(ch.code);
      results.push(ch);
    }
  }

  return results;
}

function isServiceGroup(code: string): boolean {
  // Service groups have format XX.YY (exactly one dot, e.g. AA.00, AA.05)
  return code.includes(".") && code.split(".").length === 2;
}

export default function TardocAccordionTree({ canton, onAddService }: TardocAccordionTreeProps) {
  // Flat chapter cache — loaded once
  const allChaptersRef = useRef<FlatChapter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Tree state: map of code → TreeNode
  const [nodes, setNodes] = useState<Map<string, TreeNode>>(new Map());
  // Root codes (level 0)
  const [rootCodes, setRootCodes] = useState<string[]>([]);

  const tpv = CANTON_TAX_POINT_VALUES[canton] ?? 0.96;

  const loadCatalog = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tardoc/sumex?action=chapters&parent=");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const flat: FlatChapter[] = json.data;
        allChaptersRef.current = flat;

        // Build root nodes (single-letter main chapters)
        const roots = getDirectChildren(flat, "");
        const nodeMap = new Map<string, TreeNode>();
        const rootCodeList: string[] = [];

        for (const ch of roots) {
          rootCodeList.push(ch.code);
          nodeMap.set(ch.code, {
            code: ch.code,
            name: ch.name,
            expanded: false,
            loading: false,
            services: null,
          });
        }

        // Also pre-create nodes for all chapters so we have names ready
        for (const ch of flat) {
          if (!nodeMap.has(ch.code)) {
            nodeMap.set(ch.code, {
              code: ch.code,
              name: ch.name,
              expanded: false,
              loading: false,
              services: null,
            });
          }
        }

        setNodes(nodeMap);
        setRootCodes(rootCodeList);
        setLoaded(true);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [loaded, loading]);

  const toggleNode = useCallback(
    async (code: string) => {
      const node = nodes.get(code);
      if (!node) return;

      // Toggle expanded
      setNodes((prev) => {
        const next = new Map(prev);
        const n = { ...next.get(code)! };
        n.expanded = !n.expanded;
        next.set(code, n);
        return next;
      });

      // If collapsing, nothing more to do
      if (node.expanded) return;

      // If it's a service group and services not loaded, fetch them
      if (isServiceGroup(code) && node.services === null) {
        setNodes((prev) => {
          const next = new Map(prev);
          next.set(code, { ...next.get(code)!, loading: true });
          return next;
        });

        try {
          const svcRes = await fetch(
            `/api/tardoc/sumex?action=searchChapter&chapter=${encodeURIComponent(code)}&canton=${canton}&mainOnly=0`,
          );
          const svcJson = await svcRes.json();
          const services = svcJson.success ? svcJson.data || [] : [];

          setNodes((prev) => {
            const next = new Map(prev);
            next.set(code, { ...next.get(code)!, loading: false, services });
            return next;
          });
        } catch {
          setNodes((prev) => {
            const next = new Map(prev);
            next.set(code, { ...next.get(code)!, loading: false, services: [] });
            return next;
          });
        }
      }
    },
    [nodes, canton],
  );

  if (!loaded) {
    return (
      <button
        type="button"
        onClick={loadCatalog}
        className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-[11px] font-medium text-slate-700 shadow-sm transition-all hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 hover:shadow-md active:scale-[0.98]"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin text-sky-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading TARDOC catalog...
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Browse TARDOC Catalog
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px]">
      {/* Header */}
      <div className="sticky top-0 z-10 grid grid-cols-[24px_minmax(60px,auto)_minmax(0,1fr)_52px_52px] items-center gap-0 border-b border-slate-300 bg-slate-100 px-1 py-1 text-[9px] font-bold text-slate-500">
        <span />
        <span className="px-1">CODE</span>
        <span className="px-1">DESCRIPTION</span>
        <span className="px-1 text-right">PT PM</span>
        <span className="px-1 text-right">PT PT</span>
      </div>
      {rootCodes.map((code) => (
        <ChapterRow
          key={code}
          code={code}
          depth={0}
          nodes={nodes}
          allChapters={allChaptersRef.current}
          tpv={tpv}
          onToggle={toggleNode}
          onAddService={onAddService}
        />
      ))}
    </div>
  );
}

// ─── Recursive chapter row ───────────────────────────────────────────────────

function ChapterRow({
  code,
  depth,
  nodes,
  allChapters,
  tpv,
  onToggle,
  onAddService,
}: {
  code: string;
  depth: number;
  nodes: Map<string, TreeNode>;
  allChapters: FlatChapter[];
  tpv: number;
  onToggle: (code: string) => void;
  onAddService: (svc: any) => void;
}) {
  const node = nodes.get(code);
  if (!node) return null;

  const children = getDirectChildren(allChapters, code);
  const isSvcGroup = isServiceGroup(code);
  const hasChildren = children.length > 0 || isSvcGroup;
  const pl = depth * 16;

  return (
    <>
      {/* Chapter row */}
      <div
        className={`grid grid-cols-[24px_minmax(60px,auto)_minmax(0,1fr)_52px_52px] items-center gap-0 border-b border-slate-100 px-1 py-0.5 hover:bg-sky-50/40 cursor-pointer ${
          depth === 0 ? "bg-slate-50/60" : ""
        }`}
        style={{ paddingLeft: `${4 + pl}px` }}
        onClick={() => onToggle(code)}
      >
        <span className="flex h-4 w-4 items-center justify-center text-slate-400">
          {node.loading ? (
            <svg className="h-3 w-3 animate-spin text-sky-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : !hasChildren ? (
            <span className="text-[8px] text-slate-300">&mdash;</span>
          ) : node.expanded ? (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          ) : (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </span>
        <span className={`px-1 font-mono text-[9px] ${depth === 0 ? "font-bold text-slate-800" : "font-semibold text-slate-700"}`}>
          {node.code}
        </span>
        <span className={`px-1 truncate ${depth === 0 ? "font-bold text-slate-800" : "font-medium text-slate-600"}`}>
          {node.name}
        </span>
        <span />
        <span />
      </div>

      {/* Expanded children */}
      {node.expanded && (
        <>
          {/* Sub-chapter rows */}
          {children.map((child) => (
            <ChapterRow
              key={child.code}
              code={child.code}
              depth={depth + 1}
              nodes={nodes}
              allChapters={allChapters}
              tpv={tpv}
              onToggle={onToggle}
              onAddService={onAddService}
            />
          ))}

          {/* Service rows (only for service groups) */}
          {isSvcGroup && node.services && node.services.map((svc: any) => {
            const price = svc.priceCHF ?? Math.round(((svc.tpMT || 0) + (svc.tpTT || 0)) * tpv * 100) / 100;
            return (
              <div
                key={svc.code || svc.recordId}
                className="grid grid-cols-[24px_minmax(60px,auto)_minmax(0,1fr)_52px_52px] items-center gap-0 border-b border-slate-50 px-1 py-0.5 hover:bg-emerald-50/40"
                style={{ paddingLeft: `${4 + (depth + 1) * 16}px` }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddService(svc);
                  }}
                  className="flex h-4 w-4 items-center justify-center rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-200"
                  title="Add to invoice"
                >
                  <span className="text-[10px] font-bold leading-none">+</span>
                </button>
                <span className="px-1 font-mono text-[9px] text-slate-600">{svc.code}</span>
                <span className="px-1 truncate text-[9px] text-slate-500" title={svc.name}>
                  {svc.name}
                </span>
                <span className="px-1 text-right font-mono text-[9px] text-slate-600">
                  {(svc.tpMT ?? 0).toFixed(2)}
                </span>
                <span className="px-1 text-right font-mono text-[9px] text-slate-600">
                  {(svc.tpTT ?? 0).toFixed(2)}
                </span>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
