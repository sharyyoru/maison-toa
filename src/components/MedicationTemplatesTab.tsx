"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type TemplateItem = {
  id?: string;
  product_name: string;
  product_number: number | null;
  product_type: string;
  intake_kind: string;
  amount_morning: string | null;
  amount_noon: string | null;
  amount_evening: string | null;
  amount_night: string | null;
  quantity: number;
  intake_note: string | null;
  sort_order: number;
  // UI-only fields for compendium search
  searchQuery?: string;
  searchResults?: { label: string; productNumber: number }[];
  searchLoading?: boolean;
  dropdownOpen?: boolean;
};

type MedicationTemplate = {
  id: string;
  name: string;
  description: string | null;
  service_id: string | null;
  service_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  medication_template_items: TemplateItem[];
};

type ServiceOption = {
  id: string;
  name: string;
  category_id: string | null;
};

type ServiceCategory = {
  id: string;
  name: string;
};

function createEmptyItem(): TemplateItem {
  return {
    product_name: "",
    product_number: null,
    product_type: "MEDICATION",
    intake_kind: "FIXED",
    amount_morning: null,
    amount_noon: null,
    amount_evening: null,
    amount_night: null,
    quantity: 1,
    intake_note: null,
    sort_order: 0,
    searchQuery: "",
    searchResults: [],
    searchLoading: false,
    dropdownOpen: false,
  };
}

export default function MedicationTemplatesTab() {
  const [templates, setTemplates] = useState<MedicationTemplate[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create/Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MedicationTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateServiceId, setTemplateServiceId] = useState<string>("");
  const [templateServiceCategoryId, setTemplateServiceCategoryId] = useState<string>("");
  const [templateServiceSearch, setTemplateServiceSearch] = useState("");
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Search refs for debounce
  const searchTimeoutRefs = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/medication-templates");
      const json = await res.json();
      if (json.success) {
        setTemplates(json.data || []);
      } else {
        setError(json.error || "Failed to load templates");
      }
    } catch {
      setError("Failed to load templates");
    }
    setLoading(false);
  }, []);

  const loadServices = useCallback(async () => {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const [{ data: categoryData }, { data: serviceData }] = await Promise.all([
        supabase.from("service_categories").select("id, name").order("name", { ascending: true }),
        supabase.from("services").select("id, name, category_id").order("name", { ascending: true }),
      ]);
      if (categoryData) setServiceCategories(categoryData as ServiceCategory[]);
      if (serviceData) setServices(serviceData as ServiceOption[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
    void loadServices();
  }, [loadTemplates, loadServices]);

  function openCreateModal() {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateDescription("");
    setTemplateServiceId("");
    setTemplateServiceCategoryId("");
    setTemplateServiceSearch("");
    setServiceDropdownOpen(false);
    setTemplateItems([createEmptyItem()]);
    setSaveError(null);
    setModalOpen(true);
  }

  function openEditModal(template: MedicationTemplate) {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setTemplateServiceId(template.service_id || "");
    setTemplateServiceCategoryId("");
    setTemplateServiceSearch(template.service_name || "");
    setServiceDropdownOpen(false);
    setTemplateItems(
      (template.medication_template_items || []).map((item, idx) => ({
        ...item,
        sort_order: item.sort_order ?? idx,
        searchQuery: item.product_name,
        searchResults: [],
        searchLoading: false,
        dropdownOpen: false,
      })),
    );
    setSaveError(null);
    setModalOpen(true);
  }

  useEffect(() => {
    if (!templateServiceId) return;
    const selectedService = services.find((service) => service.id === templateServiceId);
    if (!selectedService) return;

    if (templateServiceSearch !== selectedService.name) {
      setTemplateServiceSearch(selectedService.name);
    }

    if (!templateServiceCategoryId && selectedService.category_id) {
      setTemplateServiceCategoryId(selectedService.category_id);
    }
  }, [templateServiceId, services, templateServiceSearch, templateServiceCategoryId]);

  const filteredLinkedServices = services.filter((service) => {
    if (templateServiceCategoryId && service.category_id !== templateServiceCategoryId) {
      return false;
    }

    const term = templateServiceSearch.trim().toLowerCase();
    if (!term) return true;
    return service.name.toLowerCase().includes(term);
  });

  function addItem() {
    setTemplateItems((prev) => [...prev, createEmptyItem()]);
  }

  function removeItem(idx: number) {
    setTemplateItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  function updateItem(idx: number, updates: Partial<TemplateItem>) {
    setTemplateItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)),
    );
  }

  async function searchCompendium(idx: number, query: string) {
    if (searchTimeoutRefs.current[idx]) {
      clearTimeout(searchTimeoutRefs.current[idx]!);
    }
    if (query.trim().length < 2) {
      updateItem(idx, { searchResults: [], searchLoading: false });
      return;
    }
    updateItem(idx, { searchLoading: true });
    searchTimeoutRefs.current[idx] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/compendium/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        updateItem(idx, { searchResults: data.products ?? [], searchLoading: false });
      } catch {
        updateItem(idx, { searchResults: [], searchLoading: false });
      }
    }, 300);
  }

  async function handleSave() {
    if (!templateName.trim()) {
      setSaveError("Template name is required");
      return;
    }
    const validItems = templateItems.filter((item) => item.product_name.trim());
    if (validItems.length === 0) {
      setSaveError("Add at least one product");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const itemsPayload = validItems.map((item, idx) => ({
        product_name: item.product_name,
        product_number: item.product_number,
        product_type: item.product_type,
        intake_kind: item.intake_kind,
        amount_morning: item.amount_morning || null,
        amount_noon: item.amount_noon || null,
        amount_evening: item.amount_evening || null,
        amount_night: item.amount_night || null,
        quantity: item.quantity || 1,
        intake_note: item.intake_note || null,
        sort_order: idx,
      }));

      const method = editingTemplate ? "PUT" : "POST";
      const bodyPayload: Record<string, unknown> = {
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        service_id: templateServiceId || null,
        items: itemsPayload,
      };
      if (editingTemplate) bodyPayload.id = editingTemplate.id;

      const res = await fetch("/api/medication-templates", {
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
      await loadTemplates();
    } catch {
      setSaveError("Failed to save template");
    }
    setSaving(false);
  }

  async function handleDelete(templateId: string) {
    if (!confirm("Are you sure you want to delete this template?")) return;
    setDeletingId(templateId);
    try {
      await fetch("/api/medication-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: templateId }),
      });
      await loadTemplates();
    } catch {
      /* ignore */
    }
    setDeletingId(null);
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Medication Templates</h2>
            <p className="text-[11px] text-slate-500">
              Create preset groups of medicines for quick prescription creation. Optionally link to a service.
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
            New Template
          </button>
        </div>

        {loading && <div className="py-8 text-center text-xs text-slate-400">Loading...</div>}
        {error && <div className="py-4 text-center text-xs text-red-500">{error}</div>}

        {!loading && templates.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-400">
            No medication templates yet. Create one to get started.
          </div>
        )}

        {!loading && templates.length > 0 && (
          <div className="space-y-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-slate-900">{template.name}</h3>
                      {template.service_name && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 border border-sky-200">
                          {template.service_name}
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="mt-0.5 text-[11px] text-slate-500">{template.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {template.medication_template_items.map((item, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700 border border-slate-200"
                        >
                          {item.product_name}
                          {item.quantity > 1 && (
                            <span className="ml-1 text-slate-400">×{item.quantity}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(template)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title="Edit"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(template.id)}
                      disabled={deletingId === template.id}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      title="Delete"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editingTemplate ? "Edit Template" : "New Medication Template"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-full p-1 hover:bg-slate-100"
              >
                <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Template Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Template Name *</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Post-Lipo Medication"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Description</label>
                <input
                  type="text"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Link to Service */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Link to Service <span className="text-slate-400">(optional)</span>
                </label>
                <div className="space-y-2">
                  <select
                    value={templateServiceCategoryId}
                    onChange={(e) => setTemplateServiceCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">All categories</option>
                    {serviceCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>

                  <div className="relative">
                    <input
                      type="text"
                      value={templateServiceSearch}
                      onChange={(e) => {
                        setTemplateServiceSearch(e.target.value);
                        setTemplateServiceId("");
                        setServiceDropdownOpen(true);
                      }}
                      onFocus={() => setServiceDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setServiceDropdownOpen(false), 150)}
                      placeholder="Search service to link..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />

                    {templateServiceId ? (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTemplateServiceId("");
                          setTemplateServiceSearch("");
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title="Clear linked service"
                      >
                        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                        </svg>
                      </button>
                    ) : null}

                    {serviceDropdownOpen && (
                      <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-sm">
                        {filteredLinkedServices.length > 0 ? (
                          filteredLinkedServices.map((service) => (
                            <li key={service.id}>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setTemplateServiceId(service.id);
                                  setTemplateServiceSearch(service.name);
                                  setServiceDropdownOpen(false);
                                }}
                                className="w-full px-3 py-2 text-left text-slate-800 hover:bg-sky-50 hover:text-sky-700"
                              >
                                {service.name}
                              </button>
                            </li>
                          ))
                        ) : (
                          <li className="px-3 py-2 text-slate-400 italic">No services found</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  When linked, this template will appear when the service is selected during prescription creation.
                </p>
              </div>

              {/* Items */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">Products *</label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Product
                  </button>
                </div>

                <div className="space-y-2">
                  {templateItems.map((item, idx) => (
                    <div key={idx} className="rounded-md border border-slate-100 bg-slate-50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-slate-500">Product {idx + 1}</span>
                        {templateItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Product Name with compendium search */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-600">Product Name *</label>
                          <input
                            type="text"
                            value={item.searchQuery ?? item.product_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateItem(idx, {
                                searchQuery: val,
                                product_name: val,
                                dropdownOpen: true,
                              });
                              searchCompendium(idx, val);
                            }}
                            onFocus={() => updateItem(idx, { dropdownOpen: true })}
                            onBlur={() => setTimeout(() => updateItem(idx, { dropdownOpen: false }), 150)}
                            placeholder="Type to search medicine"
                            autoComplete="off"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 pr-7 text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          {item.searchLoading && (
                            <span className="pointer-events-none absolute right-2 top-[26px]">
                              <svg className="h-3.5 w-3.5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                              </svg>
                            </span>
                          )}
                          {item.dropdownOpen && (item.searchResults?.length ?? 0) > 0 && (
                            <ul className="absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-xs">
                              {item.searchResults!.map((result) => (
                                <li key={result.productNumber}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      updateItem(idx, {
                                        product_name: result.label,
                                        product_number: result.productNumber,
                                        searchQuery: result.label,
                                        dropdownOpen: false,
                                        searchResults: [],
                                      });
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-slate-800 hover:bg-sky-50 hover:text-sky-700"
                                  >
                                    {result.label}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-slate-600">Type</label>
                            <select
                              value={item.product_type}
                              onChange={(e) => updateItem(idx, { product_type: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                            >
                              <option value="MEDICATION">Medication</option>
                              <option value="CONSUMABLE">Consumable</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-slate-600">Intake</label>
                            <select
                              value={item.intake_kind}
                              onChange={(e) => updateItem(idx, { intake_kind: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                            >
                              <option value="FIXED">Fixed (F)</option>
                              <option value="ACUTE">Acute (M)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Dosage + Quantity */}
                      <div className="grid grid-cols-5 gap-2">
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-600">Morning</label>
                          <input
                            type="text"
                            value={item.amount_morning || ""}
                            onChange={(e) => updateItem(idx, { amount_morning: e.target.value || null })}
                            placeholder="-"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-600">Noon</label>
                          <input
                            type="text"
                            value={item.amount_noon || ""}
                            onChange={(e) => updateItem(idx, { amount_noon: e.target.value || null })}
                            placeholder="-"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-600">Evening</label>
                          <input
                            type="text"
                            value={item.amount_evening || ""}
                            onChange={(e) => updateItem(idx, { amount_evening: e.target.value || null })}
                            placeholder="-"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-600">Night</label>
                          <input
                            type="text"
                            value={item.amount_night || ""}
                            onChange={(e) => updateItem(idx, { amount_night: e.target.value || null })}
                            placeholder="-"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-600">Qty</label>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, { quantity: parseInt(e.target.value, 10) || 1 })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                      </div>

                      {/* Intake Note */}
                      <div>
                        <label className="mb-0.5 block text-[10px] font-medium text-slate-600">Intake Note</label>
                        <input
                          type="text"
                          value={item.intake_note || ""}
                          onChange={(e) => updateItem(idx, { intake_note: e.target.value || null })}
                          placeholder="e.g. Take with food"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Error */}
              {saveError && (
                <p className="text-xs text-red-600">{saveError}</p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
