"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import Image from "next/image";
import { Language, getTranslation } from "@/lib/intakeTranslations";

type ViewMode = "summary" | "category" | "consultation";

function ConsultationStepsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get("sid");
  const patientId = searchParams.get("pid");
  const langParam = searchParams.get("lang");

  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>((langParam === "fr" ? "fr" : "en") as Language);

  const t = getTranslation(language);

  // Patient data
  const [patientData, setPatientData] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dob: string | null;
    streetAddress: string | null;
    postalCode: string | null;
    town: string | null;
    nationality: string | null;
    maritalStatus: string | null;
    profession: string | null;
  } | null>(null);

  // Insurance data
  const [insuranceData, setInsuranceData] = useState<{
    providerName: string | null;
    cardNumber: string | null;
    insuranceType: string | null;
  } | null>(null);

  // Health data
  const [healthData, setHealthData] = useState<{
    weightKg: number | null;
    heightCm: number | null;
    bmi: number | null;
    knownIllnesses: string | null;
    previousSurgeries: string | null;
    allergies: string | null;
  } | null>(null);

  // Consultation category
  const [consultationCategory, setConsultationCategory] = useState("");

  // Fetch existing patient data
  useEffect(() => {
    if (!patientId) {
      router.push("/consultations");
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch patient data
        const { data: patient } = await supabaseClient
          .from("patients")
          .select("*")
          .eq("id", patientId)
          .single();

        if (patient) {
          setPatientData({
            firstName: patient.first_name || "",
            lastName: patient.last_name || "",
            email: patient.email || "",
            phone: patient.phone || "",
            dob: patient.dob,
            streetAddress: patient.street_address,
            postalCode: patient.postal_code,
            town: patient.town,
            nationality: patient.nationality,
            maritalStatus: patient.marital_status,
            profession: patient.profession,
          });
        }

        // Fetch insurance data
        const { data: insurance } = await supabaseClient
          .from("patient_insurances")
          .select("*")
          .eq("patient_id", patientId)
          .maybeSingle();

        if (insurance) {
          setInsuranceData({
            providerName: insurance.provider_name,
            cardNumber: insurance.card_number,
            insuranceType: insurance.insurance_type,
          });
        }

        // Fetch health background
        const { data: health } = await supabaseClient
          .from("patient_health_background")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (health) {
          setHealthData({
            weightKg: health.weight_kg,
            heightCm: health.height_cm,
            bmi: health.bmi,
            knownIllnesses: health.known_illnesses,
            previousSurgeries: health.previous_surgeries,
            allergies: health.allergies,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load patient data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [patientId, router]);

  const handleSelectCategory = async (category: string) => {
    setConsultationCategory(category);
    setLoading(true);
    setError(null);

    try {
      // Update submission with consultation category
      await supabaseClient
        .from("patient_intake_submissions")
        .update({
          consultation_category: category,
          status: "in_progress",
        })
        .eq("id", submissionId);

      // Redirect to the specific consultation path
      router.push(`/intake/consultation/${category}?pid=${patientId}&sid=${submissionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setLoading(false);
    }
  };

  // Language selector component
  const LanguageSelector = () => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setLanguage("en")}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          language === "en"
            ? "bg-slate-800 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage("fr")}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          language === "fr"
            ? "bg-slate-800 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        FR
      </button>
    </div>
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading patient data...</p>
        </div>
      </main>
    );
  }

  if (error && !patientData) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-medium text-slate-800 mb-2">Error Loading Data</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => router.push("/consultations")}
            className="px-6 py-2 rounded-full bg-slate-800 text-white font-medium hover:bg-slate-700"
          >
            Go Back
          </button>
        </div>
      </main>
    );
  }

  // Patient Summary View
  if (viewMode === "summary") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
        <header className="px-4 sm:px-6 py-4 flex items-center justify-between">
          <Image
            src="/logos/aesthetics-logo.svg"
            alt="Aesthetics Clinic"
            width={60}
            height={60}
            className="h-12 w-auto"
          />
          <LanguageSelector />
        </header>

        <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-6">
          <div className="w-full max-w-lg">
            {/* Patient Header */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h1 className="text-2xl font-medium text-slate-800">
                {patientData?.firstName} {patientData?.lastName}
              </h1>
              <p className="text-slate-500">{patientData?.email}</p>
            </div>

            {/* Patient Info Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Personal Information
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">Phone:</span>
                  <p className="font-medium text-slate-800">{patientData?.phone || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-500">DOB:</span>
                  <p className="font-medium text-slate-800">{patientData?.dob || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Nationality:</span>
                  <p className="font-medium text-slate-800">{patientData?.nationality || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Marital Status:</span>
                  <p className="font-medium text-slate-800">{patientData?.maritalStatus || "—"}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Address:</span>
                  <p className="font-medium text-slate-800">
                    {patientData?.streetAddress ? `${patientData.streetAddress}, ${patientData.postalCode || ""} ${patientData.town || ""}` : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Insurance Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Insurance
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">Provider:</span>
                  <p className="font-medium text-slate-800">{insuranceData?.providerName || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Card #:</span>
                  <p className="font-medium text-slate-800">{insuranceData?.cardNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Type:</span>
                  <p className="font-medium text-slate-800">{insuranceData?.insuranceType || "—"}</p>
                </div>
              </div>
            </div>

            {/* Health Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Health Background
              </h3>
              <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                <div>
                  <span className="text-slate-500">Weight:</span>
                  <p className="font-medium text-slate-800">{healthData?.weightKg ? `${healthData.weightKg} kg` : "—"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Height:</span>
                  <p className="font-medium text-slate-800">{healthData?.heightCm ? `${healthData.heightCm} cm` : "—"}</p>
                </div>
                <div>
                  <span className="text-slate-500">BMI:</span>
                  <p className="font-medium text-slate-800">{healthData?.bmi ? healthData.bmi.toFixed(1) : "—"}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-slate-500">Allergies:</span>
                  <p className="font-medium text-slate-800">{healthData?.allergies || "None reported"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Previous Surgeries:</span>
                  <p className="font-medium text-slate-800">{healthData?.previousSurgeries || "None reported"}</p>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={() => setViewMode("category")}
              className="w-full py-3 rounded-full bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors"
            >
              Continue to Consultation
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Category Selection View
  if (viewMode === "category") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
        <header className="px-4 sm:px-6 py-4 flex items-center justify-between">
          <Image
            src="/logos/aesthetics-logo.svg"
            alt="Aesthetics Clinic"
            width={60}
            height={60}
            className="h-12 w-auto"
          />
          <LanguageSelector />
        </header>

        <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-6">
          <div className="w-full max-w-md text-center">
            {/* Patient Name Reminder */}
            <div className="mb-6">
              <p className="text-slate-600">
                Consultation for: <span className="font-semibold text-amber-600">{patientData?.firstName} {patientData?.lastName}</span>
              </p>
            </div>

            {/* Category Selection */}
            <h2 className="text-xl font-medium text-slate-800 mb-6">
              {t.categoryQuestion}
            </h2>

            <div className="space-y-3 mb-6">
              {[
                { value: "liposuction", label: t.consultationOptions.liposuction },
                { value: "breast", label: t.consultationOptions.breast },
                { value: "face", label: t.consultationOptions.face }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setConsultationCategory(option.value)}
                  className={`w-full py-4 px-4 rounded-xl border text-left transition-all ${
                    consultationCategory === option.value
                      ? "bg-slate-800 text-white border-slate-800 shadow-lg"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-400 hover:shadow"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>
        </div>

        <footer className="sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 sm:px-6 py-4">
          <div className="max-w-md mx-auto flex justify-center items-center gap-4">
            <button
              onClick={() => setViewMode("summary")}
              className="px-6 py-3 rounded-full border border-slate-300 text-slate-600 font-medium hover:bg-slate-100 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => consultationCategory && handleSelectCategory(consultationCategory)}
              disabled={loading || !consultationCategory}
              className="px-8 py-3 rounded-full bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Processing..." : "Continue"}
            </button>
          </div>
        </footer>
      </main>
    );
  }

  return null;
}

export default function ConsultationStepsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    }>
      <ConsultationStepsContent />
    </Suspense>
  );
}
