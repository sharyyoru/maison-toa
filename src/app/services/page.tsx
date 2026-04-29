"use client";

import { useEffect, useState, FormEvent } from "react";
import { useTranslations } from "next-intl";
import { supabaseClient } from "@/lib/supabaseClient";
import TardocGroupsTab from "@/components/TardocGroupsTab";
import MedicationTemplatesTab from "@/components/MedicationTemplatesTab";

type ServiceCategory = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  color: string | null;
};

// Preset Tailwind color classes available for category badges.
const CATEGORY_COLOR_PRESETS: { label: string; value: string }[] = [
  { label: "Slate", value: "bg-slate-300/70" },
  { label: "Gray", value: "bg-gray-300/70" },
  { label: "Red", value: "bg-red-300/70" },
  { label: "Orange", value: "bg-orange-300/70" },
  { label: "Amber", value: "bg-amber-300/70" },
  { label: "Yellow", value: "bg-yellow-300/70" },
  { label: "Lime", value: "bg-lime-300/70" },
  { label: "Green", value: "bg-green-300/70" },
  { label: "Emerald", value: "bg-emerald-300/70" },
  { label: "Teal", value: "bg-teal-300/70" },
  { label: "Cyan", value: "bg-cyan-300/70" },
  { label: "Sky", value: "bg-sky-300/70" },
  { label: "Blue", value: "bg-blue-300/70" },
  { label: "Indigo", value: "bg-indigo-300/70" },
  { label: "Violet", value: "bg-violet-300/70" },
  { label: "Purple", value: "bg-purple-300/70" },
  { label: "Fuchsia", value: "bg-fuchsia-300/70" },
  { label: "Pink", value: "bg-pink-300/70" },
  { label: "Rose", value: "bg-rose-300/70" },
];

type Service = {
  id: string;
  category_id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  base_price: number | null;
  duration_minutes: number | null;
  vat_status: "voll" | "befreit" | null;
  vat_rate_pct: number | null;
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

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr${hrs > 1 ? "s" : ""}`;
  return `${hrs} hr${hrs > 1 ? "s" : ""} ${mins} min`;
}

export default function ServicesPage() {
  const t = useTranslations("services");
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
  const [newServiceDuration, setNewServiceDuration] = useState("");
  const [newServiceVatable, setNewServiceVatable] = useState(false);
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
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [bulkMoveCategoryId, setBulkMoveCategoryId] = useState<string>("");

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
  const [editCategoryColor, setEditCategoryColor] = useState<string>("");

  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState("");
  const [editServiceDescription, setEditServiceDescription] = useState("");
  const [editServicePrice, setEditServicePrice] = useState("");
  const [editServiceDuration, setEditServiceDuration] = useState("");
  const [editServiceVatable, setEditServiceVatable] = useState(false);
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
          .select("id, name, description, sort_order, color")
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

        const categoryRows = (categoryData as any[]).map((row) => ({
          id: row.id as string,
          name: row.name as string,
          description: (row.description as string | null) ?? null,
          sort_order: Number(row.sort_order ?? 0),
          color: (row.color as string | null) ?? null,
        })) as ServiceCategory[];
        setCategories(categoryRows);
        setCollapsedCategories(new Set(categoryRows.map((c) => c.id)));

        const { data: serviceData, error: serviceError } = await supabaseClient
          .from("services")
          .select(
            "id, category_id, name, code, description, is_active, base_price, duration_minutes, vat_status, vat_rate_pct",
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
          duration_minutes:
            row.duration_minutes !== null && row.duration_minutes !== undefined
              ? Number(row.duration_minutes)
              : null,
          vat_status: (row.vat_status as "voll" | "befreit" | null) ?? null,
          vat_rate_pct:
            row.vat_rate_pct !== null && row.vat_rate_pct !== undefined
              ? Number(row.vat_rate_pct)
              : null,
        }));

        setServices(serviceRows as Service[]);

        // Load service groups that contain only Treatment category services
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

        const allGroupServices = groupServiceData as ServiceGroupService[];

        setServiceGroups(groupData as ServiceGroup[]);
        setGroupServices(allGroupServices);

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
        .select("id, name, description, sort_order, color")
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

    let durationValue: number | null = null;
    if (newServiceDuration.trim()) {
      const parsed = parseInt(newServiceDuration, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setServiceMessage("Please enter a valid duration in minutes.");
        return;
      }
      durationValue = parsed;
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
          duration_minutes: durationValue,
          vat_status: newServiceVatable ? "voll" : "befreit",
          vat_rate_pct: newServiceVatable ? 8.1 : 0,
          is_active: true,
        })
        .select("id, category_id, name, code, description, is_active, base_price, duration_minutes, vat_status, vat_rate_pct")
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
        duration_minutes:
          created.duration_minutes !== null && created.duration_minutes !== undefined
            ? Number(created.duration_minutes)
            : null,
        vat_status: (created.vat_status as "voll" | "befreit" | null) ?? null,
        vat_rate_pct:
          created.vat_rate_pct !== null && created.vat_rate_pct !== undefined
            ? Number(created.vat_rate_pct)
            : null,
      };

      setServices((prev) => [...prev, newRow]);
      setNewServiceName("");
      setNewServiceDescription("");
      setNewServicePrice("");
      setNewServiceDuration("");
      setNewServiceVatable(false);
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
    setEditCategoryColor(category.color ?? "");
  }

  function handleCancelEditCategory() {
    setEditingCategoryId(null);
    setEditCategoryName("");
    setEditCategoryDescription("");
    setEditCategoryColor("");
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
          color: editCategoryColor || null,
        })
        .eq("id", categoryId)
        .select("id, name, description, sort_order, color")
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
      setEditCategoryColor("");
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
    setEditServiceDuration(
      service.duration_minutes !== null && service.duration_minutes !== undefined
        ? String(service.duration_minutes)
        : "",
    );
    setEditServiceVatable(service.vat_status === "voll");
  }

  function handleCancelEditService() {
    setEditingServiceId(null);
    setEditServiceName("");
    setEditServiceDescription("");
    setEditServiceCategoryId("");
    setEditServicePrice("");
    setEditServiceDuration("");
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

    let durationValue: number | null = null;
    if (editServiceDuration.trim()) {
      const parsed = parseInt(editServiceDuration, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setServiceMessage("Please enter a valid duration in minutes.");
        return;
      }
      durationValue = parsed;
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
          duration_minutes: durationValue,
          vat_status: editServiceVatable ? "voll" : "befreit",
          vat_rate_pct: editServiceVatable ? 8.1 : 0,
        })
        .eq("id", serviceId)
        .select("id, category_id, name, code, description, is_active, base_price, duration_minutes, vat_status, vat_rate_pct")
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
        duration_minutes:
          updated.duration_minutes !== null && updated.duration_minutes !== undefined
            ? Number(updated.duration_minutes)
            : null,
        vat_status: (updated.vat_status as "voll" | "befreit" | null) ?? null,
        vat_rate_pct:
          updated.vat_rate_pct !== null && updated.vat_rate_pct !== undefined
            ? Number(updated.vat_rate_pct)
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
      setEditServiceDuration("");
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

  async function handleBulkMove(newCategoryId: string) {
    if (!newCategoryId || selectedServiceIds.size === 0) return;
    const ids = [...selectedServiceIds];
    const { error } = await supabaseClient
      .from("services")
      .update({ category_id: newCategoryId })
      .in("id", ids);
    if (!error) {
      setServices((prev) =>
        prev.map((s) => ids.includes(s.id) ? { ...s, category_id: newCategoryId } : s)
      );
      setSelectedServiceIds(new Set());
      setBulkMoveCategoryId("");
    }
  }

  async function handleBulkDelete() {
    if (selectedServiceIds.size === 0) return;
    if (!confirm(`Delete ${selectedServiceIds.size} service${selectedServiceIds.size > 1 ? "s" : ""}?`)) return;
    const ids = [...selectedServiceIds];
    const { error } = await supabaseClient.from("services").delete().in("id", ids);
    if (!error) {
      setServices((prev) => prev.filter((s) => !ids.includes(s.id)));
      setSelectedServiceIds(new Set());
    }
  }

  const categoriesById = new Map(categories.map((c) => [c.id, c] as const));
  const servicesById = new Map(services.map((s) => [s.id, s] as const));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-500">
          {t("subtitle")}
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
            <h2 className="text-sm font-medium text-slate-800">{t("categories")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("categoriesSubtitle")}
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
                              <div>
                                <label className="block text-[11px] font-medium text-slate-700 mb-1">{t("color")}</label>
                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditCategoryColor("")}
                                    title={t("noColor")}
                                    className={`h-5 w-5 rounded-sm border ${editCategoryColor === "" ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-300"} bg-white flex items-center justify-center`}
                                  >
                                    <span className="text-[10px] text-slate-400">ø</span>
                                  </button>
                                  {CATEGORY_COLOR_PRESETS.map((preset) => (
                                    <button
                                      key={preset.value}
                                      type="button"
                                      onClick={() => setEditCategoryColor(preset.value)}
                                      title={preset.label}
                                      className={`h-5 w-5 rounded-sm border ${editCategoryColor === preset.value ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200"} ${preset.value}`}
                                    />
                                  ))}
                                </div>
                              </div>
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
                          <div className="flex items-center gap-2 font-medium text-slate-900">
                            {category.color ? (
                              <span
                                className={`inline-block h-3 w-3 rounded-sm border border-slate-200 ${category.color}`}
                                title="Category color"
                              />
                            ) : null}
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
              <h2 className="text-sm font-medium text-slate-800">{t("servicesHeading")}</h2>
              <p className="text-xs text-slate-500">
                {t("servicesSubtitle")}
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

              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
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
                    Leave blank if variable.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={newServiceDuration}
                    onChange={(event) => setNewServiceDuration(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    placeholder="e.g. 30"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Leave blank if variable.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <input
                  type="checkbox"
                  id="new-service-vatable"
                  checked={newServiceVatable}
                  onChange={(event) => setNewServiceVatable(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                />
                <label
                  htmlFor="new-service-vatable"
                  className="cursor-pointer text-xs font-medium text-slate-700"
                >
                  VAT applicable (8.1%)
                </label>
                <span className="ml-auto text-[10px] text-slate-400">
                  {newServiceVatable ? "voll — 8.1%" : "befreit — 0%"}
                </span>
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
                onChange={(e) => { setServiceSearch(e.target.value); setServicesPage(1); }}
                placeholder="Search services..."
                className="flex-1 min-w-[160px] rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setServicesPage(1); }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              >
                <option value="all">All categories</option>
                {categories.slice().sort((a, b) => a.sort_order - b.sort_order).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {selectedServiceIds.size > 0 && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
                <span className="font-medium text-slate-700">{selectedServiceIds.size} selected</span>
                <span className="text-slate-300">|</span>
                <select
                  value={bulkMoveCategoryId}
                  onChange={(e) => setBulkMoveCategoryId(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-emerald-400 focus:outline-none"
                >
                  <option value="">Move to…</option>
                  {categories.slice().sort((a, b) => a.sort_order - b.sort_order).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button type="button" disabled={!bulkMoveCategoryId} onClick={() => void handleBulkMove(bulkMoveCategoryId)} className="rounded-full bg-emerald-500 px-3 py-0.5 font-semibold text-white hover:bg-emerald-600 disabled:opacity-40">Move</button>
                <button type="button" onClick={() => void handleBulkDelete()} className="rounded-full border border-red-100 bg-red-50 px-3 py-0.5 font-medium text-red-600 hover:bg-red-100">Delete</button>
                <button type="button" onClick={() => setSelectedServiceIds(new Set())} className="ml-auto text-slate-400 hover:text-slate-600">Clear</button>
              </div>
            )}
            {loading ? (
              <p className="mt-2 text-xs text-slate-500">Loading services...</p>
            ) : services.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No services yet.</p>
            ) : (() => {
              const term = serviceSearch.trim().toLowerCase();
              const filteredServices = services.filter((service) => {
                if (categoryFilter !== "all" && service.category_id !== categoryFilter) return false;
                if (!term) return true;
                const cat = categoriesById.get(service.category_id);
                return `${service.name} ${service.description ?? ""} ${cat?.name ?? ""}`.toLowerCase().includes(term);
              });

              // Group by category, preserving category sort order
              const grouped = categories
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((cat) => ({
                  category: cat,
                  services: filteredServices.filter((s) => s.category_id === cat.id),
                }))
                .filter((g) => g.services.length > 0);

              // Services with unknown category
              const knownCategoryIds = new Set(categories.map((c) => c.id));
              const orphans = filteredServices.filter((s) => !knownCategoryIds.has(s.category_id));

              const totalCount = filteredServices.length;

              return (
                <div className="mt-3 space-y-2 text-xs">
                  <p className="text-[11px] text-slate-400">{totalCount} service{totalCount !== 1 ? "s" : ""}</p>

                  {[...grouped, ...(orphans.length > 0 ? [{ category: { id: "__orphan__", name: "Uncategorised", color: null, sort_order: 9999, description: null }, services: orphans }] : [])].map(({ category, services: catServices }) => {
                    const isCollapsed = collapsedCategories.has(category.id);
                    return (
                      <div key={category.id} className="rounded-lg border border-slate-200/80 bg-white/90 overflow-hidden">
                        {/* Category header */}
                        <div className="flex items-center gap-1 px-2 py-2 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={catServices.length > 0 && catServices.every((s) => selectedServiceIds.has(s.id))}
                            onChange={(e) => {
                              const next = new Set(selectedServiceIds);
                              catServices.forEach((s) => e.target.checked ? next.add(s.id) : next.delete(s.id));
                              setSelectedServiceIds(next);
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                          />
                          <button
                            type="button"
                            onClick={() => setCollapsedCategories((prev) => {
                              const next = new Set(prev);
                              if (next.has(category.id)) next.delete(category.id);
                              else next.add(category.id);
                              return next;
                            })}
                            className="flex flex-1 items-center gap-2 text-left"
                          >
                            {category.color && <span className={`inline-block h-2.5 w-2.5 rounded-full ${category.color}`} />}
                            <span className="flex-1 text-[11px] font-semibold text-slate-700">{category.name}</span>
                            <span className="text-[10px] text-slate-400">{catServices.length}</span>
                            <span className="mr-1 text-[10px] text-slate-400">{isCollapsed ? "▶" : "▼"}</span>
                          </button>
                        </div>

                        {/* Services list */}
                        {!isCollapsed && (
                          <div className="divide-y divide-slate-100 border-t border-slate-100">
                            {catServices.map((service) => {
                              const isEditing = editingServiceId === service.id;
                              const isSaving = savingServiceId === service.id;
                              const isDeleting = deletingServiceId === service.id;

                              if (isEditing) {
                                return (
                                  <div key={service.id} className="space-y-2 bg-slate-50/70 px-3 py-2">
                                    <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                                      <div className="space-y-1">
                                        <input
                                          type="text"
                                          value={editServiceName}
                                          onChange={(e) => setEditServiceName(e.target.value)}
                                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                        />
                                        <select
                                          value={editServiceCategoryId}
                                          onChange={(e) => setEditServiceCategoryId(e.target.value)}
                                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                        >
                                          {categories.slice().sort((a, b) => a.sort_order - b.sort_order).map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                          ))}
                                        </select>
                                        <textarea
                                          value={editServiceDescription}
                                          onChange={(e) => setEditServiceDescription(e.target.value)}
                                          rows={2}
                                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                        />
                                      </div>
                                      <div className="flex flex-col items-end gap-1 text-[11px]">
                                        <div className="mt-1 flex w-full rounded-lg border border-slate-200 bg-white text-xs text-slate-900 shadow-sm focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400">
                                          <span className="inline-flex items-center px-2 text-[11px] text-slate-500">CHF</span>
                                          <input type="number" min="0" step="0.05" value={editServicePrice} onChange={(e) => setEditServicePrice(e.target.value)} className="flex-1 rounded-r-lg border-0 bg-transparent px-2 py-1.5 text-right outline-none" placeholder="0.00" />
                                        </div>
                                        <div className="mt-1 flex w-full rounded-lg border border-slate-200 bg-white text-xs text-slate-900 shadow-sm focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400">
                                          <span className="inline-flex items-center px-2 text-[11px] text-slate-500">min</span>
                                          <input type="number" min="1" step="1" value={editServiceDuration} onChange={(e) => setEditServiceDuration(e.target.value)} className="flex-1 rounded-r-lg border-0 bg-transparent px-2 py-1.5 text-right outline-none" placeholder="duration" />
                                        </div>
                                        <label className="mt-1 flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700">
                                          <input type="checkbox" checked={editServiceVatable} onChange={(e) => setEditServiceVatable(e.target.checked)} className="h-3 w-3 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400" />
                                          <span className="font-medium">VAT 8.1%</span>
                                          <span className="ml-auto text-[10px] text-slate-400">{editServiceVatable ? "voll" : "befreit"}</span>
                                        </label>
                                        <div className="flex gap-1">
                                          <button type="button" onClick={() => void handleSaveService(service.id)} disabled={isSaving} className="inline-flex items-center rounded-full bg-emerald-500 px-3 py-0.5 font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-60">
                                            {isSaving ? "Saving..." : "Save"}
                                          </button>
                                          <button type="button" onClick={handleCancelEditService} disabled={isSaving} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-0.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
                                            Cancel
                                          </button>
                                        </div>
                                        <button type="button" onClick={() => void handleDeleteService(service.id)} disabled={isDeleting || isSaving} className="mt-1 text-[11px] font-medium text-red-600 hover:text-red-700 disabled:opacity-60">
                                          {isDeleting ? "Deleting..." : "Delete"}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div key={service.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50/60">
                                  <input
                                    type="checkbox"
                                    checked={selectedServiceIds.has(service.id)}
                                    onChange={(e) => {
                                      const next = new Set(selectedServiceIds);
                                      if (e.target.checked) next.add(service.id);
                                      else next.delete(service.id);
                                      setSelectedServiceIds(next);
                                    }}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-slate-900">
                                      {service.code && <span className="mr-1 text-[10px] font-bold">{service.code} ·</span>}
                                      {service.name}
                                    </div>
                                    {service.description && (
                                      <div className="truncate text-[11px] text-slate-400">{service.description}</div>
                                    )}
                                  </div>
                                  <div className="ml-3 flex shrink-0 items-center gap-2 text-[11px] text-slate-600">
                                    {service.base_price !== null ? (
                                      <span>CHF {service.base_price.toFixed(2)}</span>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                    {service.duration_minutes !== null && (
                                      <span className="text-slate-400">{formatDuration(service.duration_minutes)}</span>
                                    )}
                                    {service.vat_status && (
                                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${service.vat_status === "voll" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
                                        {service.vat_status === "voll" ? "VAT 8.1%" : "VAT free"}
                                      </span>
                                    )}

                                    <button type="button" onClick={() => handleStartEditService(service)} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                                      Edit
                                    </button>
                                    <button type="button" onClick={() => void handleDeleteService(service.id)} disabled={isDeleting} className="inline-flex items-center rounded-full border border-red-100 bg-red-50 px-2 py-0.5 font-medium text-red-600 shadow-sm hover:bg-red-100 disabled:opacity-60">
                                      {isDeleting ? "…" : "Delete"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
