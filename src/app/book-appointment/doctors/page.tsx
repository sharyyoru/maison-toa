"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// Doctor availability by location
// Format: { [locationId]: { [dayOfWeek]: { start: "HH:MM", end: "HH:MM" } } }
// dayOfWeek: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
const DOCTOR_AVAILABILITY: Record<string, Record<string, Record<number, { start: string; end: string }>>> = {
  "sophie-nordback": {
    lausanne: {
      1: { start: "09:00", end: "17:00" }, // Monday 9am-5pm
      2: { start: "09:00", end: "17:00" }, // Tuesday 9am-5pm
      3: { start: "09:00", end: "17:00" }, // Wednesday 9am-5pm
      4: { start: "09:00", end: "17:00" }, // Thursday 9am-5pm
      5: { start: "09:00", end: "17:00" }, // Friday 9am-5pm
    },
  },
  "alexandra-miles": {
    lausanne: {
      1: { start: "09:00", end: "17:00" }, // Monday 9am-5pm
      2: { start: "09:00", end: "17:00" }, // Tuesday 9am-5pm
      3: { start: "09:00", end: "17:00" }, // Wednesday 9am-5pm
      4: { start: "09:00", end: "17:00" }, // Thursday 9am-5pm
      5: { start: "09:00", end: "17:00" }, // Friday 9am-5pm
    },
  },
  "reda-benani": {
    lausanne: {
      1: { start: "10:00", end: "18:00" }, // Monday 10am-6pm
      3: { start: "10:00", end: "18:00" }, // Wednesday 10am-6pm
      5: { start: "10:00", end: "18:00" }, // Friday 10am-6pm
    },
  },
  "adnan-plakalo": {
    lausanne: {
      2: { start: "09:00", end: "17:00" }, // Tuesday 9am-5pm
      4: { start: "09:00", end: "17:00" }, // Thursday 9am-5pm
    },
  },
  "natalia-koltunova": {
    lausanne: {
      1: { start: "09:00", end: "17:00" }, // Monday 9am-5pm
      2: { start: "09:00", end: "17:00" }, // Tuesday 9am-5pm
      3: { start: "09:00", end: "17:00" }, // Wednesday 9am-5pm
      4: { start: "09:00", end: "17:00" }, // Thursday 9am-5pm
      5: { start: "09:00", end: "17:00" }, // Friday 9am-5pm
    },
  },
};

const ALL_DOCTORS = [
  {
    slug: "sophie-nordback",
    name: "Dr. Sophie Nordback",
    specialty: "Dermatology & Venereology",
    image: "/doctors/dr-sophie-nordback-correct.png",
    description: "FMH-qualified plastic and aesthetic surgeon. Co-founder of Clinique Maison TÓĀ.",
  },
  {
    slug: "alexandra-miles",
    name: "Dr. Alexandra Miles",
    specialty: "Dermatology & Venereology",
    image: "/doctors/dr-alexandra-miles.webp",
    description: "Spec. FMH in Dermatology and Venereology. Practicing dermatology since 2011.",
  },
  {
    slug: "reda-benani",
    name: "Dr. Reda Benani",
    specialty: "Longevity Medicine",
    image: "/doctors/dr-reda-benanni.webp",
    description: "Practicing physician specializing in longevity medicine.",
  },
  {
    slug: "adnan-plakalo",
    name: "Dr. Adnan Plakalo",
    specialty: "Medical Practitioner",
    image: "/doctors/dr-adnan-plakalo.png",
    description: "Medical practitioner.",
  },
  {
    slug: "natalia-koltunova",
    name: "Dr. Natalia Koltunova",
    specialty: "Dermatology & Venereology",
    image: "/doctors/dr-natalia-koltunova.webp",
    description: "Russian postgraduate diploma in Dermatology and Venereology.",
  },
];

const LOCATION_NAMES: Record<string, string> = {
  lausanne: "Lausanne",
};

function DoctorsListContent() {
  const searchParams = useSearchParams();
  const location = searchParams.get("location") || "";

  // Filter doctors available at this location
  const availableDoctors = location
    ? ALL_DOCTORS.filter((doctor) => {
        const availability = DOCTOR_AVAILABILITY[doctor.slug];
        return availability && availability[location] && Object.keys(availability[location]).length > 0;
      })
    : ALL_DOCTORS;

  const locationName = LOCATION_NAMES[location] || location;

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
              src="/logos/maisontoa-logo.png"
              alt="Maison Toa"
              width={280}
              height={80}
              className="h-12 sm:h-14 md:h-16 w-auto mx-auto"
              priority
            />
          </Link>
        </div>

        {/* Back Link */}
        <Link
          href="/book-appointment/location"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 sm:mb-8 transition-colors text-sm sm:text-base"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Change Location
        </Link>

        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 bg-slate-100 rounded-full px-4 py-2 mb-4">
            <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium text-slate-700">{locationName}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
            Available Specialists
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto px-4">
            Select a specialist available at {locationName} to book your consultation
          </p>
        </div>

        {/* Doctors Grid */}
        {availableDoctors.length > 0 ? (
          <div className="flex justify-center gap-2 sm:gap-3">
            {availableDoctors.map((doctor) => (
              <Link
                key={doctor.slug}
                href={`/book-appointment/doctors/${doctor.slug}?location=${location}`}
                className="group bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl hover:border-slate-400 transition-all transform hover:-translate-y-1 flex-1 max-w-48 sm:max-w-56 md:max-w-64"
              >
                <div className="relative h-28 sm:h-36 md:h-40 bg-gradient-to-br from-slate-100 to-slate-50 overflow-hidden">
                  <Image
                    src={doctor.image}
                    alt={doctor.name}
                    fill
                    className={`object-cover group-hover:scale-105 transition-transform duration-300 ${
                      doctor.slug === "lily-radionova" ? "object-[center_15%]" : "object-top"
                    }`}
                  />
                </div>
                <div className="p-3 sm:p-4 md:p-5">
                  <h2 className="text-sm sm:text-base md:text-lg font-semibold text-slate-900 mb-0.5 sm:mb-1 group-hover:text-slate-700 transition-colors line-clamp-1">
                    {doctor.name}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1 sm:mb-2 line-clamp-1">{doctor.specialty}</p>
                  <p className="text-xs sm:text-sm text-slate-500 line-clamp-2 hidden sm:block">{doctor.description}</p>
                  <div className="mt-2 sm:mt-4 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium text-slate-900 group-hover:text-slate-700">
                    <span>Book Consultation</span>
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-600 mb-4">No specialists available at this location.</p>
            <Link
              href="/book-appointment/location"
              className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full font-medium hover:bg-slate-800 transition-colors"
            >
              Choose Another Location
            </Link>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-10 sm:mt-16 bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl p-5 sm:p-8 border border-slate-200 shadow-sm text-center">
          <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3 sm:mb-4">General Consultation</h3>
          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
            All appointments are for a general consultation where our specialists will discuss your needs 
            and guide you to the best treatment options.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-6 sm:py-8 mt-12 sm:mt-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-xs sm:text-sm">
            © {new Date().getFullYear()} Maison Toa. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}

export default function DoctorsListPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    }>
      <DoctorsListContent />
    </Suspense>
  );
}
