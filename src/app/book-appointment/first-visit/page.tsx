"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SectionRenderer } from "@/components/PageBuilder";
import { useBookingPageConfig } from "@/hooks/useBookingPageConfig";

export default function FirstVisitPage() {
  const { language } = useLanguage();
  const pageConfig = useBookingPageConfig("first-visit");

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
          {/* Question Card */}

          {pageConfig.sections.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              language={language}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
