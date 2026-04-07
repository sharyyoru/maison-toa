"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";

export default function FirstVisitPage() {
  const router = useRouter();
  const { t } = useLanguage();

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
              <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
                <span className="text-slate-500 text-sm font-medium">2</span>
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
            href="/book-appointment"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("common.back")}
          </Link>

          {/* Question Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 sm:p-12 text-center border border-slate-200 shadow-lg">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6">
              {t("firstVisit.title")}
            </h1>
            
            <p className="text-lg text-slate-600 leading-relaxed mb-12 max-w-2xl mx-auto">
              {t("firstVisit.subtitle")}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/book-appointment/new-patient"
                className="inline-flex items-center justify-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-full text-lg font-semibold shadow-lg hover:shadow-xl hover:bg-slate-800 transition-all transform hover:scale-105 min-w-[280px]"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t("firstVisit.yes")}
              </Link>

              <Link
                href="/book-appointment/existing-patient"
                className="inline-flex items-center justify-center gap-3 bg-white text-slate-900 border-2 border-slate-300 px-8 py-4 rounded-full text-lg font-semibold shadow-lg hover:shadow-xl hover:bg-slate-50 transition-all transform hover:scale-105 min-w-[280px]"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {t("firstVisit.no")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
