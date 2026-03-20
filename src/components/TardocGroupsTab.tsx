"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { CANTON_TAX_POINT_VALUES, DEFAULT_CANTON, type SwissCanton } from "@/lib/tardoc";
import TardocAccordionTree from "@/components/TardocAccordionTree";
import AcfAccordionTree, { type AcfServiceWithVariables } from "@/components/AcfAccordionTree";

type GroupItem = {
  id?: string;
  tardoc_code: string;
  description: string | null;
  quantity: number;
  ref_code: string | null;
  side_type: number;
  tp_mt: number;
  tp_tt: number;
  internal_factor_mt: number;
  internal_factor_tt: number;
  external_factor_mt: number;
  external_factor_tt: number;
  sort_order: number;
};

type TardocGroup = {
  id: string;
  name: string;
  description: string | null;
  canton: string;
  law_type: string;
  created_by_name: string | null;
  is_active: boolean;
  validation_status: string | null;
  validation_message: string | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
  tardoc_group_items: GroupItem[];
};

type SearchResult = {
  code: string;
  name: string;
  tpMT: number;
  tpTT: number;
  unitQuantity: number;
  priceCHF: number;
  recordId: number;
  internalFactorMT: number;
  internalFactorTT: number;
};

export default function TardocGroupsTab() {
  const [groups, setGroups] = useState<TardocGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create/Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TardocGroup | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupCanton, setGroupCanton] = useState<SwissCanton>(DEFAULT_CANTON);
  const [groupLawType, setGroupLawType] = useState("KVG");
  const [groupItems, setGroupItems] = useState<GroupItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Manual flat rate / TMA entry
  const [manualItemType, setManualItemType] = useState<"acf" | "tma">("acf");
  const [manualCode, setManualCode] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualTpMt, setManualTpMt] = useState("");
  const [manualQty, setManualQty] = useState("1");

  // Rerun grouper state
  const [rerunGrouperLoading, setRerunGrouperLoading] = useState(false);

  // Validation state
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<any | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tardoc/groups");
      const json = await res.json();
      if (json.success) {
        setGroups(json.data || []);
      } else {
        setError(json.error || "Failed to load groups");
      }
    } catch {
      setError("Failed to load groups");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  function openCreateModal() {
    setEditingGroup(null);
    setGroupName("");
    setGroupDescription("");
    setGroupCanton(DEFAULT_CANTON);
    setGroupLawType("KVG");
    setGroupItems([]);
    setSaveError(null);
    setValidationResult(null);
    setSearchQuery("");
    setSearchResults([]);
    setModalOpen(true);
  }

  function openEditModal(group: TardocGroup) {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupDescription(group.description || "");
    setGroupCanton((group.canton || DEFAULT_CANTON) as SwissCanton);
    setGroupLawType(group.law_type || "KVG");
    setGroupItems(
      (group.tardoc_group_items || []).map((item, idx) => ({
        ...item,
        sort_order: item.sort_order ?? idx,
      })),
    );
    setSaveError(null);
    setValidationResult(null);
    setSearchQuery("");
    setSearchResults([]);
    setModalOpen(true);
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/tardoc/sumex?action=searchCode&code=${encodeURIComponent(searchQuery.trim())}&canton=${groupCanton}`,
      );
      const json = await res.json();
      if (json.success) setSearchResults(json.data || []);
    } catch { /* ignore */ }
    setSearchLoading(false);
  }

  function addItemFromSearch(svc: SearchResult) {
    const tpv = CANTON_TAX_POINT_VALUES[groupCanton] ?? 0.96;
    setGroupItems((prev) => [
      ...prev,
      {
        tardoc_code: svc.code,
        description: svc.name || null,
        quantity: 1,
        ref_code: null,
        side_type: 0,
        tp_mt: svc.tpMT,
        tp_tt: svc.tpTT,
        internal_factor_mt: svc.internalFactorMT ?? 1,
        internal_factor_tt: svc.internalFactorTT ?? 1,
        external_factor_mt: 1,
        external_factor_tt: 1,
        sort_order: prev.length,
      },
    ]);
  }

  function removeItem(idx: number) {
    setGroupItems((prev) => prev.filter((_, i) => i !== idx));
  }

  /** Detect item type from the stored tardoc_code value */
  function getItemType(code: string): "tardoc" | "acf" | "tma" {
    if (code.startsWith("acf:")) return "acf";
    if (code.startsWith("tma:")) return "tma";
    return "tardoc";
  }

  /** Strip prefix from stored code for display */
  function displayCode(code: string): string {
    if (code.startsWith("acf:")) return code.slice(4);
    if (code.startsWith("tma:")) return code.slice(4);
    return code;
  }

  function addManualItem() {
    const code = manualCode.trim();
    if (!code) return;
    const prefix = manualItemType === "acf" ? "acf:" : "tma:";
    const storedCode = `${prefix}${code}`;
    // Prevent duplicates
    if (groupItems.some((i) => i.tardoc_code === storedCode)) return;
    const tp = parseFloat(manualTpMt) || 0;
    setGroupItems((prev) => [
      ...prev,
      {
        tardoc_code: storedCode,
        description: manualDescription.trim() || code,
        quantity: Math.max(1, parseInt(manualQty) || 1),
        ref_code: null,
        side_type: 0,
        tp_mt: tp,
        tp_tt: 0,
        internal_factor_mt: 1,
        internal_factor_tt: 1,
        external_factor_mt: 1,
        external_factor_tt: 1,
        sort_order: prev.length,
      },
    ]);
    setManualCode("");
    setManualDescription("");
    setManualTpMt("");
    setManualQty("1");
  }

  /** Handle adding a service from AcfAccordionTree (TMA gesture or ACF flat rate) */
  function addAcfServiceToGroup(svc: AcfServiceWithVariables) {
    const isGesture = !!svc.isTmaGesture;
    const prefix = isGesture ? "tma:" : "acf:";
    const storedCode = `${prefix}${svc.code}`;
    // Prevent duplicates
    if (groupItems.some((i) => i.tardoc_code === storedCode)) return;
    const ef = svc.externalFactor ?? 1.0;
    const sideLabel = svc.sideType === 1 ? " [L]" : svc.sideType === 2 ? " [R]" : svc.sideType === 3 ? " [B]" : "";
    const factorLabel = ef !== 1.0 ? ` x${ef}` : "";
    setGroupItems((prev) => [
      ...prev,
      {
        tardoc_code: storedCode,
        description: `[${isGesture ? "TMA" : "ACF"}] ${svc.code}${sideLabel}${factorLabel} - ${(svc.name || "").substring(0, 80)}`,
        quantity: 1,
        ref_code: svc.refCode || null,
        side_type: svc.sideType ?? 0,
        tp_mt: svc.tp ?? 0,
        tp_tt: 0,
        internal_factor_mt: 1,
        internal_factor_tt: 1,
        external_factor_mt: ef,
        external_factor_tt: 1,
        sort_order: prev.length,
      },
    ]);
  }

  /** Re-run the TMA grouper with current TMA + TARDOC codes in the group, replacing existing ACF flat rate items */
  async function handleRerunGrouper() {
    const tmaItems = groupItems.filter((i) => i.tardoc_code.startsWith("tma:"));
    const tardocItems = groupItems.filter((i) => !i.tardoc_code.startsWith("acf:") && !i.tardoc_code.startsWith("tma:"));
    const icdCode = tmaItems.find((i) => i.ref_code)?.ref_code || "";
    if (!icdCode) return;

    setRerunGrouperLoading(true);
    try {
      const services = [
        ...tmaItems.map((i) => ({
          code: i.tardoc_code.slice(4),
          side: i.side_type ?? 0,
          quantity: i.quantity > 0 ? i.quantity : 1,
        })),
        ...tardocItems.map((i) => ({
          code: i.tardoc_code,
          side: i.side_type ?? 0,
          quantity: i.quantity > 0 ? i.quantity : 1,
        })),
      ];
      const res = await fetch("/api/acf/sumex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "runGrouper",
          icdCode,
          patientSex: 0,
          patientBirthdate: "1990-01-01",
          law: 0,
          services,
        }),
      });
      const json = await res.json();
      const acfCodes: any[] = json.data?.acfCodes || [];
      if (acfCodes.length > 0) {
        setGroupItems((prev) => {
          const nonAcf = prev.filter((i) => !i.tardoc_code.startsWith("acf:"));
          const sideType = tmaItems[0]?.side_type ?? 0;
          const sideLabel = sideType === 1 ? " [L]" : sideType === 2 ? " [R]" : sideType === 3 ? " [B]" : "";
          const newAcfItems: GroupItem[] = acfCodes.map((acf: any, idx: number) => ({
            tardoc_code: `acf:${acf.code}`,
            description: `[ACF] ${acf.code}${sideLabel} - ${(acf.name || "").substring(0, 80)}`,
            quantity: 1,
            ref_code: icdCode,
            side_type: sideType,
            tp_mt: acf.tp ?? 0,
            tp_tt: 0,
            internal_factor_mt: 1,
            internal_factor_tt: 1,
            external_factor_mt: 1,
            external_factor_tt: 1,
            sort_order: nonAcf.length + idx,
          }));
          return [...nonAcf, ...newAcfItems];
        });
      }
      if (json.data?.errors?.length > 0) {
        console.warn("Grouper re-run warnings:", json.data.errors);
      }
      if (!json.success && acfCodes.length === 0) {
        const errMsg = json.error || json.errors?.join("; ") || json.data?.errors?.join("; ") || "Unknown grouper error";
        setSaveError(`Grouper re-run failed: ${errMsg}`);
      }
    } catch (err) {
      console.error("Grouper re-run request failed:", err);
      setSaveError("Grouper re-run request failed");
    }
    setRerunGrouperLoading(false);
  }

  function updateItemField(idx: number, field: keyof GroupItem, value: number | string | null) {
    setGroupItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  }

  async function handleSave() {
    if (!groupName.trim()) {
      setSaveError("Group name is required");
      return;
    }
    if (groupItems.length === 0) {
      setSaveError("Add at least one TarDoc code");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setValidationResult(null);

    // Save to DB (Sumex validation only runs on the invoice tab modal, not here)
    try {
      const itemsPayload = groupItems.map((item, idx) => ({
        tardoc_code: item.tardoc_code,
        description: item.description,
        quantity: item.quantity,
        ref_code: item.ref_code,
        side_type: item.side_type,
        tp_mt: item.tp_mt,
        tp_tt: item.tp_tt,
        internal_factor_mt: item.internal_factor_mt,
        internal_factor_tt: item.internal_factor_tt,
        external_factor_mt: item.external_factor_mt,
        external_factor_tt: item.external_factor_tt,
        sort_order: idx,
      }));

      const method = editingGroup ? "PUT" : "POST";
      const bodyPayload: Record<string, unknown> = {
        name: groupName.trim(),
        description: groupDescription.trim() || null,
        canton: groupCanton,
        law_type: groupLawType,
        items: itemsPayload,
      };
      if (editingGroup) bodyPayload.id = editingGroup.id;

      const res = await fetch("/api/tardoc/groups", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const json = await res.json();
      if (!json.success) {
        setSaveError(json.error || "Failed to save");
        setSaving(false);
        return;
      }

      setModalOpen(false);
      await loadGroups();
    } catch {
      setSaveError("Failed to save group");
    }
    setSaving(false);
  }

  async function handleValidate(groupId: string) {
    setValidating(groupId);
    setValidationResult(null);
    try {
      const res = await fetch("/api/tardoc/groups/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      const json = await res.json();
      setValidationResult(json);
      await loadGroups();
    } catch {
      setValidationResult({ error: "Validation request failed" });
    }
    setValidating(null);
  }

  async function handleDelete(groupId: string) {
    setDeletingId(groupId);
    try {
      await fetch("/api/tardoc/groups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: groupId }),
      });
      await loadGroups();
    } catch { /* ignore */ }
    setDeletingId(null);
  }

  const tpv = CANTON_TAX_POINT_VALUES[groupCanton] ?? 0.96;

  return (
    <>
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">TarDoc Groups</h2>
            <p className="text-[11px] text-slate-500">
              Create preset groups of TARDOC codes for quick invoice creation.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Group
          </button>
        </div>

        {loading && <div className="py-8 text-center text-xs text-slate-400">Loading...</div>}
        {error && <div className="py-4 text-center text-xs text-red-500">{error}</div>}

        {!loading && groups.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-400">
            No TarDoc groups yet. Create one to get started.
          </div>
        )}

        {!loading && groups.length > 0 && (
          <div className="space-y-2">
            {groups.map((group) => {
              const itemCount = group.tardoc_group_items?.length || 0;
              const totalPrice = (group.tardoc_group_items || []).reduce((sum, item) => {
                const canton = (group.canton || "GE") as SwissCanton;
                const tv = CANTON_TAX_POINT_VALUES[canton] ?? 0.96;
                return sum + (item.tp_mt + item.tp_tt) * tv * item.quantity;
              }, 0);

              return (
                <div
                  key={group.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-slate-800 truncate">{group.name}</h3>
                        {group.validation_status === "valid" && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                            ✓ Valid
                          </span>
                        )}
                        {group.validation_status === "invalid" && (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-red-700">
                            ✗ Invalid
                          </span>
                        )}
                        {group.validation_status === "pending" && (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                            Pending
                          </span>
                        )}
                      </div>
                      {group.description && (
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{group.description}</p>
                      )}
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400">
                        <span>{itemCount} code{itemCount !== 1 ? "s" : ""}</span>
                        <span>Canton: {group.canton}</span>
                        <span>Law: {group.law_type}</span>
                        <span className="font-medium text-slate-600">
                          CHF {totalPrice.toFixed(2)}
                        </span>
                      </div>
                      {/* Show codes preview */}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(group.tardoc_group_items || []).slice(0, 6).map((item, idx) => {
                          const type = item.tardoc_code.startsWith("acf:") ? "acf" : item.tardoc_code.startsWith("tma:") ? "tma" : "tardoc";
                          const code = type !== "tardoc" ? item.tardoc_code.slice(4) : item.tardoc_code;
                          const bgClass = type === "acf" ? "bg-violet-100 text-violet-700" : type === "tma" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";
                          return (
                            <span
                              key={idx}
                              className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[9px] ${bgClass}`}
                            >
                              {type !== "tardoc" && <span className="mr-0.5 text-[8px] font-semibold uppercase opacity-70">{type === "acf" ? "ACF" : "TMA"}</span>}
                              {code}
                              {item.quantity > 1 && <span className="ml-0.5 opacity-60">×{item.quantity}</span>}
                            </span>
                          );
                        })}
                        {itemCount > 6 && (
                          <span className="text-[9px] text-slate-400">+{itemCount - 6} more</span>
                        )}
                      </div>
                      {group.validation_status === "invalid" && group.validation_message && (
                        <p className="mt-1 text-[10px] text-red-500 line-clamp-2">{group.validation_message}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleValidate(group.id)}
                        disabled={validating === group.id}
                        className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                      >
                        {validating === group.id ? "..." : "Validate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(group)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(group.id)}
                        disabled={deletingId === group.id}
                        className="rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === group.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => !saving && setModalOpen(false)}
              className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-sm font-semibold text-slate-900 mb-4">
              {editingGroup ? "Edit TarDoc Group" : "Create TarDoc Group"}
            </h2>

            <div className="space-y-3">
              {/* Name + Description */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Group Name *</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g. Standard Consultation"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Description</label>
                  <input
                    type="text"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Optional description"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  />
                </div>
              </div>

              {/* Canton + Law */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Canton</label>
                  <select
                    value={groupCanton}
                    onChange={(e) => setGroupCanton(e.target.value as SwissCanton)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  >
                    {Object.keys(CANTON_TAX_POINT_VALUES).map((c) => (
                      <option key={c} value={c}>{c} ({CANTON_TAX_POINT_VALUES[c as SwissCanton]})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Insurance Law</label>
                  <select
                    value={groupLawType}
                    onChange={(e) => setGroupLawType(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  >
                    <option value="KVG">KVG</option>
                    <option value="UVG">UVG</option>
                    <option value="IVG">IVG</option>
                    <option value="MVG">MVG</option>
                    <option value="VVG">VVG</option>
                  </select>
                </div>
              </div>

              {/* Search for TARDOC codes */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600">Add TarDoc Codes</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="Search by code or name (e.g. AA.00 or consultation)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSearch();
                      }
                    }}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSearch()}
                    disabled={searchLoading}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {searchLoading ? "..." : "Search"}
                  </button>
                </div>
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50">
                  <div className="sticky top-0 z-10 grid grid-cols-[24px_minmax(0,1fr)_56px_56px_56px] items-center gap-0.5 border-b border-slate-200 bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">
                    <span />
                    <span>CODE / DESCRIPTION</span>
                    <span className="text-right">PT PM</span>
                    <span className="text-right">PT PT</span>
                    <span className="text-right">CHF</span>
                  </div>
                  {searchResults.map((svc) => {
                    const price = svc.priceCHF ?? Math.round((svc.tpMT + svc.tpTT) * tpv * 100) / 100;
                    const alreadyAdded = groupItems.some((i) => i.tardoc_code === svc.code);
                    return (
                      <div
                        key={svc.code || svc.recordId}
                        className={`grid grid-cols-[24px_minmax(0,1fr)_56px_56px_56px] items-center gap-0.5 border-b border-slate-100 px-2 py-1 text-[10px] ${alreadyAdded ? "bg-emerald-50/50" : "hover:bg-sky-50/50"}`}
                      >
                        <button
                          type="button"
                          onClick={() => addItemFromSearch(svc)}
                          disabled={alreadyAdded}
                          className="flex h-4 w-4 items-center justify-center rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-30"
                          title={alreadyAdded ? "Already added" : "Add to group"}
                        >
                          <span className="text-[10px] font-bold leading-none">{alreadyAdded ? "✓" : "+"}</span>
                        </button>
                        <div className="min-w-0">
                          <span className="font-mono text-[9px] font-semibold text-slate-700">{svc.code}</span>
                          <span className="ml-1 text-[9px] text-slate-500 line-clamp-1">{svc.name}</span>
                        </div>
                        <span className="text-right font-mono text-[9px] text-slate-600">{svc.tpMT?.toFixed(2)}</span>
                        <span className="text-right font-mono text-[9px] text-slate-600">{svc.tpTT?.toFixed(2)}</span>
                        <span className="text-right font-mono text-[9px] font-semibold text-slate-800">{price.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Browse TARDOC Catalog */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600">Browse TARDOC Catalog</label>
                <TardocAccordionTree
                  canton={groupCanton}
                  onAddService={(svc: any) => {
                    addItemFromSearch(svc);
                  }}
                />
              </div>

              {/* Browse ACF / Flat Rate Catalog (TMA Gestures → Grouper → ACF Flat Rates) */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600">Browse ACF Flat Rates (TMA Grouper)</label>
                <p className="text-[9px] text-slate-400 mb-1">
                  Select a TMA gesture code → enter ICD-10 → run grouper → add the resulting ACF flat rate codes to the group.
                </p>
                <AcfAccordionTree
                  onAddService={addAcfServiceToGroup}
                  existingTardocCodes={groupItems
                    .filter((item) => !item.tardoc_code.startsWith("acf:") && !item.tardoc_code.startsWith("tma:"))
                    .map((item) => ({
                      code: item.tardoc_code,
                      quantity: item.quantity,
                      side: item.side_type,
                    }))}
                />
              </div>

              {/* Manual Flat Rate / TMA quick-add (fallback) */}
              <details className="group">
                <summary className="cursor-pointer text-[10px] font-medium text-slate-500 hover:text-slate-700">
                  Manual flat rate / TMA entry (advanced)
                </summary>
                <div className="mt-1.5 rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={manualItemType}
                      onChange={(e) => setManualItemType(e.target.value as "acf" | "tma")}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-900 focus:border-sky-400 focus:outline-none"
                    >
                      <option value="acf">ACF Flat Rate</option>
                      <option value="tma">TMA Gesture</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Code (e.g. C09.60B)"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-900 focus:border-sky-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Description"
                      value={manualDescription}
                      onChange={(e) => setManualDescription(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-900 focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="flex items-center gap-1">
                      <label className="text-[9px] text-slate-500">TP:</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={manualTpMt}
                        onChange={(e) => setManualTpMt(e.target.value)}
                        className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-900 focus:border-sky-400 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-[9px] text-slate-500">Qty:</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={manualQty}
                        onChange={(e) => setManualQty(e.target.value)}
                        className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-900 focus:border-sky-400 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addManualItem}
                      disabled={!manualCode.trim()}
                      className="ml-auto shrink-0 rounded-lg border border-violet-300 bg-violet-600 px-3 py-1.5 text-[10px] font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                    >
                      + Add {manualItemType === "acf" ? "Flat Rate" : "TMA"}
                    </button>
                  </div>
                </div>
              </details>

              {/* Re-run Grouper banner: shown when ACF/TMA + TARDOC items coexist in the group */}
              {(() => {
                const hasAcf = groupItems.some((i) => i.tardoc_code.startsWith("acf:"));
                const hasTma = groupItems.some((i) => i.tardoc_code.startsWith("tma:"));
                const hasTardoc = groupItems.some((i) => !i.tardoc_code.startsWith("acf:") && !i.tardoc_code.startsWith("tma:"));
                if ((hasAcf || hasTma) && groupItems.length > 0) {
                  const tmaItems = groupItems.filter((i) => i.tardoc_code.startsWith("tma:"));
                  const tardocItems = groupItems.filter((i) => !i.tardoc_code.startsWith("acf:") && !i.tardoc_code.startsWith("tma:"));
                  const icdCode = tmaItems.find((i) => i.ref_code)?.ref_code || "";
                  return (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] text-amber-800">
                          <span className="font-semibold">
                            {hasTardoc ? "ACF + TARDOC detected:" : "ACF flat rates detected:"}
                          </span>{" "}
                          {hasTardoc
                            ? `${tardocItems.length} TARDOC code${tardocItems.length > 1 ? "s" : ""} may affect which ACF flat rate applies.`
                            : "TARDOC codes may affect flat rates."
                          }
                          {" "}Re-run the grouper to update flat rates.
                        </div>
                        <button
                          type="button"
                          disabled={rerunGrouperLoading || !icdCode}
                          onClick={() => void handleRerunGrouper()}
                          className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-[10px] font-medium text-white shadow-sm hover:bg-amber-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          {rerunGrouperLoading ? "Running..." : "Re-run Grouper"}
                        </button>
                      </div>
                      {!icdCode && (
                        <div className="text-[9px] text-amber-600">
                          No ICD-10 code found on TMA items. Add flat rates via the TMA grouper above (with an ICD-10 code) first.
                        </div>
                      )}
                      {icdCode && (
                        <div className="text-[9px] text-amber-600">
                          ICD-10: <span className="font-mono font-medium">{icdCode}</span>
                          {hasTardoc && (
                            <span className="ml-2">
                              TARDOC codes: {tardocItems.map((i) => i.tardoc_code).join(", ")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Current items in group */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600">
                  Group Items ({groupItems.length})
                </label>
                {groupItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-[10px] text-slate-400">
                    Search and add TarDoc codes above
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {groupItems.map((item, idx) => {
                      const itemPrice = Math.round((item.tp_mt + item.tp_tt) * tpv * item.quantity * item.external_factor_mt * 100) / 100;
                      return (
                        <div key={idx} className="px-2 py-1.5 space-y-1">
                          {/* Row 1: Code, description, price, remove */}
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-slate-400 w-4 text-center">{idx + 1}</span>
                            {getItemType(item.tardoc_code) !== "tardoc" && (
                              <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase ${getItemType(item.tardoc_code) === "acf" ? "bg-violet-100 text-violet-600" : "bg-amber-100 text-amber-600"}`}>
                                {getItemType(item.tardoc_code) === "acf" ? "ACF" : "TMA"}
                              </span>
                            )}
                            <span className="font-mono text-[10px] font-semibold text-slate-700 w-20">{displayCode(item.tardoc_code)}</span>
                            <span className="flex-1 text-[10px] text-slate-500 line-clamp-1 min-w-0">{item.description || "—"}</span>
                            <span className="text-[10px] font-medium text-slate-700 w-16 text-right">
                              {itemPrice.toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="flex h-4 w-4 items-center justify-center rounded text-red-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {/* Row 2: TP MT, TP TT, Point Value */}
                          <div className="flex items-center gap-3 pl-6 text-[9px] text-slate-400">
                            <span>TP MT: <span className="font-mono font-medium text-slate-600">{item.tp_mt.toFixed(2)}</span></span>
                            <span>TP TT: <span className="font-mono font-medium text-slate-600">{item.tp_tt.toFixed(2)}</span></span>
                            <span>TPV: <span className="font-mono font-medium text-slate-600">{tpv.toFixed(2)}</span></span>
                          </div>
                          {/* Row 3: Qty, Side, Ext Factor, Ref Code */}
                          <div className="flex items-center gap-2 pl-6">
                            <div className="flex items-center gap-1">
                              <label className="text-[9px] text-slate-400">Qty:</label>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={item.quantity}
                                onChange={(e) => updateItemField(idx, "quantity", Math.max(1, Number(e.target.value) || 1))}
                                className="w-12 rounded border border-slate-200 px-1 py-0.5 text-center text-[10px] text-slate-900 focus:border-sky-400 focus:outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <label className="text-[9px] text-slate-400">Side:</label>
                              <select
                                value={item.side_type}
                                onChange={(e) => updateItemField(idx, "side_type", Number(e.target.value))}
                                className="rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-900 focus:border-sky-400 focus:outline-none"
                              >
                                <option value={0}>None</option>
                                <option value={1}>Left</option>
                                <option value={2}>Right</option>
                                <option value={3}>Both</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-1">
                              <label className="text-[9px] text-slate-400">Ext.F:</label>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.external_factor_mt}
                                onChange={(e) => {
                                  const v = Number(e.target.value) || 1;
                                  updateItemField(idx, "external_factor_mt", v);
                                }}
                                className="w-14 rounded border border-slate-200 px-1 py-0.5 text-center text-[10px] text-slate-900 focus:border-sky-400 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Total */}
                    <div className="flex items-center justify-between px-2 py-1.5 bg-slate-50">
                      <span className="text-[10px] font-semibold text-slate-600">Total</span>
                      <span className="text-[11px] font-bold text-slate-800">
                        CHF {groupItems.reduce((sum, item) => sum + Math.round((item.tp_mt + item.tp_tt) * tpv * item.quantity * item.external_factor_mt * 100) / 100, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Validation result */}
              {validationResult && (
                <div className={`rounded-lg border p-3 text-[10px] ${validationResult.valid ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                  {validationResult.valid ? (
                    <div>
                      <span className="font-semibold">✓ All services validated successfully</span>
                      {validationResult.summary && (
                        <span className="ml-2 text-emerald-600">
                          (MT: {validationResult.summary.chargeMT?.toFixed(2)}, TT: {validationResult.summary.chargeTT?.toFixed(2)}, Total: CHF {validationResult.summary.totalCharge?.toFixed(2)})
                        </span>
                      )}
                    </div>
                  ) : validationResult.error ? (
                    <span className="font-semibold">Error: {validationResult.error}</span>
                  ) : (
                    <div>
                      <span className="font-semibold">✗ Validation failed:</span>
                      <ul className="mt-1 space-y-0.5">
                        {(validationResult.services || [])
                          .filter((s: any) => !s.accepted)
                          .map((s: any, i: number) => (
                            <li key={i} className="font-mono">
                              {s.code}: {s.errorMessage}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {saveError && <p className="text-[11px] text-red-600">{saveError}</p>}
            </div>

            {/* Actions */}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !saving && setModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || groupItems.length === 0}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingGroup ? "Update Group" : "Create Group"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
