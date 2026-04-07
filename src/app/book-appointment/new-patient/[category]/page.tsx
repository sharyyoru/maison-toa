"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";

interface Treatment {
  id: string;
  category_id: string;
  name: string;
  duration_minutes: number;
  order_index: number;
  enabled: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function NewPatientTreatmentsPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useLanguage();
  const categorySlug = params.category as string;

  const [treatments, setTreatments] = useState<Treatment[]>();
  const [category, setCategory] = useState<Category | null>(null);
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
          setCategory(foundCategory);

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
  }, [categorySlug]);

  const formatDuration = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h${mins}` : `${hours}h`;
    }
    return `${minutes} min`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="w-20"></div>
            <Link href="/book-appointment">
              <Image
                src="/logos/maisontoa-logo.png"
                alt="Maison Toá"
                width={180}
                height={50}
                className="h-10 w-auto"
                priority
              />
            </Link>
            <div className="w-20 flex justify-end">
              <LanguageToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">1</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-900"></div>
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">2</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-300"></div>
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">3</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-300"></div>
            <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
              <span className="text-slate-500 text-sm font-medium">4</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-300"></div>
            <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
              <span className="text-slate-500 text-sm font-medium">5</span>
            </div>
          </div>
        </div>

        {/* Back Button */}
        <Link
          href="/book-appointment/new-patient"
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span>{t("common.back")}</span>
        </Link>

        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
            {category?.name || "Select Treatment"}
          </h1>
          <p className="text-lg text-slate-600">
            {t("treatment.title")}
          </p>
        </div>

        {/* Treatments List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
          </div>
        ) : treatments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">
              No treatments available in this category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {treatments.map((treatment) => (
              <Link
                key={treatment.id}
                href={`/book-appointment/new-patient/${categorySlug}/${treatment.id}`}
                className="group bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] hover:border-slate-300"
              >
                <div className="flex flex-col h-full">
                  <h3 className="text-base font-semibold text-slate-900 group-hover:text-slate-700 transition-colors mb-2 line-clamp-2 flex-grow">
                    {treatment.name}
                  </h3>
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
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-slate-500">
            © {new Date().getFullYear()} Maison Toá. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
