"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";

interface Category {
  id: string;
  name: string;
  description: string;
  slug: string;
  enabled: boolean;
}

export default function NewPatientCategoryPage() {
  const router = useRouter();
  const { t } = useLanguage();
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
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
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
          <div className="text-center mb-8 sm:mb-10">
            <Image
              src="/logos/maisontoa-logo.png"
              alt="Maison Toa"
              width={280}
              height={80}
              className="h-12 sm:h-14 md:h-16 w-auto mx-auto"
              priority
            />
          </div>

          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">1</span>
              </div>
              <div className="w-12 h-0.5 bg-slate-300"></div>
              <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">2</span>
              </div>
              <div className="w-12 h-0.5 bg-slate-300"></div>
              <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
                <span className="text-slate-500 text-sm font-medium">3</span>
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
            href="/book-appointment/first-visit"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("common.back")}
          </Link>

          {/* Page Title */}
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              {t("category.title")}
            </h1>
            <p className="text-lg text-slate-600">
              {t("category.subtitle")}
            </p>
          </div>

          {/* Categories Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600">No categories available at the moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/book-appointment/new-patient/${category.slug}`}
                  className="group bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-105"
                >
                  <div className="flex flex-col h-full">
                    <h3 className="text-lg font-semibold text-slate-900 mb-3 group-hover:text-slate-700 transition-colors">
                      {category.name}
                    </h3>
                    <div className="flex items-center text-slate-700 font-medium group-hover:text-slate-900 transition-colors mt-auto">
                      <span>{t("treatment.selectTreatment")}</span>
                      <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
