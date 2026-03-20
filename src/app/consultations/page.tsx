"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import Image from "next/image";
import { Language, getTranslation } from "@/lib/intakeTranslations";

export default function ConsultationsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>("en");

  const t = getTranslation(language);

  async function handleEmailSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError(t.pleaseEnterEmail);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check if patient exists
      const { data: patient } = await supabaseClient
        .from("patients")
        .select("id, first_name, last_name, email")
        .ilike("email", email.trim())
        .maybeSingle();

      if (patient) {
        // Patient exists - create consultation submission and go to steps
        const { data: submission, error: subError } = await supabaseClient
          .from("patient_intake_submissions")
          .insert({
            patient_id: patient.id,
            status: "in_progress",
            current_step: 1,
          })
          .select("id")
          .single();

        if (subError) throw subError;

        // Redirect to consultation steps with submission ID and language
        router.push(`/consultations/steps?sid=${submission?.id}&pid=${patient.id}&lang=${language}`);
      } else {
        // Patient doesn't exist
        setError("No patient found with this email address. Please ask the patient to complete the intake form first at /intake");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
      {/* Header */}
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between">
        <div></div>
        <LanguageSelector />
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-6 sm:py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-6 sm:mb-8">
            <Image
              src="/logos/aesthetics-logo.svg"
              alt="Aesthetics Clinic"
              width={280}
              height={80}
              className="h-16 sm:h-20 w-auto"
              priority
            />
          </div>

          {/* Hero Section */}
          <div className="text-center mb-8 sm:mb-10">
            <h1 className="text-2xl sm:text-3xl font-light text-slate-900 mb-4">
              Consultation<br />
              <span className="text-black font-medium">Patient Lookup</span>
            </h1>
            <p className="text-slate-600 text-sm">
              Search for the patient by email to access their consultation form
            </p>
          </div>

          {/* Email Search Form */}
          <form onSubmit={handleEmailSearch} className="space-y-4">
            <div>
              <h2 className="text-lg font-medium text-black mb-3">Find Patient</h2>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.enterEmail}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-slate-200"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full bg-black text-white font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {loading ? "Searching..." : "Search Patient"}
            </button>

            <p className="text-center text-sm text-slate-500 mt-6">
              Patient not registered?{" "}
              <a
                href="/intake"
                className="text-black font-medium hover:underline"
              >
                Complete Intake Form First
              </a>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
