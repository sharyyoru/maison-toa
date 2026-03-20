"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import Image from "next/image";
import { Language, getTranslation } from "@/lib/intakeTranslations";
import { pushToDataLayer } from "@/components/GoogleTagManager";

type ViewState = "search" | "register";

export default function IntakePage() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>("register");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>("en");

  // Get translations based on selected language
  const t = getTranslation(language);

  // Registration form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [countryCode, setCountryCode] = useState("+41"); // Switzerland default
  const [phone, setPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");

  const countryCodes = [
    { code: "+41", country: "Switzerland", flag: "🇨🇭" },
    { code: "+33", country: "France", flag: "🇫🇷" },
    { code: "+49", country: "Germany", flag: "🇩🇪" },
    { code: "+39", country: "Italy", flag: "🇮🇹" },
    { code: "+44", country: "UK", flag: "🇬🇧" },
    { code: "+1", country: "USA/Canada", flag: "🇺🇸" },
    { code: "+7", country: "Russia", flag: "🇷🇺" },
    { code: "+34", country: "Spain", flag: "🇪🇸" },
    { code: "+971", country: "UAE", flag: "🇦🇪" },
    { code: "+966", country: "Saudi Arabia", flag: "🇸🇦" },
    { code: "+43", country: "Austria", flag: "🇦🇹" },
  ];

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
        // Patient exists - create submission and go to steps
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

        // Push GTM event for form submission
        pushToDataLayer("aliice_form_submit");
        
        // Redirect to steps with submission ID and language
        router.push(`/intake/steps?sid=${submission?.id}&pid=${patient.id}&lang=${language}`);
      } else {
        // Patient doesn't exist - show registration form
        setRegEmail(email.trim());
        setView("register");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim() || !regEmail.trim() || !phone.trim()) {
      setError(t.allFieldsRequired);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create new patient
      const { data: newPatient, error: patientError } = await supabaseClient
        .from("patients")
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: regEmail.trim().toLowerCase(),
          phone: `${countryCode}${phone.trim().replace(/^0+/, "")}`,
          country_code: countryCode,
          source: "intake_form",
        })
        .select("id")
        .single();

      if (patientError) throw patientError;

      // Create intake submission
      const { data: submission, error: subError } = await supabaseClient
        .from("patient_intake_submissions")
        .insert({
          patient_id: newPatient?.id,
          status: "in_progress",
          current_step: 1,
        })
        .select("id")
        .single();

      if (subError) throw subError;

      // Trigger patient_created workflow
      try {
        await fetch("/api/workflows/patient-created", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patient_id: newPatient?.id }),
        });
      } catch {
        // Don't block on workflow trigger failure
        console.error("Failed to trigger patient_created workflow");
      }

      // Push GTM event for form submission
      pushToDataLayer("aliice_form_submit");
      
      // Redirect to steps with language
      router.push(`/intake/steps?sid=${submission?.id}&pid=${newPatient?.id}&lang=${language}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register");
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
              {t.heroTitle}<br />
              <span className="text-black font-medium">{t.heroTitleHighlight}</span>
            </h1>
            <p className="text-slate-600 text-sm">
              {t.heroDescription}
            </p>
          </div>

          {view === "search" ? (
            /* Email Search Form */
            <form onSubmit={handleEmailSearch} className="space-y-4">
              <div>
                <h2 className="text-lg font-medium text-black mb-3">{t.search}</h2>
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
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-black text-white font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {loading ? t.searching : t.continue}
              </button>

              <p className="text-center text-sm text-slate-500">
                {t.noAccount}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setView("register");
                    setRegEmail(email);
                  }}
                  className="text-black font-medium hover:underline"
                >
                  {t.register}
                </button>
              </p>
            </form>
          ) : (
            /* Registration Form */
            <form onSubmit={handleRegister} className="space-y-4">
              <h2 className="text-lg font-medium text-black mb-3">{t.register}</h2>

              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t.firstName}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-slate-200"
                disabled={loading}
              />

              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t.lastName}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-slate-200"
                disabled={loading}
              />

              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-28 px-3 py-3 rounded-lg border border-slate-300 bg-white text-black focus:border-black focus:outline-none focus:ring-2 focus:ring-slate-200"
                  disabled={loading}
                >
                  {countryCodes.map((c) => (
                    <option key={c.code} value={c.code} className="text-black">
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t.mobile}
                  className="flex-1 px-4 py-3 rounded-lg border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-slate-200"
                  disabled={loading}
                />
              </div>

              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder={t.email}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-slate-200"
                disabled={loading}
              />

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-black text-white font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {loading ? t.registering : t.register}
              </button>

              <p className="text-center text-sm text-slate-500">
                {t.alreadyHaveAccount}{" "}
                <button
                  type="button"
                  onClick={() => setView("search")}
                  className="text-black font-medium hover:underline"
                >
                  {t.login}
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
