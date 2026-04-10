"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";

interface BookingDoctor {
  id: string;
  slug: string;
  name: string;
  specialty: string;
  image_url: string;
  description: string;
  enabled: boolean;
}

interface Treatment {
  id: string;
  name: string;
}

export default function SelectDoctorPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useLanguage();
  const categorySlug = params.category as string;
  const treatmentId = params.treatment as string;

  const [treatment, setTreatment] = useState<Treatment | null>(null);
  const [doctors, setDoctors] = useState<BookingDoctor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [treatRes, docRes] = await Promise.all([
          treatmentId !== "none"
            ? fetch(`/api/settings/booking-treatments`)
            : Promise.resolve(null),
          treatmentId !== "none"
            ? fetch(`/api/settings/booking-doctors?treatment_id=${treatmentId}`)
            : fetch(`/api/settings/booking-doctors?category_slug=${categorySlug}`),
        ]);

        if (treatRes) {
          const treatData = await treatRes.json();
          const found = (treatData.treatments || []).find((t: Treatment) => t.id === treatmentId);
          if (found) setTreatment(found);
        }

        const docData = await docRes!.json();
        setDoctors((docData.doctors || []).filter((d: BookingDoctor) => d.enabled));
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [treatmentId, categorySlug]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 relative">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-slate-200 rounded-full opacity-50 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-200 rounded-full opacity-50 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
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

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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
            <div className={`w-12 h-0.5 ${treatmentId === "none" ? "bg-slate-300" : "bg-slate-900"}`}></div>
            <div className={`w-8 h-8 ${treatmentId === "none" ? "bg-slate-200" : "bg-slate-900"} rounded-full flex items-center justify-center`}>
              <span className={`text-sm font-medium ${treatmentId === "none" ? "text-slate-400 line-through" : "text-white"}`}>3</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-900"></div>
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">4</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-300"></div>
            <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
              <span className="text-slate-500 text-sm font-medium">5</span>
            </div>
          </div>
        </div>

        {/* Back Button */}
        <Link
          href={treatmentId === "none" ? `/book-appointment/new-patient` : `/book-appointment/new-patient/${categorySlug}`}
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
          {treatmentId !== "none" && (
            <div className="inline-flex items-center gap-2 bg-slate-100 rounded-full px-4 py-2 mb-4">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-sm font-medium text-slate-700">
                {loading ? t("common.loading") : treatment?.name || "Treatment"}
              </span>
            </div>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
            {t("doctor.title")}
          </h1>
          <p className="text-lg text-slate-600">
            {t("doctor.subtitle")}
          </p>
        </div>

        {/* Doctors Grid */}
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">{t("common.loading")}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {doctors.map((doctor) => (
              <Link
                key={doctor.slug}
                href={`/book-appointment/new-patient/${categorySlug}/${treatmentId}/${doctor.slug}`}
                className="group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl hover:border-slate-300 transition-all duration-300 hover:scale-[1.02]"
              >
                <div className="relative h-40 sm:h-48 bg-gradient-to-br from-slate-100 to-slate-50 overflow-hidden">
                  {doctor.image_url && (
                    <Image
                      src={doctor.image_url}
                      alt={doctor.name}
                      fill
                      className="object-cover object-top group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                </div>
                <div className="p-4 sm:p-5">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-1 group-hover:text-slate-700 transition-colors">
                    {doctor.name}
                  </h2>
                  <p className="text-sm text-slate-500 font-medium mb-2">
                    {doctor.specialty}
                  </p>
                  <p className="text-sm text-slate-500 line-clamp-2 mb-3">
                    {doctor.description}
                  </p>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900 group-hover:text-slate-700">
                    <span>{t("doctor.bookConsultation")}</span>
                    <svg
                      className="w-4 h-4 group-hover:translate-x-1 transition-transform"
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
