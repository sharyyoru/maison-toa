"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";

export default function BookAppointmentPage() {
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

        <div className="relative max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
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

          
          {/* Welcome Message */}
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6">
              {t("welcome.title")}
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed mb-8">
              {t("welcome.description1")}<br /><br />
              {t("welcome.description2")}<br /><br />
              {t("welcome.description3")}<br /><br />
              {t("welcome.description4")}<br /><br />
              {t("welcome.description5")}
            </p>

            {/* CTA Button */}
            <Link
              href="/book-appointment/first-visit"
              className="inline-flex items-center gap-3 bg-slate-900 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-full text-base sm:text-lg font-semibold shadow-lg hover:shadow-xl hover:bg-slate-800 transition-all transform hover:scale-105"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {t("welcome.bookAppointment")}
            </Link>
          </div>

        </div>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-8 mt-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm">
            {t("common.footer").replace("{year}", new Date().getFullYear().toString())}
          </p>
        </div>
      </footer>
    </main>
  );
}






