"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// Doctor availability by location
// Format: { [locationId]: { [dayOfWeek]: { start: "HH:MM", end: "HH:MM" } } }
// dayOfWeek: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
const DOCTOR_AVAILABILITY: Record<string, Record<string, Record<number, { start: string; end: string }>>> = {
  "xavier-tenorio": {
    rhone: {
      1: { start: "14:00", end: "18:30" }, // Monday 2pm-6:30pm
      5: { start: "14:00", end: "18:30" }, // Friday 2pm-6:30pm
    },
    montreux: {
      4: { start: "10:00", end: "12:30" }, // Thursday 10am-12:30pm
    },
    gstaad: {
      6: { start: "16:00", end: "18:30" }, // Saturday 4pm-6:30pm
    },
  },
  "yulia-raspertova": {
    rhone: {
      1: { start: "10:00", end: "18:30" }, // Monday 10am-6:30pm
      2: { start: "10:00", end: "12:30" }, // Tuesday 10am-12:30pm
      4: { start: "10:00", end: "18:30" }, // Thursday 10am-6:30pm
      3: { start: "08:00", end: "12:00" }, // Wednesday 8am-12pm
      5: { start: "08:00", end: "12:00" }, // Friday 8am-12pm
    },
    champel: {
      2: { start: "14:00", end: "18:30" }, // Tuesday 2pm-6:30pm
    },
  },
  "cesar-rodriguez": {
    champel: {
      2: { start: "13:00", end: "17:00" }, // Tuesday 1pm-5pm
      5: { start: "13:00", end: "17:00" }, // Friday 1pm-5pm
    },
    rhone: {
      1: { start: "14:00", end: "18:30" }, // Monday 2pm-6:30pm
      5: { start: "14:00", end: "18:30" }, // Friday 2pm-6:30pm
    },
    montreux: {
      3: { start: "15:00", end: "17:00" }, // Wednesday 3pm-5pm
    },
    // Gstaad: Off (not available)
  },
  "clinic": {
    champel: {
      1: { start: "10:00", end: "18:30" }, // Monday 10am-6:30pm
      2: { start: "10:00", end: "12:00" }, // Tuesday 10am-12pm
      3: { start: "10:00", end: "12:00" }, // Wednesday 10am-12pm
      4: { start: "10:00", end: "12:00" }, // Thursday 10am-12pm
      5: { start: "10:00", end: "12:00" }, // Friday 10am-12pm
      6: { start: "10:00", end: "12:00" }, // Saturday 10am-12pm
    },
  },
  "lily-radionova": {
    gstaad: {
      1: { start: "10:00", end: "18:30" }, // Monday 10am-6:30pm
      2: { start: "10:00", end: "18:30" }, // Tuesday 10am-6:30pm
      3: { start: "10:00", end: "18:30" }, // Wednesday 10am-6:30pm
      4: { start: "10:00", end: "18:30" }, // Thursday 10am-6:30pm
      5: { start: "10:00", end: "18:30" }, // Friday 10am-6:30pm
      6: { start: "10:00", end: "18:30" }, // Saturday 10am-6:30pm
    },
  },
};

const ALL_DOCTORS = [
  {
    slug: "xavier-tenorio",
    name: "Dr. Xavier Tenorio",
    specialty: "Chirurgien plasticien et esthétique",
    image: "/doctors/xavier-tenorio.jpg",
    description: "Expert in facial rejuvenation and body contouring procedures.",
  },
  {
    slug: "cesar-rodriguez",
    name: "Dr. Cesar Rodriguez",
    specialty: "Aesthetic Medicine Specialist",
    image: "/doctors/cesar-rodriguez.jpg",
    description: "Specialized in non-invasive aesthetic treatments and skin care.",
  },
  {
    slug: "yulia-raspertova",
    name: "Dr. Yulia Raspertova",
    specialty: "Dermatology & Aesthetic Medicine",
    image: "/doctors/yulia-raspertova.jpg",
    description: "Expert in dermatological treatments and anti-aging procedures.",
  },
  {
    slug: "clinic",
    name: "Laser & Treatments",
    specialty: "Aesthetics Clinic Services",
    image: "/doctors/clinic.png",
    description: "Advanced laser treatments and aesthetic clinic services.",
  },
  {
    slug: "lily-radionova",
    name: "Nurse Lily Radionova",
    specialty: "Aesthetic Nurse Specialist",
    image: "/doctors/lily-radionova.jpeg",
    description: "Expert aesthetic nurse specializing in non-invasive treatments at Gstaad.",
  },
];

const LOCATION_NAMES: Record<string, string> = {
  rhone: "Rhône",
  champel: "Champel",
  gstaad: "Gstaad",
  montreux: "Montreux",
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
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 md:gap-6">
            {availableDoctors.map((doctor) => (
              <Link
                key={doctor.slug}
                href={`/book-appointment/doctors/${doctor.slug}?location=${location}`}
                className="group bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl hover:border-slate-400 transition-all transform hover:-translate-y-1 w-[calc(50%-0.375rem)] sm:w-[calc(50%-0.5rem)] lg:w-[calc(25%-1.125rem)]"
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
            © {new Date().getFullYear()} Aesthetics Clinic. All rights reserved.
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
