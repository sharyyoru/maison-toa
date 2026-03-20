"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { supabaseClient } from "@/lib/supabaseClient";
import { getSwissToday, formatSwissYmd, parseSwissDate, getSwissDayOfWeek, formatSwissDateWithWeekday, getSwissDayRange, getSwissSlotString, createSwissDateTime } from "@/lib/swissTimezone";
import { pushToDataLayer } from "@/components/GoogleTagManager";

// Clinic locations
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

// Doctor data
const DOCTORS: Record<string, {
  name: string;
  specialty: string;
  image: string;
  email: string;
  description: string;
}> = {
  "xavier-tenorio": {
    name: "Dr. Xavier Tenorio",
    specialty: "Chirurgien plasticien et esthétique",
    image: "/doctors/xavier-tenorio.jpg",
    email: "xavier@aesthetics-ge.ch",
    description: "Expert in facial rejuvenation and body contouring procedures.",
  },
  "cesar-rodriguez": {
    name: "Dr. Cesar Rodriguez",
    specialty: "Aesthetic Medicine Specialist",
    image: "/doctors/cesar-rodriguez.jpg",
    email: "cesar@aesthetics-ge.ch",
    description: "Specialized in non-invasive aesthetic treatments.",
  },
  "yulia-raspertova": {
    name: "Dr. Yulia Raspertova",
    specialty: "Dermatology & Aesthetic Medicine",
    image: "/doctors/yulia-raspertova.jpg",
    email: "yulia@aesthetics-ge.ch",
    description: "Expert in dermatological treatments and anti-aging.",
  },
  "clinic": {
    name: "Laser & Treatments",
    specialty: "Aesthetics Clinic Services",
    image: "/doctors/clinic.png",
    email: "treatments@aesthetics-ge.ch",
    description: "Advanced laser treatments and aesthetic services.",
  },
  "lily-radionova": {
    name: "Nurse Lily Radionova",
    specialty: "Aesthetic Nurse Specialist",
    image: "/doctors/lily-radionova.jpeg",
    email: "lily@aesthetics-ge.ch",
    description: "Expert aesthetic nurse at Gstaad.",
  },
};

// Doctor availability by location
const DOCTOR_AVAILABILITY: Record<string, Record<string, Record<number, { start: string; end: string }>>> = {
  "xavier-tenorio": {
    rhone: {
      1: { start: "14:00", end: "18:30" },
      5: { start: "14:00", end: "18:30" },
    },
    montreux: {
      4: { start: "10:00", end: "12:30" },
    },
    gstaad: {
      6: { start: "16:00", end: "18:30" },
    },
  },
  "yulia-raspertova": {
    rhone: {
      1: { start: "10:00", end: "18:30" },
      2: { start: "10:00", end: "12:30" },
      4: { start: "10:00", end: "18:30" },
      3: { start: "08:00", end: "12:00" },
      5: { start: "08:00", end: "12:00" },
    },
    champel: {
      2: { start: "14:00", end: "18:30" },
    },
  },
  "cesar-rodriguez": {
    champel: {
      2: { start: "13:00", end: "17:00" },
      5: { start: "13:00", end: "17:00" },
    },
    rhone: {
      1: { start: "14:00", end: "18:30" },
      5: { start: "14:00", end: "18:30" },
    },
    montreux: {
      3: { start: "15:00", end: "17:00" },
    },
  },
  "clinic": {
    champel: {
      1: { start: "10:00", end: "18:30" },
      2: { start: "10:00", end: "12:00" },
      3: { start: "10:00", end: "12:00" },
      4: { start: "10:00", end: "12:00" },
      5: { start: "10:00", end: "12:00" },
      6: { start: "10:00", end: "12:00" },
    },
  },
  "lily-radionova": {
    gstaad: {
      1: { start: "10:00", end: "18:30" },
      2: { start: "10:00", end: "18:30" },
      3: { start: "10:00", end: "18:30" },
      4: { start: "10:00", end: "18:30" },
      5: { start: "10:00", end: "18:30" },
      6: { start: "10:00", end: "18:30" },
    },
  },
};

const LOCATION_NAMES: Record<string, string> = {
  rhone: "Rhône",
  champel: "Champel",
  gstaad: "Gstaad",
  montreux: "Montreux",
};

const LOCATION_LABELS: Record<string, string> = {
  rhone: "Genève - Rue du Rhône",
  champel: "Genève - Champel",
  gstaad: "Gstaad",
  montreux: "Montreux",
};

// Utility functions
function parseLocalDate(dateStr: string): Date {
  return parseSwissDate(dateStr);
}

function generateTimeSlots(doctorSlug: string, locationId: string, dateStr: string): string[] {
  const date = parseLocalDate(dateStr);
  const dayOfWeek = date.getDay();
  const availability = DOCTOR_AVAILABILITY[doctorSlug]?.[locationId]?.[dayOfWeek];
  
  if (!availability) return [];

  const slots: string[] = [];
  const [startHour, startMin] = availability.start.split(":").map(Number);
  const [endHour, endMin] = availability.end.split(":").map(Number);
  
  let currentHour = startHour;
  let currentMin = startMin;
  
  while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
    const slotTime = `${currentHour.toString().padStart(2, "0")}:${currentMin.toString().padStart(2, "0")}`;
    slots.push(slotTime);
    currentMin += 30;
    if (currentMin >= 60) {
      currentMin = 0;
      currentHour += 1;
    }
  }
  
  return slots;
}

function hasAvailabilityOnDate(doctorSlug: string, locationId: string, date: Date): boolean {
  const dayOfWeek = getSwissDayOfWeek(date);
  const availability = DOCTOR_AVAILABILITY[doctorSlug]?.[locationId]?.[dayOfWeek];
  return !!availability;
}

function formatDateLocal(date: Date): string {
  return formatSwissYmd(date);
}

function findNearestAvailableDate(doctorSlug: string, locationId: string, maxDaysAhead: number = 90): string | null {
  const today = getSwissToday();
  for (let i = 1; i <= maxDaysAhead; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    if (hasAvailabilityOnDate(doctorSlug, locationId, checkDate)) {
      return formatDateLocal(checkDate);
    }
  }
  return null;
}

function getAvailableDates(doctorSlug: string, locationId: string, maxDaysAhead: number = 90): string[] {
  const today = getSwissToday();
  const availableDates: string[] = [];
  for (let i = 1; i <= maxDaysAhead; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    if (hasAvailabilityOnDate(doctorSlug, locationId, checkDate)) {
      availableDates.push(formatDateLocal(checkDate));
    }
  }
  return availableDates;
}

function getDoctorsForLocation(locationId: string) {
  return Object.entries(DOCTORS)
    .filter(([slug]) => {
      const availability = DOCTOR_AVAILABILITY[slug];
      return availability && availability[locationId] && Object.keys(availability[locationId]).length > 0;
    })
    .map(([slug, data]) => ({ slug, ...data }));
}

type EmbedStep = "location" | "doctor" | "info" | "datetime" | "confirm" | "success";

export default function EmbedBookPage() {
  const [step, setStep] = useState<EmbedStep>("location");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [availableDoctors, setAvailableDoctors] = useState<Array<{ slug: string; name: string; specialty: string; image: string; email: string; description: string }>>([]);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");

  // Availability state
  const [availableDatesSet, setAvailableDatesSet] = useState<Set<string>>(new Set());
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

  // Attribution tracking
  const [sourceUrl, setSourceUrl] = useState("");
  const [referrer, setReferrer] = useState("");
  const [utmParams, setUtmParams] = useState<Record<string, string>>({});

  const selectedService = "General Consultation";
  const doctor = DOCTORS[selectedDoctor];
  const locationName = LOCATION_NAMES[selectedLocation] || selectedLocation;
  const locationLabel = LOCATION_LABELS[selectedLocation] || selectedLocation;

  // Capture attribution data on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setSourceUrl(window.location.href);
      setReferrer(document.referrer);
      const params = new URLSearchParams(window.location.search);
      setUtmParams({
        utm_source: params.get("utm_source") || "",
        utm_medium: params.get("utm_medium") || "",
        utm_campaign: params.get("utm_campaign") || "",
        utm_term: params.get("utm_term") || "",
        utm_content: params.get("utm_content") || "",
      });
    }
  }, []);

  // Update available doctors when location changes
  useEffect(() => {
    if (selectedLocation) {
      const doctors = getDoctorsForLocation(selectedLocation);
      setAvailableDoctors(doctors);
    }
  }, [selectedLocation]);

  // Calculate available dates when doctor/location changes
  useEffect(() => {
    if (selectedLocation && selectedDoctor) {
      const dates = getAvailableDates(selectedDoctor, selectedLocation, 90);
      setAvailableDatesSet(new Set(dates));
      const nearest = findNearestAvailableDate(selectedDoctor, selectedLocation, 90);
      if (nearest) {
        setSelectedDate(nearest);
      }
    }
  }, [selectedLocation, selectedDoctor]);

  // Generate time slots when date changes
  useEffect(() => {
    if (selectedDate && selectedLocation && selectedDoctor) {
      const slots = generateTimeSlots(selectedDoctor, selectedLocation, selectedDate);
      setAvailableSlots(slots);
      setSelectedTime("");
      checkAvailability(selectedDate);
    } else {
      setAvailableSlots([]);
    }
  }, [selectedDate, selectedLocation, selectedDoctor]);

  async function checkAvailability(date: string) {
    try {
      const { start, end } = getSwissDayRange(date);
      const doctorName = doctor?.name || "";

      const res = await fetch(
        `/api/appointments/check-availability?start=${start}&end=${end}&doctor=${encodeURIComponent(doctorName)}&slug=${selectedDoctor}`
      );
      const data = await res.json();

      let blockedSlots: string[] = [];
      if (data.fullSlots) {
        blockedSlots = data.fullSlots.map((isoTime: string) => getSwissSlotString(new Date(isoTime)));
        setBookedSlots(blockedSlots);
      } else {
        setBookedSlots([]);
      }

      const currentSlots = generateTimeSlots(selectedDoctor, selectedLocation, date);
      const openSlots = currentSlots.filter(time => !blockedSlots.includes(time));
      if (openSlots.length > 0) {
        setSelectedTime(openSlots[0]);
      }
    } catch (err) {
      console.error("Error checking availability:", err);
    }
  }

  async function handleSubmit() {
    if (!firstName || !lastName || !email || !selectedDate || !selectedTime || !selectedLocation) {
      setError("Please fill in all required fields");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [hour, minute] = selectedTime.split(":").map(Number);
      const appointmentDateSwiss = createSwissDateTime(selectedDate, hour, minute);
      
      const res = await fetch("/api/public/book-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          appointmentDate: appointmentDateSwiss.toISOString(),
          service: selectedService,
          doctorSlug: selectedDoctor,
          doctorName: doctor.name,
          doctorEmail: doctor.email,
          notes,
          location: locationName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to book appointment");
      }

      // Save lead to embed_form_leads for tracking
      try {
        await fetch("/api/public/embed-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            phone,
            service: selectedService,
            location: selectedLocation,
            formType: "booking",
            sourceUrl,
            referrer,
            utmSource: utmParams.utm_source,
            utmMedium: utmParams.utm_medium,
            utmCampaign: utmParams.utm_campaign,
            utmTerm: utmParams.utm_term,
            utmContent: utmParams.utm_content,
          }),
        });
      } catch {
        // Don't block on lead tracking failure
      }

      pushToDataLayer("aliice_form_submit");
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to book appointment");
    } finally {
      setLoading(false);
    }
  }

  const handleLocationSelect = (locationId: string) => {
    setSelectedLocation(locationId);
    setSelectedDoctor("");
    setSelectedDate("");
    setSelectedTime("");
    setStep("doctor");
  };

  const handleDoctorSelect = (doctorSlug: string) => {
    setSelectedDoctor(doctorSlug);
    setSelectedDate("");
    setSelectedTime("");
    setStep("info");
  };

  const handleBack = () => {
    if (step === "doctor") setStep("location");
    else if (step === "info") setStep("doctor");
    else if (step === "datetime") setStep("info");
    else if (step === "confirm") setStep("datetime");
  };

  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  };

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 3);
    return maxDate.toISOString().split("T")[0];
  };

  // Success screen
  if (step === "success") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Appointment Booked!</h1>
          <p className="text-slate-600 mb-6">
            Your appointment with <strong>{doctor?.name}</strong> has been confirmed. 
            A confirmation email has been sent to <strong>{email}</strong>.
          </p>
          <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-slate-600 mb-2">
              <strong>Date:</strong> {formatSwissDateWithWeekday(parseSwissDate(selectedDate))}
            </p>
            <p className="text-sm text-slate-600 mb-2">
              <strong>Time:</strong> {selectedTime}
            </p>
            <p className="text-sm text-slate-600 mb-2">
              <strong>Location:</strong> {locationLabel}
            </p>
            <p className="text-sm text-slate-600">
              <strong>Service:</strong> {selectedService}
            </p>
          </div>
          <button
            onClick={() => {
              setStep("location");
              setSelectedLocation("");
              setSelectedDoctor("");
              setFirstName("");
              setLastName("");
              setEmail("");
              setPhone("");
              setSelectedDate("");
              setSelectedTime("");
              setNotes("");
            }}
            className="text-slate-600 hover:text-slate-900 text-sm underline"
          >
            Book Another Appointment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {["location", "doctor", "info", "datetime", "confirm"].map((s, idx) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s ? "bg-slate-900 text-white" : 
                ["location", "doctor", "info", "datetime", "confirm"].indexOf(step) > idx 
                  ? "bg-green-500 text-white" 
                  : "bg-slate-200 text-slate-500"
              }`}>
                {["location", "doctor", "info", "datetime", "confirm"].indexOf(step) > idx ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              {idx < 4 && <div className={`w-8 h-0.5 ${
                ["location", "doctor", "info", "datetime", "confirm"].indexOf(step) > idx 
                  ? "bg-green-500" 
                  : "bg-slate-200"
              }`} />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Location Selection */}
        {step === "location" && (
          <div>
            <h1 className="text-2xl font-bold text-slate-900 text-center mb-2">Choose Your Location</h1>
            <p className="text-slate-600 text-center mb-6">Select your preferred clinic location to see available specialists</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CLINIC_LOCATIONS.map((location) => (
                <button
                  key={location.id}
                  onClick={() => handleLocationSelect(location.id)}
                  className="group bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-slate-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center group-hover:bg-slate-900 transition-colors">
                      <svg className="w-5 h-5 text-slate-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">{location.name}</h3>
                      <p className="text-sm text-slate-500">{location.label}</p>
                    </div>
                    <svg className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{location.description}</p>
                </button>
              ))}
            </div>

            <div className="mt-6 p-4 bg-slate-50 rounded-xl text-center">
              <h3 className="font-semibold text-slate-900 mb-2">All Locations Offer</h3>
              <p className="text-sm text-slate-600">
                Free consultations, 3D simulations, and our full range of aesthetic services.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Doctor Selection */}
        {step === "doctor" && (
          <div>
            <button onClick={handleBack} className="flex items-center gap-1 text-slate-600 hover:text-slate-900 mb-4 text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5 w-fit mb-4">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-medium text-slate-700">{locationLabel}</span>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 mb-2">Available Specialists</h1>
            <p className="text-slate-600 mb-6">Select a specialist to book your consultation</p>

            <div className="grid grid-cols-2 gap-3">
              {availableDoctors.map((doc) => (
                <button
                  key={doc.slug}
                  onClick={() => handleDoctorSelect(doc.slug)}
                  className="group bg-white rounded-xl border border-slate-200 overflow-hidden text-left hover:border-slate-400 hover:shadow-md transition-all"
                >
                  <div className="relative h-24 bg-slate-100">
                    <Image
                      src={doc.image}
                      alt={doc.name}
                      fill
                      className={`object-cover group-hover:scale-105 transition-transform ${
                        doc.slug === "lily-radionova" ? "object-[center_15%]" : "object-top"
                      }`}
                    />
                  </div>
                  <div className="p-3">
                    <h3 className="font-semibold text-slate-900 text-sm line-clamp-1">{doc.name}</h3>
                    <p className="text-xs text-slate-500 line-clamp-1">{doc.specialty}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Personal Information */}
        {step === "info" && (
          <div>
            <button onClick={handleBack} className="flex items-center gap-1 text-slate-600 hover:text-slate-900 mb-4 text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-100">
                <Image src={doctor?.image || ""} alt={doctor?.name || ""} fill className="object-cover" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{doctor?.name}</h3>
                <p className="text-sm text-slate-500">{locationLabel}</p>
              </div>
            </div>

            <h1 className="text-xl font-bold text-slate-900 mb-4">Personal Information</h1>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none"
                />
              </div>
              <button
                onClick={() => {
                  if (!firstName || !lastName || !email) {
                    setError("Please fill in all required fields");
                    return;
                  }
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(email.trim())) {
                    setError("Please enter a valid email address");
                    return;
                  }
                  setError(null);
                  setStep("datetime");
                }}
                className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Date & Time */}
        {step === "datetime" && (
          <div>
            <button onClick={handleBack} className="flex items-center gap-1 text-slate-600 hover:text-slate-900 mb-4 text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <h1 className="text-xl font-bold text-slate-900 mb-4">Select Date & Time</h1>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedTime("");
                  }}
                  min={getMinDate()}
                  max={getMaxDate()}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none"
                />
                {availableDatesSet.size > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {availableDatesSet.size} available dates in the next 3 months
                  </p>
                )}
              </div>

              {selectedDate && availableSlots.length > 0 && (() => {
                const openSlots = availableSlots.filter(time => !bookedSlots.includes(time));
                
                if (openSlots.length === 0) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-700">All time slots are fully booked on this day. Please select another date.</p>
                    </div>
                  );
                }
                
                return (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Available Time Slots *</label>
                    <div className="grid grid-cols-4 gap-2">
                      {openSlots.map((time) => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                            selectedTime === time
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {selectedDate && availableSlots.length === 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-700">No availability on this date. Please select another date.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Additional Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none resize-none"
                  placeholder="Any specific concerns..."
                />
              </div>

              <button
                onClick={() => {
                  if (!selectedDate || !selectedTime) {
                    setError("Please select a date and time");
                    return;
                  }
                  setError(null);
                  setStep("confirm");
                }}
                className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === "confirm" && (
          <div>
            <button onClick={handleBack} className="flex items-center gap-1 text-slate-600 hover:text-slate-900 mb-4 text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <h1 className="text-xl font-bold text-slate-900 mb-4">Confirm Your Appointment</h1>

            <div className="bg-slate-50 rounded-xl p-4 space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Name</span>
                <span className="font-medium text-slate-900">{firstName} {lastName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Email</span>
                <span className="font-medium text-slate-900">{email}</span>
              </div>
              {phone && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Phone</span>
                  <span className="font-medium text-slate-900">{phone}</span>
                </div>
              )}
              <hr className="border-slate-200" />
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Specialist</span>
                <span className="font-medium text-slate-900">{doctor?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Date</span>
                <span className="font-medium text-slate-900">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Time</span>
                <span className="font-medium text-slate-900">{selectedTime}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Location</span>
                <span className="font-medium text-slate-900">{locationLabel}</span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Booking...
                </>
              ) : (
                "Confirm Booking"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
