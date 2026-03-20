"use client";

import Image from "next/image";
import Link from "next/link";

const CLINIC_LOCATIONS = [
  {
    id: "rhone",
    name: "Rhône",
    label: "Genève - Rue du Rhône",
    description: "Our flagship clinic in the heart of Geneva",
  },
  {
    id: "champel",
    name: "Champel",
    label: "Genève - Champel",
    description: "Premium aesthetic services in Champel",
  },
  {
    id: "gstaad",
    name: "Gstaad",
    label: "Gstaad",
    description: "Exclusive mountain retreat clinic",
  },
  {
    id: "montreux",
    name: "Montreux",
    label: "Montreux",
    description: "Lakeside aesthetic excellence",
  },
];

export default function LocationSelectionPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-slate-200 rounded-full opacity-50 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-200 rounded-full opacity-50 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
        {/* Logo Header */}
        <div className="text-center mb-6 sm:mb-8">
          <Link href="/book-appointment">
            <Image
              src="/logos/aesthetics-logo.svg"
              alt="Aesthetics Clinic"
              width={280}
              height={80}
              className="h-12 sm:h-14 md:h-16 w-auto mx-auto"
              priority
            />
          </Link>
        </div>

        {/* Back Link */}
        <Link
          href="/book-appointment"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 sm:mb-8 transition-colors text-sm sm:text-base"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
            Choose Your Location
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto px-4">
            Select your preferred clinic location to see available specialists
          </p>
        </div>

        {/* Locations Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-3xl mx-auto">
          {CLINIC_LOCATIONS.map((location) => (
            <Link
              key={location.id}
              href={`/book-appointment/doctors?location=${location.id}`}
              className="group bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl hover:border-slate-400 transition-all transform hover:-translate-y-1 p-6 sm:p-8"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-slate-900 transition-colors">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-1 group-hover:text-slate-700 transition-colors">
                    {location.name}
                  </h2>
                  <p className="text-sm text-slate-500">{location.label}</p>
                </div>
                <svg className="w-5 h-5 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <p className="mt-3 text-sm text-slate-600 hidden sm:block">{location.description}</p>
            </Link>
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-10 sm:mt-16 bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl p-5 sm:p-8 border border-slate-200 shadow-sm text-center max-w-3xl mx-auto">
          <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3 sm:mb-4">All Locations Offer</h3>
          <p className="text-sm sm:text-base text-slate-600">
            Free consultations, 3D simulations, and our full range of aesthetic services. 
            Choose the location most convenient for you.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-6 sm:py-8 mt-12 sm:mt-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-xs sm:text-sm">
            © {new Date().getFullYear()} Aesthetics Clinic. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
