"use client";

import { useState, useCallback, useEffect } from "react";
import { formatChf } from "@/lib/tardoc";

type TmaChapter = { code: string; name: string; count: number };

type TmaTreeNode = {
  code: string;
  name: string;
  count: number;
  expanded: boolean;
  loading: boolean;
  services: any[] | null;
};

export type AcfServiceWithVariables = {
  code: string;
  name: string;
  tp: number;
  chapterCode?: string;
  chapterName?: string;
  sideType: number;
  externalFactor: number;
  refCode: string;
  // TMA gesture code info (for reference on the invoice)
  tmaGestureCode?: string;
  tmaGestureName?: string;
  isTmaGesture?: boolean; // true = this is the gesture line (TP=0), not the flat rate
};

type AcfAccordionTreeProps = {
  onAddService: (svc: AcfServiceWithVariables) => void;
  patientSex?: number; // 0=male, 1=female
  patientBirthdate?: string; // ISO date
  existingTardocCodes?: Array<{ code: string; quantity: number; side?: number }>;
  defaultIcd10?: string;
};

const SIDE_LABELS: Record<number, string> = {
  0: "None",
  1: "Left",
  2: "Right",
  3: "Both (bilateral)",
};

const TMA_TYPE_BADGES: Record<number, { label: string; color: string }> = {
  1: { label: "P(OR)", color: "bg-emerald-100 text-emerald-700" },
  2: { label: "P", color: "bg-blue-100 text-blue-700" },
  4: { label: "PZ", color: "bg-amber-100 text-amber-700" },
  5: { label: "E", color: "bg-purple-100 text-purple-700" },
  6: { label: "EZ", color: "bg-pink-100 text-pink-700" },
  7: { label: "N", color: "bg-slate-100 text-slate-600" },
};

const Spinner = ({ className = "h-3 w-3" }: { className?: string }) => (
  <svg className={`animate-spin text-violet-500 ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export default function AcfAccordionTree({
  onAddService,
  patientSex,
  patientBirthdate,
  existingTardocCodes,
  defaultIcd10,
}: AcfAccordionTreeProps) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<Map<string, TmaTreeNode>>(new Map());
  const [chapterCodes, setChapterCodes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Staging: selected TMA gesture code before running grouper
  const [staged, setStaged] = useState<any | null>(null);
  const [stageSide, setStageSide] = useState(0);
  const [stageIcd, setStageIcd] = useState((defaultIcd10 || "").trim());
  const [stageSex, setStageSex] = useState<number>(patientSex ?? 0);
  const [stageBirthdate, setStageBirthdate] = useState(patientBirthdate || "1990-01-01");

  // Grouper result
  const [grouperLoading, setGrouperLoading] = useState(false);
  const [grouperResult, setGrouperResult] = useState<any | null>(null);
  const [grouperError, setGrouperError] = useState<string | null>(null);

  useEffect(() => {
    const nextIcd = (defaultIcd10 || "").trim();
    if (!staged) {
      setStageIcd(nextIcd);
    }
  }, [defaultIcd10, staged]);

  // ── Load TMA chapters ──────────────────────────────────────────────────────
  const loadChapters = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/acf/sumex?action=tmaChapters");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const chapters: TmaChapter[] = json.data;
        const nodeMap = new Map<string, TmaTreeNode>();
        const codes: string[] = [];
        for (const ch of chapters) {
          if (!ch.code || !ch.name) continue;
          codes.push(ch.code);
          nodeMap.set(ch.code, {
            code: ch.code, name: ch.name, count: ch.count,
            expanded: false, loading: false, services: null,
          });
        }
        setNodes(nodeMap);
        setChapterCodes(codes);
        setLoaded(true);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [loaded, loading]);

  // ── Toggle chapter → load TMA gesture codes for that chapter ───────────────
  const toggleNode = useCallback(async (code: string) => {
    const node = nodes.get(code);
    if (!node) return;
    setNodes((prev) => {
      const next = new Map(prev);
      next.set(code, { ...next.get(code)!, expanded: !next.get(code)!.expanded });
      return next;
    });
    if (node.expanded) return;
    if (node.services === null) {
      setNodes((prev) => {
        const next = new Map(prev);
        next.set(code, { ...next.get(code)!, loading: true });
        return next;
      });
      try {
        const res = await fetch(`/api/acf/sumex?action=searchTma&code=*&chapter=${encodeURIComponent(code)}&grouperOnly=true`);
        const json = await res.json();
        const services = json.success ? json.data?.services || [] : [];
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
  }, [nodes]);

  // ── Search TMA gesture codes ───────────────────────────────────────────────
  const doSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const isCode = /^[A-Z0-9.*]+$/i.test(q);
      const codeParam = isCode ? (q.includes("*") ? q : q + "*") : "*";
      const nameParam = isCode ? "" : `*${q}*`;
      const res = await fetch(
        `/api/acf/sumex?action=searchTma&code=${encodeURIComponent(codeParam)}&name=${encodeURIComponent(nameParam)}&grouperOnly=true`,
      );
      const json = await res.json();
      setSearchResults(json.success ? json.data?.services || [] : []);
    } catch { setSearchResults([]); }
    setSearchLoading(false);
  }, [searchQuery]);

  // ── Select a TMA gesture code → open staging panel ─────────────────────────
  const handleSelectService = useCallback((svc: any) => {
    setStaged(svc);
    setStageSide(svc.hasSideDependency ? 1 : 0); // default to Left if side required
    setStageIcd((defaultIcd10 || "").trim());
    setGrouperResult(null);
    setGrouperError(null);
  }, [defaultIcd10]);

  // ── Run the grouper: TMA gesture + ICD → ACF flat rate code ────────────────
  const handleRunGrouper = useCallback(async () => {
    if (!staged) return;
    const icd = stageIcd.trim();
    if (!icd) {
      setGrouperError("ICD-10 diagnostic code is required");
      return;
    }
    setGrouperLoading(true);
    setGrouperError(null);
    setGrouperResult(null);
    try {
      const res = await fetch("/api/acf/sumex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "runGrouper",
          icdCode: icd,
          patientSex: stageSex,
          patientBirthdate: stageBirthdate,
          law: 0,
          services: [
            { code: staged.code, side: stageSide, quantity: 1 },
            ...(existingTardocCodes || []).map((t) => ({
              code: t.code,
              side: t.side ?? 0,
              quantity: t.quantity,
            })),
          ],
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setGrouperResult(json.data);
        if (json.data.errors?.length > 0) {
          setGrouperError(json.data.errors.join("; "));
        }
      } else {
        setGrouperError(json.error || json.errors?.join("; ") || "Grouper failed");
        if (json.data) setGrouperResult(json.data);
      }
    } catch (e: any) {
      setGrouperError(e?.message || "Grouper request failed");
    }
    setGrouperLoading(false);
  }, [staged, stageIcd, stageSide, stageSex, stageBirthdate, existingTardocCodes]);

  // ── Add resulting ACF code to invoice ──────────────────────────────────────
  // Standard: add TMA gesture line (TP=0) first, then the generated ACF flat rate line
  const handleAddAcfResult = useCallback((acf: any) => {
    // 1. TMA gesture code line (documents what was performed, TP = 0)
    if (staged) {
      onAddService({
        code: staged.code,
        name: staged.name,
        tp: 0,
        chapterCode: staged.chapterCode || "",
        chapterName: staged.chapterName || "",
        sideType: stageSide,
        externalFactor: 1.0,
        refCode: stageIcd.trim(),
        tmaGestureCode: staged.code,
        tmaGestureName: staged.name,
        isTmaGesture: true,
      });
    }
    // 2. ACF flat rate code line (the billable amount)
    onAddService({
      code: acf.code,
      name: acf.name,
      tp: acf.tp,
      chapterCode: acf.chapterCode,
      chapterName: acf.chapterName,
      sideType: stageSide,
      externalFactor: 1.0,
      refCode: stageIcd.trim(),
      tmaGestureCode: staged?.code,
      tmaGestureName: staged?.name,
    });
    setStaged(null);
    setGrouperResult(null);
  }, [onAddService, stageSide, stageIcd, staged]);

  // ── Initial load button ────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <button
        type="button"
        onClick={loadChapters}
        className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-[11px] font-medium text-slate-700 shadow-sm transition-all hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 hover:shadow-md active:scale-[0.98]"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <Spinner className="h-4 w-4" />
            Loading TMA gesture catalog...
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Browse ACF Gesture Codes (TMA)
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {/* ── Staging panel: TMA gesture code selected → grouper inputs ──────── */}
      {staged && (
        <div className="rounded-lg border-2 border-violet-300 bg-violet-50/60 p-2 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="font-mono text-[10px] font-bold text-violet-800">{staged.code}</span>
              {staged.tmaType > 0 && TMA_TYPE_BADGES[staged.tmaType] && (
                <span className={`ml-1 rounded px-1 py-0.5 text-[7px] font-bold ${TMA_TYPE_BADGES[staged.tmaType].color}`}>
                  {TMA_TYPE_BADGES[staged.tmaType].label}
                </span>
              )}
              <div className="text-[9px] text-violet-700 mt-0.5 leading-tight">{staged.name}</div>
              {staged.hasSideDependency && (
                <div className="text-[8px] text-amber-600 font-medium mt-0.5">⚠ Side specification required</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setStaged(null); setGrouperResult(null); setGrouperError(null); }}
              className="shrink-0 text-[9px] text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {/* ICD-10 diagnostic code — REQUIRED */}
            <div>
              <label className="block text-[8px] font-semibold text-red-500 uppercase tracking-wide">ICD-10 *</label>
              <input
                type="text"
                placeholder="e.g. Z42.1"
                value={stageIcd}
                onChange={(e) => { setStageIcd(e.target.value); setGrouperResult(null); setGrouperError(null); }}
                className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
            </div>

            {/* Side type */}
            <div>
              <label className="block text-[8px] font-semibold text-slate-500 uppercase tracking-wide">
                Side {staged.hasSideDependency && <span className="text-red-500">*</span>}
              </label>
              <select
                value={stageSide}
                onChange={(e) => { setStageSide(Number(e.target.value)); setGrouperResult(null); }}
                className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
              >
                <option value={0}>None</option>
                <option value={1}>Left</option>
                <option value={2}>Right</option>
                <option value={3}>Both (bilateral)</option>
              </select>
            </div>

            {/* Patient sex */}
            <div>
              <label className="block text-[8px] font-semibold text-slate-500 uppercase tracking-wide">Patient Sex</label>
              <select
                value={stageSex}
                onChange={(e) => { setStageSex(Number(e.target.value)); setGrouperResult(null); }}
                className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
              >
                <option value={0}>Male</option>
                <option value={1}>Female</option>
              </select>
            </div>

            {/* Patient birthdate */}
            <div>
              <label className="block text-[8px] font-semibold text-slate-500 uppercase tracking-wide">Birthdate</label>
              <input
                type="date"
                value={stageBirthdate}
                onChange={(e) => { setStageBirthdate(e.target.value); setGrouperResult(null); }}
                className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
            </div>
          </div>

          {/* TARDOC interaction notice */}
          {existingTardocCodes && existingTardocCodes.length > 0 && (
            <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[9px] text-sky-700">
              <span className="font-medium">TARDOC interaction:</span> {existingTardocCodes.length} TARDOC code{existingTardocCodes.length > 1 ? "s" : ""} ({existingTardocCodes.map(t => t.code).join(", ")}) will be included in the grouper to determine the correct ACF flat rate.
            </div>
          )}

          {/* Run Grouper button */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="text-[9px] text-slate-500">
              Gesture code → ACF flat rate
            </div>
            <button
              type="button"
              disabled={grouperLoading || !stageIcd.trim()}
              onClick={handleRunGrouper}
              className="rounded-md bg-violet-600 px-3 py-1 text-[10px] font-medium text-white shadow-sm hover:bg-violet-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {grouperLoading && <Spinner className="h-3 w-3" />}
              {grouperLoading ? "Running..." : "Run Grouper"}
            </button>
          </div>

          {/* Grouper error */}
          {grouperError && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[9px] text-red-700">
              {grouperError}
            </div>
          )}

          {/* Grouper results — ACF flat rate codes */}
          {grouperResult && grouperResult.acfCodes?.length > 0 && (
            <div className="space-y-1">
              <div className="text-[8px] font-bold text-emerald-700 uppercase tracking-wide">
                Resulting ACF Flat Rate Code{grouperResult.acfCodes.length > 1 ? "s" : ""}
              </div>
              {grouperResult.acfCodes.map((acf: any, idx: number) => (
                <div key={acf.code || idx} className="flex items-center justify-between rounded border border-emerald-200 bg-emerald-50/60 px-2 py-1.5">
                  <div className="min-w-0">
                    <span className="font-mono text-[10px] font-bold text-emerald-800">{acf.code}</span>
                    <span className="ml-1 text-[9px] text-emerald-700">{acf.name}</span>
                    <div className="text-[8px] text-slate-500">{acf.chapterCode} · {acf.chapterName}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] font-bold text-emerald-800">{formatChf(acf.tp)}</span>
                    <button
                      type="button"
                      onClick={() => handleAddAcfResult(acf)}
                      className="rounded bg-emerald-600 px-2 py-0.5 text-[9px] font-medium text-white hover:bg-emerald-700 active:scale-95"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Grouper ran but no ACF code produced */}
          {grouperResult && grouperResult.acfCodes?.length === 0 && !grouperError && (
            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] text-amber-700">
              No ACF flat rate code produced. Status: {grouperResult.groupingStatusList || "unknown"}
            </div>
          )}
        </div>
      )}

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="Search gesture code or keyword..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } }}
          className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button
          type="button"
          disabled={searchLoading}
          onClick={doSearch}
          className="shrink-0 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
        >
          {searchLoading ? "..." : "Search"}
        </button>
        {searchResults !== null && (
          <button
            type="button"
            onClick={() => { setSearchResults(null); setSearchQuery(""); }}
            className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500 hover:bg-slate-100"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Search results ─────────────────────────────────────────────────── */}
      {searchResults !== null ? (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px]">
          <div className="sticky top-0 z-10 grid grid-cols-[24px_minmax(0,1fr)_48px] items-center gap-0 border-b border-slate-300 bg-slate-100 px-1 py-1 text-[9px] font-bold text-slate-500">
            <span />
            <span className="px-1">GESTURE CODE ({searchResults.length})</span>
            <span className="px-1 text-right">TYPE</span>
          </div>
          {searchResults.length === 0 ? (
            <div className="py-3 text-center text-[10px] text-slate-400">
              {searchLoading ? "Searching..." : "No results found."}
            </div>
          ) : (
            searchResults.map((svc: any, idx: number) => (
              <TmaServiceRow key={svc.code || `search-${idx}`} svc={svc} onSelect={handleSelectService} selectedCode={staged?.code} />
            ))
          )}
        </div>
      ) : (
        /* ── Chapter accordion tree ──────────────────────────────────────── */
        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px]">
          <div className="sticky top-0 z-10 grid grid-cols-[24px_minmax(0,1fr)_48px_48px] items-center gap-0 border-b border-slate-300 bg-slate-100 px-1 py-1 text-[9px] font-bold text-slate-500">
            <span />
            <span className="px-1">CHAPTER / GESTURE CODE</span>
            <span className="px-1 text-right">COUNT</span>
            <span className="px-1 text-right">TYPE</span>
          </div>
          {chapterCodes.map((code) => (
            <ChapterRow
              key={code}
              code={code}
              nodes={nodes}
              onToggle={toggleNode}
              onSelect={handleSelectService}
              selectedCode={staged?.code}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chapter row ─────────────────────────────────────────────────────────────

function ChapterRow({
  code, nodes, onToggle, onSelect, selectedCode,
}: {
  code: string;
  nodes: Map<string, TmaTreeNode>;
  onToggle: (code: string) => void;
  onSelect: (svc: any) => void;
  selectedCode?: string;
}) {
  const node = nodes.get(code);
  if (!node) return null;

  return (
    <>
      <div
        className="grid grid-cols-[24px_minmax(0,1fr)_48px_48px] items-center gap-0 border-b border-slate-100 bg-slate-50/60 px-1 py-1 hover:bg-violet-50/40 cursor-pointer"
        onClick={() => onToggle(code)}
      >
        <span className="flex h-4 w-4 items-center justify-center text-slate-400">
          {node.loading ? (
            <Spinner />
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
        <span className="px-1 truncate">
          <span className="font-mono text-[9px] font-bold text-slate-800">{node.code}</span>
          <span className="ml-1 font-medium text-slate-700">{node.name}</span>
        </span>
        <span className="px-1 text-right font-mono text-[9px] text-slate-500">{node.count}</span>
        <span />
      </div>

      {node.expanded && node.services && node.services.map((svc: any, idx: number) => (
        <TmaServiceRow key={svc.code || `svc-${idx}`} svc={svc} onSelect={onSelect} selectedCode={selectedCode} indent />
      ))}

      {node.expanded && node.services && node.services.length === 0 && !node.loading && (
        <div className="py-2 pl-8 text-[9px] text-slate-400">No gesture codes in this chapter.</div>
      )}
    </>
  );
}

// ─── TMA Service row ─────────────────────────────────────────────────────────

function TmaServiceRow({
  svc, onSelect, selectedCode, indent = false,
}: {
  svc: any;
  onSelect: (svc: any) => void;
  selectedCode?: string;
  indent?: boolean;
}) {
  const isSelected = selectedCode === svc.code && svc.code;
  const badge = TMA_TYPE_BADGES[svc.tmaType as number];

  return (
    <div
      className={`grid items-center gap-0 border-b border-slate-50 px-1 py-0.5 cursor-pointer transition-colors ${
        isSelected ? "bg-violet-100/70" : "hover:bg-emerald-50/40"
      } ${indent ? "grid-cols-[24px_minmax(0,1fr)_48px_48px] pl-5" : "grid-cols-[24px_minmax(0,1fr)_48px]"}`}
      onClick={(e) => { e.stopPropagation(); onSelect(svc); }}
    >
      <span className={`flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold leading-none ${
        isSelected ? "bg-violet-500 text-white" : "bg-violet-50 text-violet-600"
      }`}>
        {isSelected ? "\u2713" : "+"}
      </span>
      <div className="min-w-0 px-1">
        <div>
          <span className="font-mono text-[9px] font-semibold text-slate-600">{svc.code}</span>
          <span className="ml-1 text-[9px] text-slate-500" title={svc.name}>{svc.name}</span>
        </div>
        {svc.hasSideDependency && (
          <span className="text-[7px] text-amber-600 font-medium">side required</span>
        )}
      </div>
      {indent && <span />}
      <span className="px-1 text-right">
        {badge ? (
          <span className={`rounded px-1 py-0.5 text-[7px] font-bold ${badge.color}`}>{badge.label}</span>
        ) : (
          <span className="text-[8px] text-slate-400">TMA</span>
        )}
      </span>
    </div>
  );
}
