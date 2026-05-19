"use client";

import { LanguageToggle } from "@/components/LanguageToggle";
import { SectionRenderer } from "@/components/PageBuilder";
import { useLanguage } from "@/contexts/LanguageContext";
import { useBookingPageConfig } from "@/hooks/useBookingPageConfig";

export default function BookAppointmentPage() {
  const { language, t } = useLanguage();
  const pageConfig = useBookingPageConfig("landing");

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

          {/* Logo Header */}
          {/* Welcome Message */}
          {/* CTA Button */}

          {pageConfig.sections.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              language={language}
            />
          ))}

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
