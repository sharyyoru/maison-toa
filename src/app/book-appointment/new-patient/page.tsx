"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SectionRenderer } from "@/components/PageBuilder";
import { useBookingPageConfig } from "@/hooks/useBookingPageConfig";
import { getLocalizedBookingDescription, getLocalizedBookingName } from "@/lib/bookingLocalization";

interface Category {
  id: string;
  name: string;
  name_en?: string | null;
  description: string;
  description_en?: string | null;
  slug: string;
  enabled: boolean;
}

export default function NewPatientCategoryPage() {
  const { language, t } = useLanguage();
  const pageConfig = useBookingPageConfig("category-selection");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/settings/booking-categories");
      const data = await res.json();
      
      // Filter for new patient categories that are enabled
      const newPatientCategories = (data.categories || [])
        .filter((cat: any) => cat.patient_type === "new" && cat.enabled)
        .sort((a: any, b: any) => a.order_index - b.order_index);
      
      setCategories(newPatientCategories);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100"
      style={{ backgroundColor: pageConfig.settings.backgroundColor }}
    >
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-slate-200 rounded-full opacity-50 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-200 rounded-full opacity-50 blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          {/* Language Toggle - Top Right */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
            <LanguageToggle />
          </div>

          {/* Logo Header */}
          {/* Progress Indicator */}
          {/* Back Button */}
          {/* Page Title */}
          {/* Categories Grid */}

          {pageConfig.sections.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              language={language}
              customRenderers={{
                "category-grid": (element) => {
                  const columns = element.type === "category-grid" ? element.props.columns : 4;
                  const gridClasses =
                    columns === 2
                      ? "grid-cols-2"
                      : columns === 3
                      ? "grid-cols-2 sm:grid-cols-3"
                      : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

                  if (loading) {
                    return (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
                      </div>
                    );
                  }

                  if (categories.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <p className="text-slate-600">No categories available at the moment.</p>
                      </div>
                    );
                  }

                  return (
                    <div className={`grid ${gridClasses} gap-4 mb-12`}>
                      {categories.map((category) => (
                        (() => {
                          const description = getLocalizedBookingDescription(category, language);
                          return (
                            <Link
                              key={category.id}
                              href={`/book-appointment/new-patient/${category.slug}`}
                              className="group bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-105"
                            >
                              <div className="flex flex-col h-full">
                                <h3 className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-slate-700 transition-colors">
                                  {getLocalizedBookingName(category, language)}
                                </h3>
                                {description && (
                                  <p className="text-sm text-slate-500 line-clamp-3 mb-4">
                                    {description}
                                  </p>
                                )}
                                <div className="flex items-center text-slate-700 font-medium group-hover:text-slate-900 transition-colors mt-auto">
                                  <span>{t("treatment.selectTreatment")}</span>
                                  <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </div>
                            </Link>
                          );
                        })()
                      ))}
                    </div>
                  );
                },
              }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
