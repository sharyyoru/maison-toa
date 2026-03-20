"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { SwissLawType, SwissInsurer } from "@/lib/medidata";

// Extended type for UI management
type ManageableInsurer = SwissInsurer & {
    isActive: boolean;
    createdAt: string;
};

// Form state type
type InsurerForm = {
    name: string;
    nameFr: string;
    gln: string;
    receiverGln: string;
    tpAllowed: boolean;
    lawTypes: SwissLawType[];
    street: string;
    postalCode: string;
    city: string;
    canton: string;
};

const INITIAL_FORM: InsurerForm = {
    name: "",
    nameFr: "",
    gln: "",
    receiverGln: "",
    tpAllowed: false,
    lawTypes: ["KVG"],
    street: "",
    postalCode: "",
    city: "",
    canton: "",
};

const ITEMS_PER_PAGE = 20;

// Internal Component: Insurer Search Select
function InsurerSearchSelect({
    value,
    onChange,
    placeholder = "Select insurer..."
}: {
    value: string;
    onChange: (gln: string) => void;
    placeholder?: string;
}) {
    // Initialize with value (GLN) so it's not empty while fetching
    const [inputValue, setInputValue] = useState(value || "");
    const [options, setOptions] = useState<{ gln: string; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const fetchedValueRef = useRef<string>("");

    // Initial fetch to get name for the current value
    useEffect(() => {
        // If value changes or we haven't fetched for this value yet
        if (value && value !== fetchedValueRef.current) {
            // Default to showing GLN until we fetch the name
            if (!inputValue || inputValue === value) {
                setInputValue(value);
            }

            supabaseClient
                .from("swiss_insurers")
                .select("name, gln")
                .eq("gln", value)
                .maybeSingle() // Safe for 0 or 1 result
                .then(({ data, error }) => {
                    if (data) {
                        const displayName = `${data.name} (${data.gln})`;
                        setInputValue(displayName);
                        fetchedValueRef.current = value;
                    } else {
                        // If not found (or error), keep showing just the GLN
                        console.warn("Could not find insurer name for GLN:", value, error);
                        setInputValue(value);
                        fetchedValueRef.current = value;
                    }
                });
        } else if (!value) {
            setInputValue("");
            fetchedValueRef.current = "";
        }
    }, [value]);

    // Handle outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Search insurers
    const searchInsurers = async (search: string) => {
        setLoading(true);
        try {
            let query = supabaseClient
                .from("swiss_insurers")
                .select("name, gln")
                .order("name")
                .limit(10);

            if (search) {
                // If the search looks like a GLN, search specifically for that
                if (/^\d+$/.test(search)) {
                    query = query.like("gln", `%${search}%`);
                } else {
                    query = query.or(`name.ilike.%${search}%,gln.ilike.%${search}%`);
                }
            }

            const { data } = await query;
            setOptions(data || []);
        } catch (error) {
            console.error("Error searching insurers:", error);
        } finally {
            setLoading(false);
        }
    };

    // Debounce search
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                // Should not search if the input value matches the currently selected display value
                // Logic: If we have a value, and input contains that value (GLN) OR the display format
                // But simplified: If we are just viewing the selected one, don't search.
                // We assume if user types, fetchedValueRef gets cleared or value gets cleared.

                // If value is set, and input looks like the display name (contains value if value is GLN? No value is GLN string)
                // If inputValue contains the GLN, chances are it's the formatted string "Name (GLN)"
                if (value && inputValue.includes(value)) {
                    return;
                }

                searchInsurers(inputValue);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [inputValue, isOpen, value]);

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="relative">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                        const newValue = e.target.value;
                        setInputValue(newValue);
                        setIsOpen(true);

                        // If user changes text, invalidate current selection
                        if (value) {
                            onChange("");
                            fetchedValueRef.current = "";
                        }
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        // Search with empty string if the current input is just the display name
                        const isDisplayingSelection = value && inputValue.includes(value);
                        searchInsurers(isDisplayingSelection ? "" : inputValue);
                    }}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                {inputValue && (
                    <button
                        onClick={() => {
                            onChange("");
                            setInputValue("");
                            fetchedValueRef.current = "";
                            setIsOpen(false);
                            // Also clear options? kept for history if reopened
                        }}
                        className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                    {loading ? (
                        <div className="px-4 py-2 text-sm text-slate-500">Loading...</div>
                    ) : options.length === 0 ? (
                        <div className="px-4 py-2 text-sm text-slate-500">No results found</div>
                    ) : (
                        options.map((option) => (
                            <button
                                key={option.gln}
                                onClick={() => {
                                    onChange(option.gln);
                                    setInputValue(`${option.name} (${option.gln})`);
                                    fetchedValueRef.current = option.gln;
                                    setIsOpen(false);
                                }}
                                className="w-full px-4 py-2 text-left hover:bg-slate-50"
                            >
                                <div className="text-sm font-medium text-slate-900">{option.name}</div>
                                <div className="text-xs text-slate-500">GLN: {option.gln}</div>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

export default function InsurersPage() {
    // Data state
    const [insurers, setInsurers] = useState<ManageableInsurer[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    // Pagination & Search state
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<InsurerForm>(INITIAL_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1); // Reset to first page on search
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Fetch data
    const fetchInsurers = useCallback(async () => {
        try {
            setLoading(true);

            // Base query
            let query = supabaseClient
                .from("swiss_insurers")
                .select("*", { count: "exact" });

            // Apply search if present
            if (debouncedSearch) {
                const search = `%${debouncedSearch}%`;
                query = query.or(`name.ilike.${search},gln.ilike.${search},name_fr.ilike.${search}`);
            }

            // Apply pagination
            const from = (page - 1) * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            const { data: insurersData, error: insurersError, count } = await query
                .order("name")
                .range(from, to);

            if (insurersError) throw insurersError;
            setTotalCount(count || 0);

            if (!insurersData || insurersData.length === 0) {
                setInsurers([]);
                return;
            }

            // Fetch law types ONLY for the loaded insurers
            const insurerIds = insurersData.map(i => i.id);
            const { data: lawsData, error: lawsError } = await supabaseClient
                .from("swiss_insurer_laws")
                .select("insurer_id, law_type")
                .in("insurer_id", insurerIds);

            if (lawsError) throw lawsError;

            // Group law types by insurer
            const lawsMap = new Map<string, SwissLawType[]>();
            lawsData?.forEach((row: any) => {
                const current = lawsMap.get(row.insurer_id) || [];
                lawsMap.set(row.insurer_id, [...current, row.law_type as SwissLawType]);
            });

            // Combine data with explicit mapping
            const formattedInsurers: ManageableInsurer[] = insurersData.map((row: any) => ({
                id: row.id,
                gln: row.gln,
                bagNumber: row.bag_number,
                name: row.name,
                nameFr: row.name_fr,
                lawTypes: lawsMap.get(row.id) || [],
                receiverGln: row.receiver_gln,
                tpAllowed: row.tp_allowed,
                isActive: row.is_active,
                createdAt: row.created_at,
                address: {
                    street: row.address_street,
                    postalCode: row.address_postal_code,
                    city: row.address_city,
                    canton: row.address_canton,
                },
            } as unknown as ManageableInsurer));

            setInsurers(formattedInsurers);
        } catch (err) {
            console.error("Error fetching insurers:", err);
            setError("Failed to load insurers");
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch]);

    useEffect(() => {
        fetchInsurers();
    }, [fetchInsurers]);

    // Handlers
    const handleEdit = (insurer: ManageableInsurer) => {
        setEditingId(insurer.id);

        // Explicitly map all fields to form state
        setFormData({
            name: insurer.name,
            nameFr: insurer.nameFr || "",
            gln: insurer.gln,
            receiverGln: insurer.receiverGln || "",
            tpAllowed: insurer.tpAllowed || false,
            lawTypes: insurer.lawTypes || [],
            street: insurer.address.street || "",
            postalCode: insurer.address.postalCode || "",
            city: insurer.address.city || "",
            canton: insurer.address.canton || "",
        });

        setIsModalOpen(true);
        setError(null);
    };

    const handleAddNew = () => {
        setEditingId(null);
        setFormData(INITIAL_FORM);
        setIsModalOpen(true);
        setError(null);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);

            // Validation
            if (!formData.name || !formData.gln) {
                throw new Error("Name and GLN are required");
            }
            if (formData.gln.length !== 13) {
                throw new Error("GLN must be 13 digits");
            }

            const insurerData = {
                name: formData.name,
                name_fr: formData.nameFr || null,
                gln: formData.gln,
                receiver_gln: formData.receiverGln || null,
                tp_allowed: formData.tpAllowed,
                address_street: formData.street || null,
                address_postal_code: formData.postalCode || null,
                address_city: formData.city || null,
                address_canton: formData.canton || null,
            };

            let insurerId = editingId;

            if (editingId) {
                // Update existing
                const { error: updateError } = await supabaseClient
                    .from("swiss_insurers")
                    .update(insurerData)
                    .eq("id", editingId);

                if (updateError) throw updateError;

                // Update laws (delete all and re-insert)
                const { error: deleteLawsError } = await supabaseClient
                    .from("swiss_insurer_laws")
                    .delete()
                    .eq("insurer_id", editingId);

                if (deleteLawsError) throw deleteLawsError;
            } else {
                // Create new
                const { data: newInsurer, error: createError } = await supabaseClient
                    .from("swiss_insurers")
                    .insert(insurerData)
                    .select("id")
                    .single();

                if (createError) throw createError;
                insurerId = newInsurer.id;
            }

            // Insert selected laws
            if (formData.lawTypes.length > 0 && insurerId) {
                const lawsToInsert = formData.lawTypes.map(law => ({
                    insurer_id: insurerId,
                    law_type: law
                }));

                const { error: lawsInsertError } = await supabaseClient
                    .from("swiss_insurer_laws")
                    .insert(lawsToInsert);

                if (lawsInsertError) throw lawsInsertError;
            }

            setIsModalOpen(false);
            fetchInsurers(); // Refresh list
        } catch (err: any) {
            console.error("Error saving insurer:", err);
            setError(err.message || "Failed to save insurer");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this insurer?")) return;

        try {
            const { error } = await supabaseClient
                .from("swiss_insurers")
                .delete()
                .eq("id", id);

            if (error) throw error;
            fetchInsurers();
        } catch (err) {
            console.error("Error deleting insurer:", err);
            alert("Failed to delete insurer");
        }
    };

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    return (
        <div className="min-h-screen bg-slate-50 p-8">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Swiss Insurers</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Manage insurance companies and their billing configurations
                        </p>
                    </div>
                    <button
                        onClick={handleAddNew}
                        className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Insurer
                    </button>
                </div>

                {/* Search */}
                <div className="mb-6">
                    <div className="relative max-w-md">
                        <input
                            type="text"
                            placeholder="Search by name, GLN..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                        <svg
                            className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                {/* List */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                                    Company
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                                    GLN / Receiver
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                                    Services
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                                    Status
                                </th>
                                <th scope="col" className="relative px-6 py-3">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                                        Loading insurers...
                                    </td>
                                </tr>
                            ) : insurers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                                        No insurers found
                                    </td>
                                </tr>
                            ) : (
                                insurers.map((insurer) => (
                                    <tr key={insurer.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-900">{insurer.name}</span>
                                                {insurer.nameFr && insurer.nameFr !== insurer.name && (
                                                    <span className="text-xs text-slate-500">{insurer.nameFr}</span>
                                                )}
                                                <span className="mt-1 text-xs text-slate-400">
                                                    {[insurer.address.city, insurer.address.canton].filter(Boolean).join(", ")}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">GLN</span>
                                                    <span className="text-sm font-mono text-slate-600">{insurer.gln}</span>
                                                </div>
                                                {insurer.receiverGln && insurer.receiverGln !== insurer.gln && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">RCV</span>
                                                        <span className="text-sm font-mono text-slate-500">{insurer.receiverGln}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex flex-wrap gap-1">
                                                    {insurer.lawTypes.map((law) => (
                                                        <span key={law} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                                            {law}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {insurer.tpAllowed ? (
                                                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            TP Allowed
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">TG Only</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${insurer.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                                                }`}>
                                                {insurer.isActive ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm font-medium">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleEdit(insurer)}
                                                    className="text-sky-600 hover:text-sky-900"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(insurer.id)}
                                                    className="text-red-400 hover:text-red-600"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalCount > 0 && (
                    <div className="mt-4 flex items-center justify-between border-t border-slate-200 px-4 py-3 sm:px-6">
                        <div className="flex flex-1 justify-between sm:hidden">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="relative ml-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm text-slate-700">
                                    Showing <span className="font-medium">{Math.min(totalCount, (page - 1) * ITEMS_PER_PAGE + 1)}</span> to{" "}
                                    <span className="font-medium">{Math.min(totalCount, page * ITEMS_PER_PAGE)}</span> of{" "}
                                    <span className="font-medium">{totalCount}</span> results
                                </p>
                            </div>
                            <div>
                                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                                    >
                                        <span className="sr-only">Previous</span>
                                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-inset ring-slate-300 focus:outline-offset-0">
                                        Page {page} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                                    >
                                        <span className="sr-only">Next</span>
                                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </nav>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
                        <h2 className="mb-4 text-xl font-semibold text-slate-900">
                            {editingId ? "Edit Insurer" : "Add New Insurer"}
                        </h2>

                        {error && (
                            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Company Name *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                        placeholder="Official name"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">French Name</label>
                                    <input
                                        type="text"
                                        value={formData.nameFr}
                                        onChange={(e) => setFormData({ ...formData, nameFr: e.target.value })}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                        placeholder="Optional"
                                    />
                                </div>
                            </div>

                            {/* Identifiers */}
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                <h3 className="mb-3 text-sm font-medium text-slate-900">Identification & Routing</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-500">GLN (Global Location Number) *</label>
                                        <input
                                            type="text"
                                            maxLength={13}
                                            value={formData.gln}
                                            onChange={(e) => setFormData({ ...formData, gln: e.target.value })}
                                            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                            placeholder="7601003..."
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-500">Receiver GLN (if different)</label>
                                        <InsurerSearchSelect
                                            value={formData.receiverGln}
                                            onChange={(gln) => setFormData({ ...formData, receiverGln: gln })}
                                            placeholder="Search existing insurer..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Address */}
                            <div className="grid grid-cols-12 gap-4">
                                <div className="col-span-12">
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Street</label>
                                    <input
                                        type="text"
                                        value={formData.street}
                                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                    />
                                </div>
                                <div className="col-span-3">
                                    <label className="mb-1 block text-sm font-medium text-slate-700">ZIP</label>
                                    <input
                                        type="text"
                                        value={formData.postalCode}
                                        onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                    />
                                </div>
                                <div className="col-span-6">
                                    <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                                    <input
                                        type="text"
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                    />
                                </div>
                                <div className="col-span-3">
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Canton</label>
                                    <input
                                        type="text"
                                        maxLength={2}
                                        value={formData.canton}
                                        onChange={(e) => setFormData({ ...formData, canton: e.target.value.toUpperCase() })}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                        placeholder="GE"
                                    />
                                </div>
                            </div>

                            {/* Settings */}
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700">Supported Law Types</label>
                                <div className="flex flex-wrap gap-2">
                                    {(["KVG", "UVG", "IVG", "MVG", "VVG"] as SwissLawType[]).map((law) => (
                                        <button
                                            key={law}
                                            type="button"
                                            onClick={() => {
                                                const newLaws = formData.lawTypes.includes(law)
                                                    ? formData.lawTypes.filter(l => l !== law)
                                                    : [...formData.lawTypes, law];
                                                setFormData({ ...formData, lawTypes: newLaws });
                                            }}
                                            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${formData.lawTypes.includes(law)
                                                ? "border-sky-500 bg-sky-50 text-sky-700"
                                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                                }`}
                                        >
                                            {law}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                                <input
                                    type="checkbox"
                                    id="tpAllowed"
                                    checked={formData.tpAllowed}
                                    onChange={(e) => setFormData({ ...formData, tpAllowed: e.target.checked })}
                                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                />
                                <label htmlFor="tpAllowed" className="text-sm font-medium text-slate-700">
                                    Enable Tiers Payant (TP)
                                    <span className="block text-xs font-normal text-slate-500">
                                        Allow insurer to pay directly (Swiss Invoice format)
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save Insurer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
