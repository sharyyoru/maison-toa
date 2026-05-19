"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SectionRenderer } from "@/components/PageBuilder";
import { useBookingPageConfig } from "@/hooks/useBookingPageConfig";
import { getLocalizedBookingDescription, getLocalizedBookingName } from "@/lib/bookingLocalization";

interface Treatment {
  id: string;
  category_id: string;
  name: string;
  name_en?: string | null;
  description?: string | null;
  description_en?: string | null;
  duration_minutes: number;
  order_index: number;
  enabled: boolean;
}

interface Category {
  id: string;
  name: string;
  name_en?: string | null;
  slug: string;
  skip_treatment?: boolean;
}

export default function ExistingPatientTreatmentsPage() {
  const router = useRouter();
  const params = useParams();
  const { language } = useLanguage();
  const pageConfig = useBookingPageConfig("treatment-selection");
  const categorySlug = params.category as string;

  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // First get the category by slug
        const catRes = await fetch("/api/settings/booking-categories");
        const catData = await catRes.json();
        const categories = catData.categories || [];
        const foundCategory = categories.find(
          (c: Category) => c.slug === categorySlug
        );

        if (foundCategory) {
          // If skip_treatment is enabled, jump straight to doctor selection
          if (foundCategory.skip_treatment) {
            router.replace(`/book-appointment/existing-patient/${categorySlug}/none`);
            return;
          }

          // Then get treatments for this category
          const treatRes = await fetch(
            `/api/settings/booking-treatments?category_id=${foundCategory.id}`
          );
          const treatData = await treatRes.json();
          setTreatments(
            (treatData.treatments || []).filter((t: Treatment) => t.enabled)
          );
        }
      } catch (error) {
        console.error("Failed to fetch treatments:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [categorySlug, router]);

  const formatDuration = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h${mins}` : `${hours}h`;
    }
    return `${minutes} min`;
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

        <div className="relative max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          {/* Language Toggle - Top Right */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
            <LanguageToggle />
          </div>

        {/* Progress Indicator */}
        {/* Back Button */}
        {/* Title */}
        {/* Treatments List */}

          {pageConfig.sections.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              language={language}
              customRenderers={{
                "treatment-list": (element) => {
                  const columns = element.type === "treatment-list" ? element.props.columns : 4;
                  const gridClasses =
                    columns === 2
                      ? "grid-cols-1 sm:grid-cols-2"
                      : columns === 3
                      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

                  if (loading) {
                    return (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
                      </div>
                    );
                  }

                  if (treatments.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <p className="text-slate-600">
                          No treatments available in this category.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className={`grid ${gridClasses} gap-4`}>
                      {treatments.map((treatment) => (
                        (() => {
                          const description = getLocalizedBookingDescription(treatment, language);
                          return (
                            <Link
                              key={treatment.id}
                              href={`/book-appointment/existing-patient/${categorySlug}/${treatment.id}`}
                              className="group bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] hover:border-slate-300"
                            >
                              <div className="flex flex-col h-full">
                                <h3 className="text-base font-semibold text-slate-900 group-hover:text-slate-700 transition-colors mb-2 line-clamp-2">
                                  {getLocalizedBookingName(treatment, language)}
                                </h3>
                                {description && (
                                  <p className="text-sm text-slate-500 line-clamp-3 mb-4 flex-grow">
                                    {description}
                                  </p>
                                )}
                                <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                                  <span className="text-sm text-slate-500">
                                    {formatDuration(treatment.duration_minutes)}
                                  </span>
                                  <svg
                                    className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 5l7 7-7 7"
                                    />
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
