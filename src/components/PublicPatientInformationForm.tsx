"use client";

import Image from "next/image";
import { CheckCircle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Language = "en" | "fr";

type PatientInformationFormProps = {
  initialLanguage?: Language;
};

type FormData = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  gender: string;
  dob: string;
  street_address: string;
  street_number: string;
  postal_code: string;
  town: string;
  country: string;
  language_preference: string;
  email_communications: string;
  photo_consent: string;
  specialty_interest: string;
  referral_source: string;
  consent_understood: boolean;
  signature: string;
};

type AddressSuggestion = {
  label: string;
  street: string;
  number: string;
  postalCode: string;
  city: string;
  country: string;
  countryCode: string;
};

type FormErrorCode =
  | "SIGNATURE_REQUIRED"
  | "GENERIC_ERROR"
  | "EMAIL_DOB_MISMATCH"
  | "MISSING_REQUIRED_FIELDS"
  | "INVALID_EMAIL"
  | "INVALID_GENDER"
  | "INVALID_LANGUAGE"
  | "MISSING_COMMUNICATION_PREFERENCES"
  | "INVALID_SPECIALTY_INTEREST"
  | "INVALID_REFERRAL_SOURCE"
  | "MISSING_CONSENT_SIGNATURE";

const emptyFormData: FormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  gender: "",
  dob: "",
  street_address: "",
  street_number: "",
  postal_code: "",
  town: "",
  country: "",
  language_preference: "",
  email_communications: "",
  photo_consent: "",
  specialty_interest: "",
  referral_source: "",
  consent_understood: false,
  signature: "",
};

const copy = {
  en: {
    title: "Patient Information",
    subtitle: "Please review and complete your personal information.",
    languageToggleLabel: "Language",
    sections: {
      personal: {
        title: "Patient Information",
        description: "Please review and complete your personal information.",
      },
      address: {
        title: "Address",
        description: "Please provide your address.",
      },
      preferences: {
        title: "Preferences",
      },
      communication: {
        title: "Communication Preferences",
      },
      interests: {
        title: "Areas of Interest",
      },
      consent: {
        title: "Data Processing Consent",
        description:
          "By signing, I confirm that I consent to the processing of my data, access to it by the physician, and its transmission to third parties in accordance with the patient information provided. I am aware of the potential risks associated with the exchange of sensitive personal data (including possible disclosure to unauthorized third parties when using unsecured communication tools) as well as my rights. I consent to mutual communication between my physician and myself using the contact details provided above. The medical practice transmits patient information exclusively through secure communication channels. I agree that administrative matters, such as appointment rescheduling, may be communicated via unencrypted emails.",
      },
    },
    fields: {
      first_name: "First Name",
      last_name: "Last Name",
      email: "Email Address",
      phone: "Phone Number",
      gender: "Gender",
      dob: "Date of Birth",
      street_address: "Address",
      street_number: "Number",
      postal_code: "Postal Code",
      town: "City",
      country: "Country",
      language_preference: "Preferred Language",
      email_communications:
        "Do you agree to receive monthly email communications regarding our offers?",
      photo_consent:
        "Do you agree that photographs taken by Maison Toa may be used on our social media channels and in case studies?",
      specialty_interest: "Which specialty are you interested in?",
      referral_source: "How did you hear about us?",
      consent_understood:
        "I have read and understood the above data processing consent",
      signature: "Signature",
    },
    options: {
      select: "Select...",
      male: "Male",
      female: "Female",
      english: "English",
      french: "French",
      german: "German",
      italian: "Italian",
      yes: "Yes",
      no: "No",
      aesthetic_medicine: "Aesthetic Medicine",
      dermatology: "Dermatology",
      plastic_surgery: "Plastic Surgery",
      laser_treatments: "Laser Treatments",
      other: "Other",
      google: "Google",
      social_media: "Social Media",
      friend_family: "Friend / Family",
      medical_referral: "Medical Referral",
      advertising: "Advertising",
    },
    clear: "Clear",
    signatureHelp: "Draw your signature above",
    submit: "Submit Form",
    submitting: "Submitting...",
    successTitle: "Form submitted",
    successMessage: "Thank you. Your patient information has been saved.",
    secure: "The information you provide is confidential and secure.",
    errors: {
      SIGNATURE_REQUIRED: "Please draw your signature before submitting.",
      GENERIC_ERROR: "Unable to submit the form. Please try again.",
      EMAIL_DOB_MISMATCH:
        "This email address already exists, but the date of birth does not match. Please use a different email address so a new patient record can be created.",
      MISSING_REQUIRED_FIELDS: "Please fill in all required fields.",
      INVALID_EMAIL: "Please enter a valid email address.",
      INVALID_GENDER: "Please select a valid gender.",
      INVALID_LANGUAGE: "Please select a valid preferred language.",
      MISSING_COMMUNICATION_PREFERENCES:
        "Please complete the communication preferences.",
      INVALID_SPECIALTY_INTEREST: "Please select a valid specialty interest.",
      INVALID_REFERRAL_SOURCE: "Please select a valid referral source.",
      MISSING_CONSENT_SIGNATURE:
        "Please confirm the consent and provide your signature.",
    },
  },
  fr: {
    title: "Informations personnelles",
    subtitle: "Veuillez vérifier et compléter vos informations personnelles",
    languageToggleLabel: "Langue",
    sections: {
      personal: {
        title: "Informations personnelles",
        description: "Veuillez vérifier et compléter vos informations personnelles",
      },
      address: {
        title: "Adresse",
        description: "Veuillez fournir votre adresse",
      },
      preferences: {
        title: "Préférences",
      },
      communication: {
        title: "Préférences de communication",
      },
      interests: {
        title: "Domaines d'intérêt",
      },
      consent: {
        title: "Consentement au traitement des données",
        description:
          "En signant, je confirme que je consens au traitement de mes données, à l'accès par le médecin et à leur transmission à des tiers conformément aux informations destinées aux patients. Je suis conscient des risques potentiels liés à l'échange de données personnelles sensibles (fuite possible par des tiers non autorisés en cas d'outils de communication non sécurisés) ainsi que de mes droits. Je consens au contact mutuel entre mon médecin et moi-même en utilisant les coordonnées fournies ci-dessus. Le cabinet médical transmet les informations des patients exclusivement par des canaux de communication sécurisés. J'accepte que les questions administratives, telles que la reprogrammation de rendez-vous, puissent être transmises par e-mails non cryptés.",
      },
    },
    fields: {
      first_name: "Prénom",
      last_name: "Nom",
      email: "Adresse e-mail",
      phone: "Numéro de téléphone",
      gender: "Genre",
      dob: "Date de naissance",
      street_address: "Adresse",
      street_number: "Numéro",
      postal_code: "Code postal",
      town: "Ville",
      country: "Pays",
      language_preference: "Langue préférée",
      email_communications:
        "Acceptez-vous de recevoir des communications mensuelles par e-mail concernant nos offres ?",
      photo_consent:
        "Acceptez-vous que les photos prises par Maison Toa puissent être utilisées sur nos réseaux sociaux et études de cas ?",
      specialty_interest: "Quelle spécialité vous intéresse ?",
      referral_source: "Comment avez-vous entendu parler de nous ?",
      consent_understood:
        "J'ai lu et compris le consentement au traitement des données ci-dessus",
      signature: "Signature",
    },
    options: {
      select: "Sélectionner...",
      male: "Homme",
      female: "Femme",
      english: "Anglais",
      french: "Français",
      german: "Allemand",
      italian: "Italien",
      yes: "Oui",
      no: "Non",
      aesthetic_medicine: "Médecine esthétique",
      dermatology: "Dermatologie",
      plastic_surgery: "Chirurgie plastique",
      laser_treatments: "Traitements au laser",
      other: "Autre",
      google: "Google",
      social_media: "Réseaux sociaux",
      friend_family: "Ami/Famille",
      medical_referral: "Référence médicale",
      advertising: "Publicité",
    },
    clear: "Clear",
    signatureHelp: "Draw your signature above",
    submit: "Soumettre le formulaire",
    submitting: "Envoi en cours...",
    successTitle: "Formulaire soumis",
    successMessage: "Merci. Vos informations patient ont été enregistrées.",
    secure: "Les informations que vous fournissez sont confidentielles et sécurisées.",
    errors: {
      SIGNATURE_REQUIRED: "Veuillez signer avant de soumettre le formulaire.",
      GENERIC_ERROR: "Impossible de soumettre le formulaire. Veuillez réessayer.",
      EMAIL_DOB_MISMATCH:
        "Cette adresse e-mail existe déjà, mais la date de naissance ne correspond pas. Veuillez utiliser une autre adresse e-mail afin de créer un nouveau dossier patient.",
      MISSING_REQUIRED_FIELDS: "Veuillez remplir tous les champs obligatoires.",
      INVALID_EMAIL: "Veuillez entrer une adresse e-mail valide.",
      INVALID_GENDER: "Veuillez sélectionner un genre valide.",
      INVALID_LANGUAGE: "Veuillez sélectionner une langue préférée valide.",
      MISSING_COMMUNICATION_PREFERENCES:
        "Veuillez compléter les préférences de communication.",
      INVALID_SPECIALTY_INTEREST:
        "Veuillez sélectionner une spécialité valide.",
      INVALID_REFERRAL_SOURCE:
        "Veuillez sélectionner une source de recommandation valide.",
      MISSING_CONSENT_SIGNATURE:
        "Veuillez confirmer le consentement et fournir votre signature.",
    },
  },
} satisfies Record<Language, Record<string, unknown>>;

const formErrorCodes = new Set<FormErrorCode>([
  "SIGNATURE_REQUIRED",
  "GENERIC_ERROR",
  "EMAIL_DOB_MISMATCH",
  "MISSING_REQUIRED_FIELDS",
  "INVALID_EMAIL",
  "INVALID_GENDER",
  "INVALID_LANGUAGE",
  "MISSING_COMMUNICATION_PREFERENCES",
  "INVALID_SPECIALTY_INTEREST",
  "INVALID_REFERRAL_SOURCE",
  "MISSING_CONSENT_SIGNATURE",
]);

function toFormErrorCode(code: unknown): FormErrorCode {
  return typeof code === "string" && formErrorCodes.has(code as FormErrorCode)
    ? (code as FormErrorCode)
    : "GENERIC_ERROR";
}

function required(label: string) {
  return (
    <>
      {label}
      <span className="ml-1 text-red-500">*</span>
    </>
  );
}

function SignaturePad({
  value,
  onChange,
  label,
  clearLabel,
  helpText,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  clearLabel: string;
  helpText: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = 170 * ratio;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1f2937";

    if (value) {
      const image = new window.Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, 170);
      image.src = value;
    }
  }, [value]);

  const pointFromEvent = (
    event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in event ? event.touches[0] : event;
    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top,
    };
  };

  const start = (
    event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const point = pointFromEvent(event);
    if (!context || !point) return;
    setDrawing(true);
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const move = (
    event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!drawing) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const point = pointFromEvent(event);
    if (!context || !point) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stop = () => {
    if (!drawing) return;
    setDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{required(label)}</label>
      <div className="relative overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          className="block h-[170px] w-full touch-none cursor-crosshair"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={stop}
        />
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-2 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
        >
          {clearLabel}
        </button>
      </div>
      <p className="text-xs text-slate-500">{helpText}</p>
    </div>
  );
}

export default function PublicPatientInformationForm({
  initialLanguage = "en",
}: PatientInformationFormProps) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [formData, setFormData] = useState<FormData>({
    ...emptyFormData,
    language_preference: initialLanguage,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorCode, setErrorCode] = useState<FormErrorCode | null>(null);
  const [postalLookupPending, setPostalLookupPending] = useState(false);
  const [addressLookupPending, setAddressLookupPending] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSuggestionsOpen, setAddressSuggestionsOpen] = useState(false);
  const suppressNextAddressLookupRef = useRef(false);
  const [autoFilledAddress, setAutoFilledAddress] = useState({
    postalCode: "",
    town: "",
    country: "",
  });
  const [cityOptions, setCityOptions] = useState<string[]>([]);

  const t = copy[language];
  const errorMessage = errorCode
    ? (t.errors as Record<FormErrorCode, string>)[errorCode]
    : null;

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const switchLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setFormData((current) => ({
      ...current,
      language_preference: current.language_preference || nextLanguage,
    }));
  };

  useEffect(() => {
    const postalCode = formData.postal_code.trim();
    if (postalCode.length < 3) {
      setCityOptions([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setPostalLookupPending(true);
        const params = new URLSearchParams({ postalCode });
        if (formData.country.trim()) params.set("country", formData.country.trim());

        const response = await fetch(`/api/public/postal-code?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setCityOptions([]);
          return;
        }

        const data = (await response.json()) as {
          city?: string;
          cities?: string[];
          country?: string;
        };
        const cities = data.cities?.filter(Boolean) || [];
        setCityOptions(cities);

        setFormData((current) => {
          const nextTown = cities.includes(current.town)
            ? current.town
            : data.city || cities[0] || current.town;
          const canUpdateTown =
            !current.town ||
            (autoFilledAddress.postalCode !== postalCode &&
              current.town === autoFilledAddress.town);
          const canUpdateCountry =
            !current.country ||
            (autoFilledAddress.postalCode !== postalCode &&
              current.country === autoFilledAddress.country);

          return {
            ...current,
            town: canUpdateTown ? nextTown : current.town,
            country: data.country && canUpdateCountry ? data.country : current.country,
          };
        });

        setAutoFilledAddress({
          postalCode,
          town: data.city || cities[0] || "",
          country: data.country || "",
        });
      } catch (lookupError) {
        if (!controller.signal.aborted) {
          console.error("Postal code lookup failed:", lookupError);
        }
      } finally {
        if (!controller.signal.aborted) setPostalLookupPending(false);
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    autoFilledAddress.country,
    autoFilledAddress.postalCode,
    autoFilledAddress.town,
    formData.country,
    formData.postal_code,
  ]);

  useEffect(() => {
    const query = formData.street_address.trim();
    if (suppressNextAddressLookupRef.current) {
      suppressNextAddressLookupRef.current = false;
      return;
    }

    if (query.length < 3) {
      setAddressSuggestions([]);
      setAddressSuggestionsOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setAddressLookupPending(true);
        const params = new URLSearchParams({ query });

        const response = await fetch(`/api/public/address-search?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setAddressSuggestions([]);
          setAddressSuggestionsOpen(false);
          return;
        }

        const data = (await response.json()) as { suggestions?: AddressSuggestion[] };
        const suggestions = data.suggestions || [];
        setAddressSuggestions(suggestions);
        setAddressSuggestionsOpen(suggestions.length > 0);
      } catch (lookupError) {
        if (!controller.signal.aborted) {
          console.error("Address lookup failed:", lookupError);
        }
      } finally {
        if (!controller.signal.aborted) setAddressLookupPending(false);
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [formData.street_address]);

  const selectAddressSuggestion = (suggestion: AddressSuggestion) => {
    suppressNextAddressLookupRef.current = true;
    setFormData((current) => ({
      ...current,
      street_address: suggestion.street || current.street_address,
      street_number: suggestion.number || current.street_number,
      postal_code: suggestion.postalCode || current.postal_code,
      town: suggestion.city || current.town,
      country: suggestion.country || current.country,
    }));
    setCityOptions(suggestion.city ? [suggestion.city] : []);
    setAddressSuggestions([]);
    setAddressSuggestionsOpen(false);
    setAutoFilledAddress({
      postalCode: suggestion.postalCode,
      town: suggestion.city,
      country: suggestion.country,
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formData.signature) {
      setErrorCode("SIGNATURE_REQUIRED");
      return;
    }

    setSubmitting(true);
    setErrorCode(null);

    try {
      const response = await fetch("/api/public/patient-information", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, form_language: language }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setErrorCode(toFormErrorCode(payload.code));
        return;
      }

      setSubmitted(true);
    } catch (submitError) {
      console.error("Error submitting public patient information form:", submitError);
      setErrorCode("GENERIC_ERROR");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-xl border border-emerald-200 bg-white p-6 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle className="h-6 w-6 text-emerald-600" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">{t.successTitle as string}</h1>
          <p className="mt-2 text-sm text-slate-600">{t.successMessage as string}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <main className="mx-auto max-w-2xl px-4">
        <header className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <Image
              src="/logos/maisontoa-logo.png"
              alt="Maison Toa"
              width={140}
              height={40}
              className="h-10 w-auto"
              priority
            />
          </div>
          <div className="mb-5 flex justify-center">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              <span className="px-3 text-xs font-medium text-slate-500">
                {t.languageToggleLabel as string}
              </span>
              {(["en", "fr"] as Language[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => switchLanguage(item)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    language === item
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t.title as string}</h1>
          <p className="mt-2 text-sm text-slate-600">{t.subtitle as string}</p>
        </header>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              {(t.sections as Record<string, { title: string }>).personal.title}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {(t.sections as unknown as Record<string, { description: string }>).personal.description}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextInput label={required((t.fields as Record<string, string>).first_name)} value={formData.first_name} onChange={(value) => update("first_name", value)} required />
              <TextInput label={required((t.fields as Record<string, string>).last_name)} value={formData.last_name} onChange={(value) => update("last_name", value)} required />
              <TextInput type="email" label={required((t.fields as Record<string, string>).email)} value={formData.email} onChange={(value) => update("email", value)} required />
              <TextInput type="tel" label={required((t.fields as Record<string, string>).phone)} value={formData.phone} onChange={(value) => update("phone", value)} required />
              <SelectInput
                label={required((t.fields as Record<string, string>).gender)}
                value={formData.gender}
                onChange={(value) => update("gender", value)}
                placeholder={(t.options as Record<string, string>).select}
                options={[
                  ["male", (t.options as Record<string, string>).male],
                  ["female", (t.options as Record<string, string>).female],
                ]}
                required
              />
              <TextInput type="date" label={required((t.fields as Record<string, string>).dob)} value={formData.dob} onChange={(value) => update("dob", value)} required />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              {(t.sections as Record<string, { title: string }>).address.title}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {(t.sections as unknown as Record<string, { description: string }>).address.description}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <AddressInput
                  label={required((t.fields as Record<string, string>).street_address)}
                  value={formData.street_address}
                  onChange={(value) => update("street_address", value)}
                  onFocus={() => setAddressSuggestionsOpen(addressSuggestions.length > 0)}
                  suggestions={addressSuggestions}
                  suggestionsOpen={addressSuggestionsOpen}
                  onSelectSuggestion={selectAddressSuggestion}
                  onCloseSuggestions={() => setAddressSuggestionsOpen(false)}
                  busy={addressLookupPending}
                  required
                />
              </div>
              <TextInput label={required((t.fields as Record<string, string>).street_number)} value={formData.street_number} onChange={(value) => update("street_number", value)} required />
              <TextInput
                label={required((t.fields as Record<string, string>).postal_code)}
                value={formData.postal_code}
                onChange={(value) => update("postal_code", value)}
                required
                busy={postalLookupPending}
              />
              {cityOptions.length > 1 ? (
                <SelectInput
                  label={required((t.fields as Record<string, string>).town)}
                  value={formData.town}
                  onChange={(value) => update("town", value)}
                  placeholder={(t.options as Record<string, string>).select}
                  options={cityOptions.map((city) => [city, city])}
                  required
                />
              ) : (
                <TextInput label={required((t.fields as Record<string, string>).town)} value={formData.town} onChange={(value) => update("town", value)} required />
              )}
              <TextInput label={required((t.fields as Record<string, string>).country)} value={formData.country} onChange={(value) => update("country", value)} required />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              {(t.sections as Record<string, { title: string }>).preferences.title}
            </h2>
            <div className="mt-4">
              <SelectInput
                label={required((t.fields as Record<string, string>).language_preference)}
                value={formData.language_preference}
                onChange={(value) => update("language_preference", value)}
                placeholder={(t.options as Record<string, string>).select}
                options={[
                  ["en", (t.options as Record<string, string>).english],
                  ["fr", (t.options as Record<string, string>).french],
                  ["de", (t.options as Record<string, string>).german],
                  ["it", (t.options as Record<string, string>).italian],
                ]}
                required
              />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              {(t.sections as Record<string, { title: string }>).communication.title}
            </h2>
            <div className="mt-4 space-y-5">
              <RadioGroup
                label={required((t.fields as Record<string, string>).email_communications)}
                name="email_communications"
                value={formData.email_communications}
                onChange={(value) => update("email_communications", value)}
                options={[
                  ["yes", (t.options as Record<string, string>).yes],
                  ["no", (t.options as Record<string, string>).no],
                ]}
                required
              />
              <RadioGroup
                label={required((t.fields as Record<string, string>).photo_consent)}
                name="photo_consent"
                value={formData.photo_consent}
                onChange={(value) => update("photo_consent", value)}
                options={[
                  ["yes", (t.options as Record<string, string>).yes],
                  ["no", (t.options as Record<string, string>).no],
                ]}
                required
              />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              {(t.sections as Record<string, { title: string }>).interests.title}
            </h2>
            <div className="mt-4 space-y-4">
              <SelectInput
                label={required((t.fields as Record<string, string>).specialty_interest)}
                value={formData.specialty_interest}
                onChange={(value) => update("specialty_interest", value)}
                placeholder={(t.options as Record<string, string>).select}
                options={[
                  ["aesthetic_medicine", (t.options as Record<string, string>).aesthetic_medicine],
                  ["dermatology", (t.options as Record<string, string>).dermatology],
                  ["plastic_surgery", (t.options as Record<string, string>).plastic_surgery],
                  ["laser_treatments", (t.options as Record<string, string>).laser_treatments],
                  ["other", (t.options as Record<string, string>).other],
                ]}
                required
              />
              <SelectInput
                label={required((t.fields as Record<string, string>).referral_source)}
                value={formData.referral_source}
                onChange={(value) => update("referral_source", value)}
                placeholder={(t.options as Record<string, string>).select}
                options={[
                  ["google", (t.options as Record<string, string>).google],
                  ["social_media", (t.options as Record<string, string>).social_media],
                  ["friend_family", (t.options as Record<string, string>).friend_family],
                  ["medical_referral", (t.options as Record<string, string>).medical_referral],
                  ["advertising", (t.options as Record<string, string>).advertising],
                  ["other", (t.options as Record<string, string>).other],
                ]}
                required
              />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              {(t.sections as Record<string, { title: string }>).consent.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {(t.sections as unknown as Record<string, { description: string }>).consent.description}
            </p>
            <div className="mt-5 space-y-5">
              <label className="flex items-start gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.consent_understood}
                  onChange={(event) => update("consent_understood", event.target.checked)}
                  required
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>{required((t.fields as Record<string, string>).consent_understood)}</span>
              </label>
              <SignaturePad
                value={formData.signature}
                onChange={(value) => update("signature", value)}
                label={(t.fields as Record<string, string>).signature}
                clearLabel={t.clear as string}
                helpText={t.signatureHelp as string}
              />
            </div>
          </section>

          <div className="flex justify-center pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? (t.submitting as string) : (t.submit as string)}
            </button>
          </div>
        </form>

        <footer className="mt-8 text-center text-xs text-slate-500">{t.secure as string}</footer>
      </main>
    </div>
  );
}

function AddressInput({
  label,
  value,
  onChange,
  onFocus,
  suggestions,
  suggestionsOpen,
  onSelectSuggestion,
  onCloseSuggestions,
  busy = false,
  required: isRequired = false,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  suggestions: AddressSuggestion[];
  suggestionsOpen: boolean;
  onSelectSuggestion: (suggestion: AddressSuggestion) => void;
  onCloseSuggestions: () => void;
  busy?: boolean;
  required?: boolean;
}) {
  return (
    <label className="relative block space-y-1">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <span className="relative block">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={() => window.setTimeout(onCloseSuggestions, 120)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCloseSuggestions();
          }}
          required={isRequired}
          autoComplete="street-address"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
        />
        {busy ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        ) : null}
      </span>
      {suggestionsOpen ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.label}-${suggestion.postalCode}-${suggestion.city}`}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectSuggestion(suggestion);
              }}
              className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-sky-50 hover:text-sky-700"
            >
              <span className="block font-medium text-slate-900">
                {[suggestion.street, suggestion.number].filter(Boolean).join(" ")}
              </span>
              <span className="block text-slate-500">
                {[suggestion.postalCode, suggestion.city, suggestion.country].filter(Boolean).join(", ")}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  required: isRequired = false,
  busy = false,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  busy?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <span className="relative block">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={isRequired}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
        />
        {busy ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        ) : null}
      </span>
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  placeholder,
  options,
  required: isRequired = false,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: [string, string][];
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={isRequired}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
      >
        <option value="">{placeholder}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function RadioGroup({
  label,
  name,
  value,
  onChange,
  options,
  required: isRequired = false,
}: {
  label: React.ReactNode;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  required?: boolean;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">{label}</legend>
      <div className="mt-2 space-y-2">
        {options.map(([optionValue, optionLabel]) => (
          <label key={optionValue} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={value === optionValue}
              onChange={(event) => onChange(event.target.value)}
              required={isRequired}
              className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            {optionLabel}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
