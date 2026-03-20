"use client";

import { useState, useEffect } from "react";
import { pushToDataLayer } from "@/components/GoogleTagManager";

const SERVICES = [
  "Augmentation Mammaire",
  "Liposuccion",
  "Rhinoplastie",
  "Lifting du Visage",
  "Blépharoplastie",
  "Injections (Botox/Fillers)",
  "Soins de la Peau",
  "Consultation Générale",
  "Autre",
];

const LOCATIONS = [
  { id: "rhone", label: "Genève - Rue du Rhône" },
  { id: "champel", label: "Genève - Champel" },
  { id: "gstaad", label: "Gstaad" },
  { id: "montreux", label: "Montreux" },
];

const COUNTRY_CODES = [
  { code: "+41", country: "Suisse", flag: "🇨🇭" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+49", country: "Allemagne", flag: "🇩🇪" },
  { code: "+39", country: "Italie", flag: "🇮🇹" },
  { code: "+44", country: "Royaume-Uni", flag: "🇬🇧" },
  { code: "+1", country: "USA/Canada", flag: "🇺🇸" },
  { code: "+7", country: "Russie", flag: "🇷🇺" },
  { code: "+34", country: "Espagne", flag: "🇪🇸" },
  { code: "+971", country: "EAU", flag: "🇦🇪" },
  { code: "+966", country: "Arabie Saoudite", flag: "🇸🇦" },
];

export default function EmbedContactPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+41");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [location, setLocation] = useState("");
  const [isExistingPatient, setIsExistingPatient] = useState(false);
  const [message, setMessage] = useState("");

  // Attribution tracking
  const [sourceUrl, setSourceUrl] = useState("");
  const [referrer, setReferrer] = useState("");
  const [utmParams, setUtmParams] = useState<Record<string, string>>({});

  useEffect(() => {
    // Capture attribution data on mount
    if (typeof window !== "undefined") {
      setSourceUrl(window.location.href);
      setReferrer(document.referrer);

      // Parse UTM params
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName || !lastName || !email) {
      setError("Veuillez remplir tous les champs obligatoires");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Veuillez entrer une adresse email valide");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/public/embed-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          countryCode,
          service,
          location,
          message,
          isExistingPatient,
          formType: "contact",
          sourceUrl,
          referrer,
          utmSource: utmParams.utm_source,
          utmMedium: utmParams.utm_medium,
          utmCampaign: utmParams.utm_campaign,
          utmTerm: utmParams.utm_term,
          utmContent: utmParams.utm_content,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Échec de l'envoi");
      }

      // Push GTM event
      pushToDataLayer("aliice_form_submit");

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Merci!</h1>
          <p className="text-slate-600 mb-6">
            Votre demande a été envoyée avec succès. Notre équipe vous contactera très prochainement.
          </p>
          <button
            onClick={() => {
              setSuccess(false);
              setFirstName("");
              setLastName("");
              setEmail("");
              setPhone("");
              setService("");
              setLocation("");
              setMessage("");
              setIsExistingPatient(false);
            }}
            className="text-orange-500 hover:text-orange-600 text-sm underline"
          >
            Envoyer une autre demande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Prénom<span className="text-orange-500">*</span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              required
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nom<span className="text-orange-500">*</span>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email<span className="text-orange-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              required
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Numéro de téléphone<span className="text-orange-500">*</span>
            </label>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-24 rounded-lg border border-slate-300 px-2 py-2.5 text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                placeholder="79 123 45 67"
              />
            </div>
          </div>

          {/* Service */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Je suis intéressé par le service suivant:<span className="text-orange-500">*</span>
            </label>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              required
            >
              <option value="">Please Select</option>
              {SERVICES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mon lieu préféré est:<span className="text-orange-500">*</span>
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              required
            >
              <option value="">Please Select</option>
              {LOCATIONS.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.label}</option>
              ))}
            </select>
          </div>

          {/* Existing Patient Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="existingPatient"
              checked={isExistingPatient}
              onChange={(e) => setIsExistingPatient(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
            />
            <label htmlFor="existingPatient" className="text-sm text-slate-700">
              Êtes-vous déjà patient?
            </label>
          </div>

          {/* Message */}
          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none resize-none"
              placeholder="Si vous avez des questions supplémentaires, n'hésitez pas à les poser ici!"
            />
          </div>

          {/* Privacy notice */}
          <p className="text-xs text-slate-500">
            Aesthetics Clinic Geneva a besoin des coordonnées que vous nous fournissez pour nous contacter
            à propos de nos produits et services.
          </p>
          <p className="text-xs text-slate-500">
            En cliquant sur &quot;Soumettre&quot;, vous acceptez les termes listés dans notre{" "}
            <a href="https://aesthetics-ge.ch/privacy" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">
              politique de confidentialité
            </a>.
          </p>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Envoi...
              </>
            ) : (
              "SOUMETTRE"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
