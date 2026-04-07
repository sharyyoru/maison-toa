"use client";

import { useState, useEffect } from "react";

interface BookingCategory {
  id: string;
  name: string;
  description: string;
  patient_type: "new" | "existing";
  order_index: number;
  slug: string;
  enabled: boolean;
}

export default function BookingCategoriesSettings() {
  const [categories, setCategories] = useState<BookingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"new" | "existing">("new");

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/settings/booking-categories");
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveCategories = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/booking-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories }),
      });

      if (!res.ok) {
        throw new Error("Failed to save categories");
      }

      alert("Categories saved successfully!");
    } catch (error) {
      console.error("Failed to save categories:", error);
      alert("Failed to save categories");
    } finally {
      setSaving(false);
    }
  };

  const addCategory = (patientType: "new" | "existing") => {
    const newCategory: BookingCategory = {
      id: crypto.randomUUID(),
      name: "",
      description: "",
      patient_type: patientType,
      order_index: categories.filter((c) => c.patient_type === patientType).length,
      slug: "",
      enabled: true,
    };
    setCategories([...categories, newCategory]);
  };

  const updateCategory = (id: string, field: keyof BookingCategory, value: any) => {
    setCategories(
      categories.map((cat) =>
        cat.id === id ? { ...cat, [field]: value } : cat
      )
    );
  };

  const deleteCategory = (id: string) => {
    if (confirm("Are you sure you want to delete this category?")) {
      setCategories(categories.filter((cat) => cat.id !== id));
    }
  };

  const moveCategory = (id: string, direction: "up" | "down") => {
    const category = categories.find((c) => c.id === id);
    if (!category) return;

    const sametype = categories.filter((c) => c.patient_type === category.patient_type);
    const currentIndex = sametype.findIndex((c) => c.id === id);

    if (
      (direction === "up" && currentIndex === 0) ||
      (direction === "down" && currentIndex === sametype.length - 1)
    ) {
      return;
    }

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const swapCategory = sametype[newIndex];

    setCategories(
      categories.map((cat) => {
        if (cat.id === id) {
          return { ...cat, order_index: swapCategory.order_index };
        }
        if (cat.id === swapCategory.id) {
          return { ...cat, order_index: category.order_index };
        }
        return cat;
      })
    );
  };

  const filteredCategories = categories
    .filter((cat) => cat.patient_type === activeTab)
    .sort((a, b) => a.order_index - b.order_index);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Booking Categories Settings
          </h1>
          <p className="text-gray-600">
            Manage your appointment booking categories and integrations.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab("new")}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "new"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              First-Time Patients
            </button>
            <button
              onClick={() => setActiveTab("existing")}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "existing"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Existing Patients
            </button>
          </div>
        </div>

        {/* Category List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {activeTab === "new" ? "First-Time Patient" : "Existing Patient"} Categories
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {filteredCategories.length} categories configured
              </p>
            </div>
            <button
              onClick={() => addCategory(activeTab)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Category
            </button>
          </div>

          <div className="divide-y divide-gray-200">
            {filteredCategories.length === 0 ? (
              <div className="p-12 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-gray-500">No categories added yet.</p>
                <p className="text-sm text-gray-400 mt-1">
                  Click "Add Category" to create your first category.
                </p>
              </div>
            ) : (
              filteredCategories.map((category, index) => (
                <div key={category.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Order Controls */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveCategory(category.id, "up")}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveCategory(category.id, "down")}
                        disabled={index === filteredCategories.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* Form Fields */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Category Name
                        </label>
                        <input
                          type="text"
                          value={category.name}
                          onChange={(e) => updateCategory(category.id, "name", e.target.value)}
                          placeholder="e.g., Première consultations"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Slug (URL)
                        </label>
                        <input
                          type="text"
                          value={category.slug}
                          onChange={(e) => updateCategory(category.id, "slug", e.target.value)}
                          placeholder="e.g., premiere-consultations"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={category.description}
                          onChange={(e) => updateCategory(category.id, "description", e.target.value)}
                          placeholder="Brief description of this category"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id={`enabled-${category.id}`}
                          checked={category.enabled}
                          onChange={(e) => updateCategory(category.id, "enabled", e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor={`enabled-${category.id}`} className="ml-2 text-sm text-gray-700">
                          Enabled
                        </label>
                      </div>
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={() => deleteCategory(category.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={saveCategories}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
