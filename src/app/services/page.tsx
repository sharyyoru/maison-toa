"use client";

import { useEffect, useState, FormEvent } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import TardocGroupsTab from "@/components/TardocGroupsTab";
import MedicationTemplatesTab from "@/components/MedicationTemplatesTab";

type ServiceCategory = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
};

type Service = {
  id: string;
  category_id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  base_price: number | null;
};

type ServiceGroup = {
  id: string;
  name: string;
  description: string | null;
  discount_percent: number | null;
};

type ServiceGroupService = {
  id: string;
  group_id: string;
  service_id: string;
  discount_percent: number | null;
  quantity: number | null;
};

export default function ServicesPage() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>([]);
  const [groupServices, setGroupServices] = useState<ServiceGroupService[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [creatingService, setCreatingService] = useState(false);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupDiscountPercent, setNewGroupDiscountPercent] = useState("");
  const [selectedGroupServiceIds, setSelectedGroupServiceIds] = useState<
    string[]
  >([]);
  const [groupServiceDiscountInputs, setGroupServiceDiscountInputs] = useState<
    Record<string, string>
  >({});
  const [groupServiceQuantityInputs, setGroupServiceQuantityInputs] =
    useState<Record<string, string>>({});
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupMessage, setGroupMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    "categories" | "services" | "groups" | "tardoc_groups" | "med_templates"
  >("categories");

  const [categorySearch, setCategorySearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categoryFilterSearch, setCategoryFilterSearch] = useState("");
  const [categoryFilterDropdownOpen, setCategoryFilterDropdownOpen] = useState(false);

  const [groupSearch, setGroupSearch] = useState("");
  const [groupServiceSearch, setGroupServiceSearch] = useState("");

  const [showCreateService, setShowCreateService] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const [servicesPage, setServicesPage] = useState(1);
  const [groupsPage, setGroupsPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryDescription, setEditCategoryDescription] = useState("");

  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState("");
  const [editServiceDescription, setEditServiceDescription] = useState("");
  const [editServicePrice, setEditServicePrice] = useState("");
  const [editServiceCategoryId, setEditServiceCategoryId] = useState<string>(
    "",
  );

  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(
    null,
  );
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(
    null,
  );
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const { data: categoryData, error: categoryError } = await supabaseClient
          .from("service_categories")
          .select("id, name, description, sort_order")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (!isMounted) return;

        if (categoryError || !categoryData) {
          setError(categoryError?.message ?? "Failed to load service categories.");
          setCategories([]);
          setServices([]);
          setLoading(false);
          return;
        }

        const categoryRows = categoryData as ServiceCategory[];
        setCategories(categoryRows);

        const { data: serviceData, error: serviceError } = await supabaseClient
          .from("services")
          .select(
            "id, category_id, name, code, description, is_active, base_price",
          )
          .order("created_at", { ascending: true });

        if (!isMounted) return;

        if (serviceError || !serviceData) {
          setError(serviceError?.message ?? "Failed to load services.");
          setServices([]);
          setLoading(false);
          return;
        }

        const serviceRows = (serviceData as any[]).map((row) => ({
          id: row.id as string,
          category_id: row.category_id as string,
          name: row.name as string,
          code: (row.code as string | null) ?? null,
          description: (row.description as string | null) ?? null,
          is_active: (row.is_active as boolean) ?? true,
          base_price:
            row.base_price !== null && row.base_price !== undefined
              ? Number(row.base_price)
              : null,
        }));

        setServices(serviceRows as Service[]);

        const { data: groupData, error: groupError } = await supabaseClient
          .from("service_groups")
          .select("id, name, description, discount_percent")
          .order("name", { ascending: true });

        if (!isMounted) return;

        if (groupError || !groupData) {
          setServiceGroups([]);
          setGroupServices([]);
          setLoading(false);
          return;
        }

        setServiceGroups(groupData as ServiceGroup[]);

        const { data: groupServiceData, error: groupServiceError } =
          await supabaseClient
            .from("service_group_services")
            .select("id, group_id, service_id, discount_percent, quantity");

        if (!isMounted) return;

        if (groupServiceError || !groupServiceData) {
          setGroupServices([]);
          setLoading(false);
          return;
        }

        setGroupServices(groupServiceData as ServiceGroupService[]);

        if (!selectedCategoryId && categoryRows.length > 0) {
          setSelectedCategoryId(categoryRows[0].id);
        }

        setLoading(false);
      } catch {
        if (!isMounted) return;
        setError("Failed to load services data.");
        setCategories([]);
        setServices([]);
        setLoading(false);
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreateCategory(event: FormEvent) {
    event.preventDefault();
    if (!newCategoryName.trim()) {
      setCategoryMessage("Please enter a category name.");
      return;
    }

    try {
      setCreatingCategory(true);
      setCategoryMessage(null);

      const sortOrder =
        categories.length > 0
          ? Math.max(...categories.map((c) => c.sort_order ?? 1)) + 1
          : 1;

      const { data, error } = await supabaseClient
        .from("service_categories")
        .insert({
          name: newCategoryName.trim(),
          description: newCategoryDescription.trim() || null,
          sort_order: sortOrder,
        })
        .select("id, name, description, sort_order")
        .single();

      if (error || !data) {
        setCategoryMessage(error?.message ?? "Failed to create category.");
        return;
      }

      const created = data as ServiceCategory;
      setCategories((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
      setNewCategoryName("");
      setNewCategoryDescription("");
      if (!selectedCategoryId) {
        setSelectedCategoryId(created.id);
      }
      setCategoryMessage("Category created.");
    } catch {
      setCategoryMessage("Failed to create category.");
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleCreateService(event: FormEvent) {
    event.preventDefault();

    if (!selectedCategoryId) {
      setServiceMessage("Please select a category.");
      return;
    }
    if (!newServiceName.trim()) {
      setServiceMessage("Please enter a service name.");
      return;
    }

    let priceValue: number | null = null;
    if (newServicePrice.trim()) {
      const parsed = Number(newServicePrice.replace(",", "."));
      if (Number.isNaN(parsed) || parsed < 0) {
        setServiceMessage("Please enter a valid CHF price.");
        return;
      }
      priceValue = parsed;
    }

    try {
      setCreatingService(true);
      setServiceMessage(null);

      const { data, error } = await supabaseClient
        .from("services")
        .insert({
          category_id: selectedCategoryId,
          name: newServiceName.trim(),
          description: newServiceDescription.trim() || null,
          base_price: priceValue,
          is_active: true,
        })
        .select("id, category_id, name, code, description, is_active, base_price")
        .single();

      if (error || !data) {
        setServiceMessage(error?.message ?? "Failed to create service.");
        return;
      }

      const created = data as any;
      const newRow: Service = {
        id: created.id as string,
        category_id: created.category_id as string,
        name: created.name as string,
        code: (created.code as string | null) ?? null,
        description: (created.description as string | null) ?? null,
        is_active: (created.is_active as boolean) ?? true,
        base_price:
          created.base_price !== null && created.base_price !== undefined
            ? Number(created.base_price)
            : null,
      };

      setServices((prev) => [...prev, newRow]);
      setNewServiceName("");
      setNewServiceDescription("");
      setNewServicePrice("");
      setServiceMessage("Service created.");
    } catch {
      setServiceMessage("Failed to create service.");
    } finally {
      setCreatingService(false);
    }
  }

  async function handleCreateGroup(event: FormEvent) {
    event.preventDefault();

    const name = newGroupName.trim();
    if (!name) {
      setGroupMessage("Please enter a group name.");
      return;
    }

    let groupDiscount: number | null = null;
    if (newGroupDiscountPercent.trim()) {
      const parsed = Number(newGroupDiscountPercent.replace(",", "."));
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
        setGroupMessage(
          "Please enter a valid group discount between 0 and 100.",
        );
        return;
      }
      groupDiscount = parsed;
    }

    try {
      setCreatingGroup(true);
      setGroupMessage(null);

      const { data: groupData, error: groupError } = await supabaseClient
        .from("service_groups")
        .insert({
          name,
          description: newGroupDescription.trim() || null,
          discount_percent: groupDiscount,
        })
        .select("id, name, description, discount_percent")
        .single();

      if (groupError || !groupData) {
        setGroupMessage(groupError?.message ?? "Failed to create group.");
        return;
      }

      const createdGroup = groupData as ServiceGroup;

      let createdLinks: ServiceGroupService[] = [];
      if (selectedGroupServiceIds.length > 0) {
        const rows: {
          group_id: string;
          service_id: string;
          discount_percent: number | null;
          quantity: number;
        }[] = [];

        for (const serviceId of selectedGroupServiceIds) {
          const rawDiscount =
            (groupServiceDiscountInputs[serviceId] ?? "").trim();
          let discount: number | null = null;
          if (rawDiscount) {
            const parsed = Number(rawDiscount.replace(",", "."));
            if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
              setGroupMessage(
                "Please enter valid item discounts between 0 and 100.",
              );
              setCreatingGroup(false);
              return;
            }
            discount = parsed;
          }

          let quantity = 1;
          const rawQuantity =
            (groupServiceQuantityInputs[serviceId] ?? "").trim();
          if (rawQuantity) {
            const parsedQuantity = Number(rawQuantity.replace(",", "."));
            if (
              !Number.isFinite(parsedQuantity) ||
              parsedQuantity <= 0 ||
              !Number.isInteger(parsedQuantity)
            ) {
              setGroupMessage(
                "Please enter valid quantities as whole numbers of 1 or greater.",
              );
              setCreatingGroup(false);
              return;
            }
            quantity = parsedQuantity;
          }

          rows.push({
            group_id: createdGroup.id,
            service_id: serviceId,
            discount_percent: discount,
            quantity,
          });
        }

        const { data: linkData, error: linkError } = await supabaseClient
          .from("service_group_services")
          .insert(rows)
          .select("id, group_id, service_id, discount_percent, quantity");

        if (linkError || !linkData) {
          setGroupMessage(linkError?.message ?? "Group created, but linking services failed.");
        } else {
          createdLinks = linkData as ServiceGroupService[];
        }
      }

      setServiceGroups((prev) =>
        [...prev, createdGroup].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      if (createdLinks.length > 0) {
        setGroupServices((prev) => [...prev, ...createdLinks]);
      }

      setNewGroupName("");
      setNewGroupDescription("");
      setSelectedGroupServiceIds([]);
      setNewGroupDiscountPercent("");
      setGroupServiceDiscountInputs({});
      setGroupServiceQuantityInputs({});
      setGroupMessage("Group created.");
    } catch {
      setGroupMessage("Failed to create group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  function handleStartEditCategory(category: ServiceCategory) {
    setEditingCategoryId(category.id);
    setEditCategoryName(category.name);
    setEditCategoryDescription(category.description ?? "");
  }

  function handleCancelEditCategory() {
    setEditingCategoryId(null);
    setEditCategoryName("");
    setEditCategoryDescription("");
    setCategoryMessage(null);
  }

  async function handleSaveCategory(categoryId: string) {
    if (!editCategoryName.trim()) {
      setCategoryMessage("Please enter a category name.");
      return;
    }

    try {
      setSavingCategoryId(categoryId);
      setCategoryMessage(null);

      const { data, error } = await supabaseClient
        .from("service_categories")
        .update({
          name: editCategoryName.trim(),
          description: editCategoryDescription.trim() || null,
        })
        .eq("id", categoryId)
        .select("id, name, description, sort_order")
        .single();

      if (error || !data) {
        setCategoryMessage(error?.message ?? "Failed to update category.");
        return;
      }

      const updated = data as ServiceCategory;
      setCategories((prev) =>
        prev
          .map((category) =>
            category.id === categoryId ? updated : category,
          )
          .sort((a, b) => a.sort_order - b.sort_order),
      );

      setCategoryMessage("Category updated.");
      setEditingCategoryId(null);
      setEditCategoryName("");
      setEditCategoryDescription("");
    } catch {
      setCategoryMessage("Failed to update category.");
    } finally {
      setSavingCategoryId(null);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    const hasServices = services.some((service) => service.category_id === categoryId);
    if (hasServices) {
      setCategoryMessage(
        "Cannot delete category with existing services. Delete or reassign those services first.",
      );
      return;
    }

    try {
      setDeletingCategoryId(categoryId);
      setCategoryMessage(null);

      const { error } = await supabaseClient
        .from("service_categories")
        .delete()
        .eq("id", categoryId);

      if (error) {
        setCategoryMessage(error.message ?? "Failed to delete category.");
        return;
      }

      setCategories((prev) => prev.filter((category) => category.id !== categoryId));

      if (selectedCategoryId === categoryId) {
        const remaining = categories.filter((category) => category.id !== categoryId);
        setSelectedCategoryId(remaining[0]?.id ?? "");
      }

      setCategoryMessage("Category deleted.");
    } catch {
      setCategoryMessage("Failed to delete category.");
    } finally {
      setDeletingCategoryId(null);
    }
  }

  function handleStartEditService(service: Service) {
    setEditingServiceId(service.id);
    setEditServiceName(service.name);
    setEditServiceDescription(service.description ?? "");
    setEditServiceCategoryId(service.category_id);
    setEditServicePrice(
      service.base_price !== null && service.base_price !== undefined
        ? String(service.base_price)
        : "",
    );
  }

  function handleCancelEditService() {
    setEditingServiceId(null);
    setEditServiceName("");
    setEditServiceDescription("");
    setEditServiceCategoryId("");
    setEditServicePrice("");
    setServiceMessage(null);
  }

  async function handleSaveService(serviceId: string) {
    if (!editServiceName.trim()) {
      setServiceMessage("Please enter a service name.");
      return;
    }

    let priceValue: number | null = null;
    if (editServicePrice.trim()) {
      const parsed = Number(editServicePrice.replace(",", "."));
      if (Number.isNaN(parsed) || parsed < 0) {
        setServiceMessage("Please enter a valid CHF price.");
        return;
      }
      priceValue = parsed;
    }

    try {
      setSavingServiceId(serviceId);
      setServiceMessage(null);

      const { data, error } = await supabaseClient
        .from("services")
        .update({
          name: editServiceName.trim(),
          description: editServiceDescription.trim() || null,
          category_id: editServiceCategoryId,
          base_price: priceValue,
        })
        .eq("id", serviceId)
        .select("id, category_id, name, code, description, is_active, base_price")
        .single();

      if (error || !data) {
        setServiceMessage(error?.message ?? "Failed to update service.");
        return;
      }

      const updated = data as any;
      const updatedRow: Service = {
        id: updated.id as string,
        category_id: updated.category_id as string,
        name: updated.name as string,
        code: (updated.code as string | null) ?? null,
        description: (updated.description as string | null) ?? null,
        is_active: (updated.is_active as boolean) ?? true,
        base_price:
          updated.base_price !== null && updated.base_price !== undefined
            ? Number(updated.base_price)
            : null,
      };

      setServices((prev) =>
        prev.map((service) =>
          service.id === serviceId ? updatedRow : service,
        ),
      );

      setServiceMessage("Service updated.");
      setEditingServiceId(null);
      setEditServiceName("");
      setEditServiceDescription("");
      setEditServiceCategoryId("");
      setEditServicePrice("");
    } catch {
      setServiceMessage("Failed to update service.");
    } finally {
      setSavingServiceId(null);
    }
  }

  async function handleDeleteService(serviceId: string) {
    try {
      setDeletingServiceId(serviceId);
      setServiceMessage(null);

      const { error } = await supabaseClient
        .from("services")
        .delete()
        .eq("id", serviceId);

      if (error) {
        setServiceMessage(error.message ?? "Failed to delete service.");
        return;
      }

      setServices((prev) => prev.filter((service) => service.id !== serviceId));
      setServiceMessage("Service deleted.");
    } catch {
      setServiceMessage("Failed to delete service.");
    } finally {
      setDeletingServiceId(null);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    try {
      setDeletingGroupId(groupId);
      setGroupMessage(null);

      const { error: deleteError } = await supabaseClient
        .from("service_groups")
        .delete()
        .eq("id", groupId);

      if (deleteError) {
        setGroupMessage(deleteError.message ?? "Failed to delete group.");
        return;
      }

      setServiceGroups((prev) => prev.filter((group) => group.id !== groupId));
      setGroupServices((prev) =>
        prev.filter((link) => link.group_id !== groupId),
      );

      setGroupMessage("Group deleted.");
    } catch {
      setGroupMessage("Failed to delete group.");
    } finally {
      setDeletingGroupId(null);
    }
  }

  const categoriesById = new Map(categories.map((c) => [c.id, c] as const));
  const servicesById = new Map(services.map((s) => [s.id, s] as const));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Services</h1>
        <p className="text-sm text-slate-500">
          Define service categories and services offered by the clinic. Prices are in CHF.
        </p>
      </div>

      <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-1 py-0.5 text-[11px] text-slate-500">
        <button
          type="button"
          onClick={() => setActiveTab("categories")}
          className={
            "rounded-full px-2 py-0.5 text-[11px] " +
            (activeTab === "categories"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900")
          }
        >
          Categories
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("services")}
          className={
            "rounded-full px-2 py-0.5 text-[11px] " +
            (activeTab === "services"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900")
          }
        >
          Services
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("groups")}
          className={
            "rounded-full px-2 py-0.5 text-[11px] " +
            (activeTab === "groups"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900")
          }
        >
          Groups
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tardoc_groups")}
          className={
            "rounded-full px-2 py-0.5 text-[11px] " +
            (activeTab === "tardoc_groups"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900")
          }
        >
          TarDoc Groups
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("med_templates")}
          className={
            "rounded-full px-2 py-0.5 text-[11px] " +
            (activeTab === "med_templates"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900")
          }
        >
          Medication Templates
        </button>
      </div>

      {activeTab === "categories" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
            <h2 className="text-sm font-medium text-slate-800">New category</h2>
            <p className="mt-1 text-xs text-slate-500">
              Create high-level groupings such as Aesthetics or Reconstructive.
            </p>
            <form onSubmit={handleCreateCategory} className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Category name
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  placeholder="Aesthetics"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Description (optional)
                </label>
                <textarea
                  value={newCategoryDescription}
                  onChange={(event) =>
                    setNewCategoryDescription(event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  rows={2}
                  placeholder="Aesthetic and cosmetic procedures"
                />
              </div>
              {categoryMessage ? (
                <p className="text-xs text-slate-500">{categoryMessage}</p>
              ) : null}
              <button
                type="submit"
                disabled={creatingCategory}
                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingCategory ? "Creating..." : "Create category"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
            <h2 className="text-sm font-medium text-slate-800">Categories</h2>
            <p className="mt-1 text-xs text-slate-500">
              Existing service categories.
            </p>
            <div className="mt-2">
              <input
                type="text"
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="Search categories..."
                className="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
            </div>
            {loading ? (
              <p className="mt-2 text-xs text-slate-500">Loading categories...</p>
            ) : categories.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No categories yet.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-xs text-slate-700">
                {categories
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .filter((category) => {
                    const term = categorySearch.trim().toLowerCase();
                    if (!term) return true;
                    const haystack = `${category.name} ${category.description ?? ""
                      }`.toLowerCase();
                    return haystack.includes(term);
                  })
                  .map((category) => {
                    const isEditing = editingCategoryId === category.id;
                    const isSaving = savingCategoryId === category.id;
                    const isDeleting = deletingCategoryId === category.id;

                    if (isEditing) {
                      return (
                        <li
                          key={category.id}
                          className="space-y-1 rounded-md bg-slate-50/70 px-2 py-2"
                        >
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={editCategoryName}
                                onChange={(event) =>
                                  setEditCategoryName(event.target.value)
                                }
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                              />
                              <textarea
                                value={editCategoryDescription}
                                onChange={(event) =>
                                  setEditCategoryDescription(event.target.value)
                                }
                                rows={2}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                              />
                            </div>
                            <div className="flex flex-col items-end gap-1 text-[11px]">
                              <span className="text-slate-400">#{category.sort_order}</span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => void handleSaveCategory(category.id)}
                                  disabled={isSaving}
                                  className="inline-flex items-center rounded-full bg-emerald-500 px-3 py-0.5 font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isSaving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditCategory}
                                  disabled={isSaving}
                                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-0.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleDeleteCategory(category.id)}
                                disabled={isDeleting || isSaving}
                                className="mt-1 inline-flex items-center text-[11px] font-medium text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isDeleting ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={category.id}
                        className="flex items-center justify-between rounded-md bg-slate-50/70 px-2 py-1"
                      >
                        <div>
                          <div className="font-medium text-slate-900">
                            {category.name}
                          </div>
                          {category.description ? (
                            <div className="text-[11px] text-slate-500">
                              {category.description}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-1 text-[11px]">
                          <span className="text-slate-400">
                            #{category.sort_order}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditCategory(category)}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteCategory(category.id)}
                              disabled={deletingCategoryId === category.id}
                              className="inline-flex items-center rounded-full border border-red-100 bg-red-50 px-2 py-0.5 font-medium text-red-600 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingCategoryId === category.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "services" ? (
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-slate-800">Services</h2>
              <p className="text-xs text-slate-500">
                Manage individual services under categories. Prices are stored in CHF.
              </p>
            </div>
            {!showCreateService && (
              <button
                type="button"
                onClick={() => setShowCreateService(true)}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600"
              >
                <span className="inline-flex h-3 w-3 items-center justify-center">
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 4v12" />
                    <path d="M4 10h12" />
                  </svg>
                </span>
                <span>Create service</span>
              </button>
            )}
          </div>

          {showCreateService && (
            <form onSubmit={handleCreateService} className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Category
                  </label>
                  <select
                    value={selectedCategoryId}
                    onChange={(event) => setSelectedCategoryId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  >
                    {categories.length === 0 ? (
                      <option value="">No categories yet</option>
                    ) : (
                      categories
                        .slice()
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Service name
                  </label>
                  <input
                    type="text"
                    value={newServiceName}
                    onChange={(event) => setNewServiceName(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    placeholder="Liposuction"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Description (optional)
                  </label>
                  <textarea
                    value={newServiceDescription}
                    onChange={(event) =>
                      setNewServiceDescription(event.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    rows={2}
                    placeholder="Short description of the service"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Price (CHF)
                  </label>
                  <div className="mt-1 flex rounded-lg border border-slate-200 bg-white text-xs text-slate-900 shadow-sm focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400">
                    <span className="inline-flex items-center px-2 text-[11px] text-slate-500">
                      CHF
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.05"
                      value={newServicePrice}
                      onChange={(event) => setNewServicePrice(event.target.value)}
                      className="flex-1 rounded-r-lg border-0 bg-transparent px-2 py-1.5 text-right outline-none"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Leave blank if price is variable or defined elsewhere.
                  </p>
                </div>
              </div>

              {serviceMessage ? (
                <p className="text-xs text-slate-500">{serviceMessage}</p>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creatingService}
                  className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingService ? "Creating..." : "Create service"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateService(false);
                    setServiceMessage(null);
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Existing services
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="text"
                value={serviceSearch}
                onChange={(event) => {
                  setServiceSearch(event.target.value);
                  setServicesPage(1);
                }}
                placeholder="Search services by name..."
                className="flex-1 min-w-[200px] rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
              <div className="relative">
                <input
                  type="text"
                  value={categoryFilterSearch}
                  onChange={(event) => {
                    setCategoryFilterSearch(event.target.value);
                    setCategoryFilterDropdownOpen(event.target.value.trim().length > 0);
                  }}
                  onFocus={() => setCategoryFilterDropdownOpen(categoryFilterSearch.trim().length > 0)}
                  placeholder="Filter by category..."
                  className="w-48 rounded-full border border-slate-200 bg-white px-3 py-1.5 pr-7 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                {categoryFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter("all");
                      setCategoryFilterSearch("");
                      setCategoryFilterDropdownOpen(false);
                      setServicesPage(1);
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                )}
                {categoryFilterDropdownOpen && (() => {
                  const query = categoryFilterSearch.trim().toLowerCase();
                  const filteredCategories = categories
                    .filter((c) => {
                      const hay = c.name.toLowerCase();
                      return hay.includes(query);
                    })
                    .slice(0, 6);

                  if (filteredCategories.length === 0) return null;

                  return (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow-lg z-10">
                      {filteredCategories.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => {
                            setCategoryFilter(category.id);
                            setCategoryFilterSearch(category.name);
                            setCategoryFilterDropdownOpen(false);
                            setServicesPage(1);
                          }}
                          className="block w-full cursor-pointer px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            {loading ? (
              <p className="mt-2 text-xs text-slate-500">Loading services...</p>
            ) : services.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No services yet.</p>
            ) : (() => {
              const filteredServices = services
                .filter((service) => {
                  // Category filter
                  if (categoryFilter !== "all" && service.category_id !== categoryFilter) {
                    return false;
                  }
                  // Search filter
                  const term = serviceSearch.trim().toLowerCase();
                  if (!term) return true;
                  const category = categoriesById.get(service.category_id);
                  const haystack = `${service.name} ${service.description ?? ""
                    } ${category ? category.name : ""}`.toLowerCase();
                  return haystack.includes(term);
                });

              const totalPages = Math.ceil(filteredServices.length / ITEMS_PER_PAGE);
              const startIndex = (servicesPage - 1) * ITEMS_PER_PAGE;
              const endIndex = startIndex + ITEMS_PER_PAGE;
              const paginatedServices = filteredServices.slice(startIndex, endIndex);

              return (
                <>
                  <div className="mt-2 space-y-1 text-xs">
                    {paginatedServices.map((service) => {
                      const category = categoriesById.get(service.category_id);
                      const isEditing = editingServiceId === service.id;
                      const isSaving = savingServiceId === service.id;
                      const isDeleting = deletingServiceId === service.id;

                      if (isEditing) {
                        return (
                          <div
                            key={service.id}
                            className="space-y-2 rounded-md bg-slate-50/70 px-2 py-2"
                          >
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={editServiceName}
                                  onChange={(event) =>
                                    setEditServiceName(event.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                />
                                <select
                                  value={editServiceCategoryId}
                                  onChange={(event) =>
                                    setEditServiceCategoryId(event.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                >
                                  {categories
                                    .slice()
                                    .sort((a, b) => a.sort_order - b.sort_order)
                                    .map((category) => (
                                      <option key={category.id} value={category.id}>
                                        {category.name}
                                      </option>
                                    ))}
                                </select>
                                <textarea
                                  value={editServiceDescription}
                                  onChange={(event) =>
                                    setEditServiceDescription(event.target.value)
                                  }
                                  rows={2}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                />
                              </div>
                              <div className="flex flex-col items-end gap-1 text-[11px]">
                                <span className="text-slate-500">
                                  {category ? category.name : "Unknown category"}
                                </span>
                                <div className="mt-1 flex w-full rounded-lg border border-slate-200 bg-white text-xs text-slate-900 shadow-sm focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400">
                                  <span className="inline-flex items-center px-2 text-[11px] text-slate-500">
                                    CHF
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.05"
                                    value={editServicePrice}
                                    onChange={(event) =>
                                      setEditServicePrice(event.target.value)
                                    }
                                    className="flex-1 rounded-r-lg border-0 bg-transparent px-2 py-1.5 text-right outline-none"
                                    placeholder="0.00"
                                  />
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveService(service.id)}
                                    disabled={isSaving}
                                    className="inline-flex items-center rounded-full bg-emerald-500 px-3 py-0.5 font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isSaving ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEditService}
                                    disabled={isSaving}
                                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-0.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteService(service.id)}
                                  disabled={isDeleting || isSaving}
                                  className="mt-1 inline-flex items-center text-[11px] font-medium text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isDeleting ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={service.id}
                          className="flex items-center justify-between rounded-md bg-slate-50/70 px-2 py-1"
                        >
                          <div>
                            <div className="font-medium text-slate-900">
                              {service.code && (
                                <>
                                  <span className="font-bold text-[10px] mr-1">{service.code}</span>
                                  <span className="text-slate-400 mr-1">-</span>
                                </>
                              )}
                              {service.name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {category ? category.name : "Unknown category"}
                              {service.description
                                ? ` · ${service.description}`
                                : ""}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-[11px] text-slate-700">
                            {service.base_price !== null ? (
                              <span>CHF {service.base_price.toFixed(2)}</span>
                            ) : (
                              <span className="text-slate-400">CHF —</span>
                            )}
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEditService(service)}
                                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteService(service.id)}
                                disabled={deletingServiceId === service.id}
                                className="inline-flex items-center rounded-full border border-red-100 bg-red-50 px-2 py-0.5 font-medium text-red-600 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingServiceId === service.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination controls */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <p className="text-[11px] text-slate-500">
                        Showing {startIndex + 1} to {Math.min(endIndex, filteredServices.length)} of {filteredServices.length} services
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setServicesPage((p) => Math.max(1, p - 1))}
                          disabled={servicesPage === 1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          ←
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (servicesPage <= 3) {
                            pageNum = i + 1;
                          } else if (servicesPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = servicesPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setServicesPage(pageNum)}
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] ${servicesPage === pageNum
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setServicesPage((p) => Math.min(totalPages, p + 1))}
                          disabled={servicesPage === totalPages}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {error ? (
              <p className="mt-2 text-xs text-red-600">{error}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "groups" ? (
        <div className="space-y-6">
          {showCreateGroup && (
            <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium text-slate-800">New group</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Create reusable bundles of services that can be referenced elsewhere.
                  </p>
                </div>
              </div>
              <form onSubmit={handleCreateGroup} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Group name
                  </label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(event) => setNewGroupName(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    placeholder="Pre-op bundle"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Description (optional)
                  </label>
                  <textarea
                    value={newGroupDescription}
                    onChange={(event) => setNewGroupDescription(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    rows={2}
                    placeholder="Example: Common services for a standard pre-op visit"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Group discount (%)
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={newGroupDiscountPercent}
                      onChange={(event) =>
                        setNewGroupDiscountPercent(event.target.value)
                      }
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      placeholder="0"
                    />
                    <span className="text-[11px] text-slate-500">
                      Applied to all services in the group that do not have an
                      item-specific discount.
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Services in this group
                  </label>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Select one or more services to bundle. You can update groups later in the
                    database if needed.
                  </p>
                  <div className="mt-2">
                    <input
                      type="text"
                      value={groupServiceSearch}
                      onChange={(event) => setGroupServiceSearch(event.target.value)}
                      placeholder="Search services by name or category..."
                      className="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>
                  <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                    {services.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        No services available yet.
                      </p>
                    ) : (
                      services
                        .filter((service) => {
                          const term = groupServiceSearch.trim().toLowerCase();
                          if (!term) return true;
                          const category = categoriesById.get(service.category_id);
                          const haystack = `${service.name} ${service.description ?? ""
                            } ${category ? category.name : ""}`.toLowerCase();
                          return haystack.includes(term);
                        })
                        .map((service) => {
                          const category = categoriesById.get(service.category_id);
                          const checked = selectedGroupServiceIds.includes(service.id);
                          const discountInput =
                            groupServiceDiscountInputs[service.id] ?? "";
                          const quantityInput =
                            groupServiceQuantityInputs[service.id] ?? "";
                          return (
                            <label
                              key={service.id}
                              className="flex cursor-pointer items-center justify-between rounded-md bg-white px-2 py-1 text-[11px] text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    const isChecked = event.target.checked;
                                    setSelectedGroupServiceIds((prev) =>
                                      isChecked
                                        ? [...prev, service.id]
                                        : prev.filter((id) => id !== service.id),
                                    );
                                    setGroupServiceQuantityInputs((prev) => {
                                      if (isChecked) {
                                        const existing =
                                          (prev[service.id] ?? "").trim();
                                        return {
                                          ...prev,
                                          [service.id]: existing || "1",
                                        };
                                      }
                                      const { [service.id]: _removed, ...rest } = prev;
                                      return rest;
                                    });
                                  }}
                                  className="h-3 w-3 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                                />
                                <span>
                                  <span className="font-medium text-slate-900">
                                    {service.name}
                                  </span>
                                  <span className="ml-1 text-[10px] text-slate-500">
                                    {category ? `(${category.name})` : ""}
                                  </span>
                                </span>
                              </span>
                              <span className="flex items-center gap-2 text-[10px] text-slate-600">
                                <span>
                                  {service.base_price !== null
                                    ? `CHF ${service.base_price.toFixed(2)}`
                                    : "CHF —"}
                                </span>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={quantityInput}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setGroupServiceQuantityInputs((prev) => ({
                                      ...prev,
                                      [service.id]: value,
                                    }));
                                  }}
                                  className="w-12 rounded border border-slate-200 bg-white px-1 py-0.5 text-right text-[10px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                  placeholder="Qty"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  value={discountInput}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setGroupServiceDiscountInputs((prev) => ({
                                      ...prev,
                                      [service.id]: value,
                                    }));
                                  }}
                                  className="w-14 rounded border border-slate-200 bg-white px-1 py-0.5 text-right text-[10px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                  placeholder="%"
                                />
                              </span>
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>

                {groupMessage ? (
                  <p className="text-xs text-slate-500">{groupMessage}</p>
                ) : null}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creatingGroup}
                    className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingGroup ? "Creating..." : "Create group"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateGroup(false);
                      setGroupMessage(null);
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium text-slate-800">Groups</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Existing service bundles.
                </p>
              </div>
              {!showCreateGroup && (
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600"
                >
                  <span className="inline-flex h-3 w-3 items-center justify-center">
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10 4v12" />
                      <path d="M4 10h12" />
                    </svg>
                  </span>
                  <span>Create group</span>
                </button>
              )}
            </div>
            <div className="mt-2">
              <input
                type="text"
                value={groupSearch}
                onChange={(event) => {
                  setGroupSearch(event.target.value);
                  setGroupsPage(1);
                }}
                placeholder="Search groups..."
                className="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
            </div>
            {loading ? (
              <p className="mt-2 text-xs text-slate-500">Loading groups...</p>
            ) : serviceGroups.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No groups yet.</p>
            ) : (() => {
              const filteredGroups = serviceGroups
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .filter((group) => {
                  const term = groupSearch.trim().toLowerCase();
                  if (!term) return true;
                  const haystack = `${group.name} ${group.description ?? ""
                    }`.toLowerCase();
                  return haystack.includes(term);
                });

              const totalPages = Math.ceil(filteredGroups.length / ITEMS_PER_PAGE);
              const startIndex = (groupsPage - 1) * ITEMS_PER_PAGE;
              const endIndex = startIndex + ITEMS_PER_PAGE;
              const paginatedGroups = filteredGroups.slice(startIndex, endIndex);

              return (
                <>
                  <ul className="mt-3 space-y-1 text-xs text-slate-700">
                    {paginatedGroups.map((group) => {
                      const links = groupServices.filter(
                        (link) => link.group_id === group.id,
                      );
                      const linkedServices = links
                        .map((link) => servicesById.get(link.service_id))
                        .filter((s): s is Service => Boolean(s));

                      const linkByServiceId = new Map(
                        links.map((link) => [link.service_id, link] as const),
                      );
                      const groupDiscountPercent = group.discount_percent ?? 0;

                      const totalQuantity = links.reduce((sum, link) => {
                        const rawQuantity = link.quantity;
                        const quantity =
                          typeof rawQuantity === "number" &&
                            Number.isFinite(rawQuantity) &&
                            rawQuantity > 0
                            ? rawQuantity
                            : 1;
                        return sum + quantity;
                      }, 0);

                      const originalTotal = linkedServices.reduce((sum, service) => {
                        const price = service.base_price ?? 0;
                        const link = linkByServiceId.get(service.id);
                        const rawQuantity = link?.quantity;
                        const quantity =
                          typeof rawQuantity === "number" &&
                            Number.isFinite(rawQuantity) &&
                            rawQuantity > 0
                            ? rawQuantity
                            : 1;
                        return sum + price * quantity;
                      }, 0);

                      const groupTotal = linkedServices.reduce((sum, service) => {
                        const price = service.base_price ?? 0;
                        const link = linkByServiceId.get(service.id);
                        const rawQuantity = link?.quantity;
                        const quantity =
                          typeof rawQuantity === "number" &&
                            Number.isFinite(rawQuantity) &&
                            rawQuantity > 0
                            ? rawQuantity
                            : 1;
                        let discountPercent =
                          link && link.discount_percent !== null
                            ? link.discount_percent
                            : groupDiscountPercent;
                        if (!Number.isFinite(discountPercent) || discountPercent < 0) {
                          discountPercent = 0;
                        }
                        if (discountPercent > 100) discountPercent = 100;
                        const discountedUnitPrice =
                          price * (1 - (discountPercent as number) / 100);
                        return sum + discountedUnitPrice * quantity;
                      }, 0);

                      const hasDiscount =
                        originalTotal > 0 && groupTotal < originalTotal - 0.005;

                      return (
                        <li
                          key={group.id}
                          className="space-y-1 rounded-md bg-slate-50/70 px-2 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-slate-900">
                                {group.name}
                              </div>
                              {group.description ? (
                                <div className="text-[11px] text-slate-500">
                                  {group.description}
                                </div>
                              ) : null}
                              <div className="mt-1 text-[11px] text-slate-500">
                                {totalQuantity} service
                                {totalQuantity === 1 ? "" : "s"}
                                {originalTotal > 0 ? (
                                  hasDiscount ? (
                                    <span className="ml-1 text-slate-400">
                                      · CHF {originalTotal.toFixed(2)} → CHF {groupTotal.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="ml-1 text-slate-400">
                                      · Total CHF {groupTotal.toFixed(2)}
                                    </span>
                                  )
                                ) : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleDeleteGroup(group.id)}
                              disabled={deletingGroupId === group.id}
                              className="inline-flex items-center rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingGroupId === group.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                          {linkedServices.length > 0 ? (
                            <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                              {linkedServices.map((service) => {
                                const category = categoriesById.get(
                                  service.category_id,
                                );
                                const link = linkByServiceId.get(service.id);
                                const rawQuantity = link?.quantity;
                                const quantity =
                                  typeof rawQuantity === "number" &&
                                    Number.isFinite(rawQuantity) &&
                                    rawQuantity > 0
                                    ? rawQuantity
                                    : 1;
                                const unitPrice = service.base_price ?? 0;
                                const lineTotal =
                                  service.base_price !== null ? unitPrice * quantity : null;
                                return (
                                  <li key={service.id} className="flex justify-between">
                                    <span>
                                      {service.name}
                                      {quantity > 1 ? (
                                        <span className="ml-1 text-[10px] text-slate-400">
                                          ×{quantity}
                                        </span>
                                      ) : null}
                                      {category ? (
                                        <span className="ml-1 text-[10px] text-slate-400">
                                          ({category.name})
                                        </span>
                                      ) : null}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      {lineTotal !== null
                                        ? `CHF ${lineTotal.toFixed(2)}`
                                        : "CHF —"}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>

                  {/* Pagination controls */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <p className="text-[11px] text-slate-500">
                        Showing {startIndex + 1} to {Math.min(endIndex, filteredGroups.length)} of {filteredGroups.length} groups
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setGroupsPage((p) => Math.max(1, p - 1))}
                          disabled={groupsPage === 1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          ←
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (groupsPage <= 3) {
                            pageNum = i + 1;
                          } else if (groupsPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = groupsPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setGroupsPage(pageNum)}
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] ${groupsPage === pageNum
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setGroupsPage((p) => Math.min(totalPages, p + 1))}
                          disabled={groupsPage === totalPages}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      ) : activeTab === "tardoc_groups" ? (
        <TardocGroupsTab />
      ) : activeTab === "med_templates" ? (
        <MedicationTemplatesTab />
      ) : null}
    </div>
  );
}
