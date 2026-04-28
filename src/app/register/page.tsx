"use client";

import { useState } from "react";
import Image from "next/image";

type Language = "en" | "fr";

const translations = {
  en: {
    title: "Patient Registration",
    subtitle: "Create your patient profile to get started.",
    firstName: "First name",
    lastName: "Last name",
    email: "Email address",
    phone: "Phone number",
    gender: "Gender",
    genderOptions: { "": "Select gender", male: "Male", female: "Female", other: "Other" },
    dob: "Date of birth",
    address: "Street address",
    streetNumber: "Number",
    postalCode: "Postal code",
    town: "City",
    country: "Country",
    languagePref: "Preferred language",
    langOptions: { "": "Select language", en: "English", fr: "French", de: "German", it: "Italian" },
    submit: "Register",
    submitting: "Registering...",
    required: "* Required fields",
    successTitle: "Registration complete",
    successMessage: "Your patient profile has been created. Our team will be in touch with you soon.",
    errors: {
      required: "Please fill in all required fields.",
      email: "Please enter a valid email address.",
      duplicate: "A patient with this email already exists.",
      generic: "Something went wrong. Please try again.",
    },
  },
  fr: {
    title: "Inscription patient",
    subtitle: "Créez votre profil patient pour commencer.",
    firstName: "Prénom",
    lastName: "Nom de famille",
    email: "Adresse e-mail",
    phone: "Numéro de téléphone",
    gender: "Genre",
    genderOptions: { "": "Sélectionner", male: "Homme", female: "Femme", other: "Autre" },
    dob: "Date de naissance",
    address: "Adresse",
    streetNumber: "Numéro",
    postalCode: "Code postal",
    town: "Ville",
    country: "Pays",
    languagePref: "Langue préférée",
    langOptions: { "": "Sélectionner", en: "Anglais", fr: "Français", de: "Allemand", it: "Italien" },
    submit: "S'inscrire",
    submitting: "Inscription...",
    required: "* Champs obligatoires",
    successTitle: "Inscription terminée",
    successMessage: "Votre profil patient a été créé. Notre équipe vous contactera bientôt.",
    errors: {
      required: "Veuillez remplir tous les champs obligatoires.",
      email: "Veuillez saisir une adresse e-mail valide.",
      duplicate: "Un patient avec cet e-mail existe déjà.",
      generic: "Une erreur s'est produite. Veuillez réessayer.",
    },
  },
};

const countryCodes = [
  { code: "+41", flag: "🇨🇭", label: "🇨🇭 +41" },
  { code: "+33", flag: "🇫🇷", label: "🇫🇷 +33" },
  { code: "+49", flag: "🇩🇪", label: "🇩🇪 +49" },
  { code: "+39", flag: "🇮🇹", label: "🇮🇹 +39" },
  { code: "+44", flag: "🇬🇧", label: "🇬🇧 +44" },
  { code: "+1",  flag: "🇺🇸", label: "🇺🇸 +1"  },
  { code: "+43", flag: "🇦🇹", label: "🇦🇹 +43" },
  { code: "+34", flag: "🇪🇸", label: "🇪🇸 +34" },
  { code: "+971", flag: "🇦🇪", label: "🇦🇪 +971" },
];

const inputClass =
  "w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-slate-200 text-sm";
const labelClass = "block text-xs font-medium text-slate-600 mb-1";

export default function RegisterPage() {
  const [lang, setLang] = useState<Language>("en");
  const t = translations[lang];

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+41");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [town, setTown] = useState("");
  const [country, setCountry] = useState("Switzerland");
  const [languagePref, setLanguagePref] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setError(t.errors.required);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError(t.errors.email);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/public/register-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          country_code: countryCode,
          gender: gender || undefined,
          dob: dob || undefined,
          street_address: streetAddress || undefined,
          street_number: streetNumber || undefined,
          postal_code: postalCode || undefined,
          town: town || undefined,
          country: country || undefined,
          language_preference: languagePref || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError(t.errors.duplicate);
        } else {
          setError(data.error || t.errors.generic);
        }
        return;
      }

      setSuccess(true);
    } catch {
      setError(t.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
      {/* Header */}
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          {(["en", "fr"] as Language[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                lang === l
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-6 sm:py-10">
        <div className="w-full max-w-lg">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Image
              src="/logos/maisontoa-logo.png"
              alt="Maison Toa"
              width={280}
              height={80}
              className="h-16 sm:h-20 w-auto"
              priority
            />
          </div>

          {success ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-medium text-slate-900 mb-2">{t.successTitle}</h2>
              <p className="text-slate-600 text-sm">{t.successMessage}</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl sm:text-3xl font-light text-slate-900 mb-2">{t.title}</h1>
                <p className="text-slate-600 text-sm">{t.subtitle}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>{t.firstName} *</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t.firstName}
                      className={inputClass}
                      disabled={loading}
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t.lastName} *</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t.lastName}
                      className={inputClass}
                      disabled={loading}
                      autoComplete="family-name"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className={labelClass}>{t.email} *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className={inputClass}
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className={labelClass}>{t.phone} *</label>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-28 px-3 py-3 rounded-lg border border-slate-300 bg-white text-black focus:border-black focus:outline-none focus:ring-2 focus:ring-slate-200 text-sm"
                      disabled={loading}
                    >
                      {countryCodes.map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="79 123 45 67"
                      className={`${inputClass} flex-1`}
                      disabled={loading}
                      autoComplete="tel"
                    />
                  </div>
                </div>

                {/* Gender + DOB */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>{t.gender}</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className={inputClass}
                      disabled={loading}
                    >
                      {Object.entries(t.genderOptions).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>{t.dob}</label>
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className={inputClass}
                      disabled={loading}
                      autoComplete="bday"
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={labelClass}>{t.address}</label>
                    <input
                      type="text"
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      placeholder={t.address}
                      className={inputClass}
                      disabled={loading}
                      autoComplete="street-address"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t.streetNumber}</label>
                    <input
                      type="text"
                      value={streetNumber}
                      onChange={(e) => setStreetNumber(e.target.value)}
                      placeholder="1a"
                      className={inputClass}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>{t.postalCode}</label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="1000"
                      className={inputClass}
                      disabled={loading}
                      autoComplete="postal-code"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t.town}</label>
                    <input
                      type="text"
                      value={town}
                      onChange={(e) => setTown(e.target.value)}
                      placeholder="Lausanne"
                      className={inputClass}
                      disabled={loading}
                      autoComplete="address-level2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>{t.country}</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Switzerland"
                      className={inputClass}
                      disabled={loading}
                      autoComplete="country-name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t.languagePref}</label>
                    <select
                      value={languagePref}
                      onChange={(e) => setLanguagePref(e.target.value)}
                      className={inputClass}
                      disabled={loading}
                    >
                      {Object.entries(t.langOptions).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}

                <p className="text-xs text-slate-400">{t.required}</p>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-full bg-black text-white font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 text-sm"
                >
                  {loading ? t.submitting : t.submit}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
