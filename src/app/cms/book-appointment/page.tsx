"use client";

import { useState, useEffect, useCallback } from "react";
import { PageBuilder } from "@/components/PageBuilder";
import { 
  PageConfig, 
  BookingPageId,
  DEFAULT_BOOKING_PAGES,
  BOOKING_PAGE_LIST 
} from "@/components/PageBuilder/types";
import { 
  Paintbrush, 
  Code, 
  ArrowLeft, 
  ChevronDown,
  Home,
  HelpCircle,
  LayoutGrid,
  List,
  FileText,
  ClipboardCheck,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

type Language = "en" | "fr";
type EditorMode = "visual" | "text";

const DEFAULT_TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    "welcome.title": "Welcome to Maison Toa",
    "welcome.description1": "A clinic of aesthetic medicine, surgery and advanced treatments in Lausanne, founded by Dr. Sophie Nordback, FMH specialist in plastic, reconstructive and aesthetic surgery, and Dr. Alexandra Miles, FMH specialist in dermatology and aesthetic medicine.",
    "welcome.description2": "Maison Toa embodies a refined and contemporary vision of beauty, where aesthetic medicine, expert treatments and longevity medicine come together to reveal what truly matters.",
    "welcome.description3": "Surrounded by specialized physicians and expert therapists, each treatment is designed as a bespoke experience, with absolute respect for your identity.",
    "welcome.description4": "Here, nothing is transformed, everything is enhanced.",
    "welcome.description5": "Maison Toa accompanies you over time with precision, balance and elegance, to preserve, reveal and sustain your natural beauty.",
    "welcome.bookAppointment": "Book Appointment",
    "patientType.title": "Are you a new or existing patient?",
    "patientType.subtitle": "This helps us provide you with the best experience",
    "patientType.newPatient": "New Patient",
    "patientType.newPatientDesc": "First time visiting our clinic",
    "patientType.existingPatient": "Existing Patient",
    "patientType.existingPatientDesc": "I've visited before",
    "category.title": "Select your desired treatment",
    "category.subtitle": "Choose a treatment category to continue",
    "treatment.title": "Select your desired treatment",
    "treatment.selectTreatment": "Select Treatment",
    "doctor.title": "Select a Specialist",
    "doctor.subtitle": "Select a specialist available at Lausanne to book your consultation",
    "doctor.bookConsultation": "Book Consultation",
    "booking.title": "Book an Appointment",
    "booking.personalInfo": "Personal Info",
    "booking.dateTime": "Date & Time",
    "booking.confirm": "Confirm",
    "booking.firstName": "First Name",
    "booking.lastName": "Last Name",
    "booking.email": "Email Address",
    "booking.phone": "Phone Number",
    "booking.selectDate": "Select Date & Time",
    "booking.selectDateDesc": "Please select a date",
    "booking.date": "Date",
    "booking.availableSlots": "Available Time Slots",
    "booking.notes": "Additional Notes",
    "booking.notesPlaceholder": "Any specific concerns or requests...",
    "booking.confirmTitle": "Confirm Your Appointment",
    "booking.name": "Name",
    "booking.doctor": "Doctor",
    "booking.time": "Time",
    "booking.service": "Service",
    "booking.location": "Location",
    "booking.confirmBooking": "Confirm Booking",
    "booking.booking": "Booking...",
    "booking.back": "Back",
    "booking.continue": "Continue",
    "booking.backToSpecialists": "Back to Specialists",
    "booking.noSlots": "All time slots are fully booked on this day. Please select another date.",
    "booking.notAvailable": "The doctor is not available on this date. Please select another date.",
    "booking.nextAvailable": "Next available date:",
    "success.title": "Appointment Booked!",
    "success.message": "Your appointment with {doctor} has been confirmed. A confirmation email has been sent to {email}.",
    "success.backHome": "Back to Home",
    "firstVisit.title": "Is this your first visit to Maison Toa?",
    "firstVisit.subtitle": "In order to guide you with precision throughout your journey, we kindly ask you to let us know whether you have already attended a consultation with us.",
    "firstVisit.yes": "Yes, this is my first visit",
    "firstVisit.no": "No, I have already had a consultation",
    "common.back": "Back",
    "common.loading": "Loading...",
    "common.footer": "© {year} Maison Toá. All rights reserved.",
  },
  fr: {
    "welcome.title": "Bienvenue chez Maison Toa",
    "welcome.description1": "Clinique de médecine esthétique, de chirurgie et de soins à Lausanne, fondée par la Dre Sophie Nordback, spécialiste FMH en chirurgie plastique, reconstructive et esthétique, et la Dre Alexandra Miles, spécialiste FMH en dermatologie et médecine esthétique.",
    "welcome.description2": "Maison Tōa incarne une vision exigeante et contemporaine de la beauté, où médecine esthétique, soins experts et médecine de longévité s'unissent pour révéler l'essentiel.",
    "welcome.description3": "Entourée de médecins spécialisés et d'expertes en soins, chaque prise en charge est pensée comme une expérience sur mesure, dans le respect absolu de votre identité.",
    "welcome.description4": "Ici, rien n'est transformé, tout est sublimé.",
    "welcome.description5": "Maison Tōa vous accompagne dans le temps, avec précision, justesse et élégance, pour préserver, révéler et faire durer votre beauté naturelle.",
    "welcome.bookAppointment": "Prendre rendez-vous",
    "patientType.title": "Êtes-vous un nouveau patient ou un patient existant?",
    "patientType.subtitle": "Cela nous aide à vous offrir la meilleure expérience",
    "patientType.newPatient": "Nouveau Patient",
    "patientType.newPatientDesc": "Première visite à notre clinique",
    "patientType.existingPatient": "Patient Existant",
    "patientType.existingPatientDesc": "J'ai déjà consulté",
    "category.title": "Sélectionnez la prise en charge souhaitée",
    "category.subtitle": "Choisissez une catégorie de traitement pour continuer",
    "treatment.title": "Sélectionnez la prise en charge souhaitée",
    "treatment.selectTreatment": "Sélectionner le traitement",
    "doctor.title": "Spécialistes disponibles",
    "doctor.subtitle": "Sélectionnez un spécialiste disponible à Lausanne pour réserver votre consultation",
    "doctor.bookConsultation": "Réserver une consultation",
    "booking.title": "Prendre un rendez-vous",
    "booking.personalInfo": "Informations personnelles",
    "booking.dateTime": "Date et heure",
    "booking.confirm": "Confirmer",
    "booking.firstName": "Prénom",
    "booking.lastName": "Nom",
    "booking.email": "Adresse e-mail",
    "booking.phone": "Numéro de téléphone",
    "booking.selectDate": "Sélectionner une date et un horaire",
    "booking.selectDateDesc": "Veuillez sélectionner une date",
    "booking.date": "Date",
    "booking.availableSlots": "Créneaux horaires disponibles",
    "booking.notes": "Notes supplémentaires",
    "booking.notesPlaceholder": "Préoccupations ou demandes spécifiques...",
    "booking.confirmTitle": "Confirmez votre rendez-vous",
    "booking.name": "Nom",
    "booking.doctor": "Médecin",
    "booking.time": "Heure",
    "booking.service": "Service",
    "booking.location": "Lieu",
    "booking.confirmBooking": "Confirmer la réservation",
    "booking.booking": "Réservation...",
    "booking.back": "Retour",
    "booking.continue": "Continuer",
    "booking.backToSpecialists": "Retour aux spécialistes",
    "booking.noSlots": "Tous les créneaux sont complets pour cette journée. Veuillez sélectionner une autre date.",
    "booking.notAvailable": "Le médecin n'est pas disponible à cette date. Veuillez sélectionner une autre date.",
    "booking.nextAvailable": "Prochaine date disponible:",
    "success.title": "Rendez-vous confirmé!",
    "success.message": "Votre rendez-vous avec {doctor} a été confirmé. Un e-mail de confirmation a été envoyé à {email}.",
    "success.backHome": "Retour à l'accueil",
    "firstVisit.title": "Est-ce votre première visite au sein de Maison Tóā?",
    "firstVisit.subtitle": "Afin de vous orienter avec précision dans votre parcours, nous vous remercions de nous indiquer si vous avez déjà été reçu(e) en consultation.",
    "firstVisit.yes": "Oui, il s'agit de ma première visite",
    "firstVisit.no": "Non, j'ai déjà effectué une consultation",
    "common.back": "Retour",
    "common.loading": "Chargement...",
    "common.footer": "© {year} Maison Toá. Tous droits réservés.",
  },
};

const CONTENT_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "Landing Page",
    keys: [
      "welcome.title",
      "welcome.description1",
      "welcome.description2",
      "welcome.description3",
      "welcome.description4",
      "welcome.description5",
      "welcome.bookAppointment",
    ],
  },
  {
    label: "First Visit",
    keys: ["firstVisit.title", "firstVisit.subtitle", "firstVisit.yes", "firstVisit.no"],
  },
  {
    label: "Patient Type",
    keys: [
      "patientType.title",
      "patientType.subtitle",
      "patientType.newPatient",
      "patientType.newPatientDesc",
      "patientType.existingPatient",
      "patientType.existingPatientDesc",
    ],
  },
  {
    label: "Category & Treatment",
    keys: [
      "category.title",
      "category.subtitle",
      "treatment.title",
      "treatment.selectTreatment",
    ],
  },
  {
    label: "Doctor Selection",
    keys: ["doctor.title", "doctor.subtitle", "doctor.bookConsultation"],
  },
  {
    label: "Booking Form",
    keys: [
      "booking.title",
      "booking.personalInfo",
      "booking.dateTime",
      "booking.confirm",
      "booking.firstName",
      "booking.lastName",
      "booking.email",
      "booking.phone",
      "booking.selectDate",
      "booking.selectDateDesc",
      "booking.date",
      "booking.availableSlots",
      "booking.notes",
      "booking.notesPlaceholder",
      "booking.confirmTitle",
      "booking.name",
      "booking.doctor",
      "booking.time",
      "booking.service",
      "booking.location",
      "booking.confirmBooking",
      "booking.booking",
      "booking.back",
      "booking.continue",
      "booking.backToSpecialists",
      "booking.noSlots",
      "booking.notAvailable",
      "booking.nextAvailable",
    ],
  },
  {
    label: "Success & Errors",
    keys: [
      "success.title",
      "success.message",
      "success.backHome",
      "error.required",
      "error.invalidEmail",
      "error.invalidPhone",
      "error.selectDateTime",
    ],
  },
  {
    label: "Common",
    keys: ["common.back", "common.loading", "common.footer"],
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

// Icon mapping for page list
const PAGE_ICONS: Record<string, React.ReactNode> = {
  Home: <Home className="w-4 h-4" />,
  HelpCircle: <HelpCircle className="w-4 h-4" />,
  LayoutGrid: <LayoutGrid className="w-4 h-4" />,
  List: <List className="w-4 h-4" />,
  FileText: <FileText className="w-4 h-4" />,
  ClipboardCheck: <ClipboardCheck className="w-4 h-4" />,
  CheckCircle: <CheckCircle className="w-4 h-4" />,
};

export default function BookAppointmentCMSPage() {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("visual");

  // ── Page Builder state ───────────────────────────────────────────────────
  const [selectedPageId, setSelectedPageId] = useState<BookingPageId>("landing");
  const [allPageConfigs, setAllPageConfigs] = useState<Record<BookingPageId, PageConfig>>(DEFAULT_BOOKING_PAGES);
  const [pageConfigLoaded, setPageConfigLoaded] = useState(false);
  const [pageDropdownOpen, setPageDropdownOpen] = useState(false);

  // Get current page config
  const currentPageConfig = allPageConfigs[selectedPageId];

  // ── Content editor state ──────────────────────────────────────────────────
  const [contentLang, setContentLang] = useState<Language>("en");
  const [contentDrafts, setContentDrafts] = useState<Record<Language, Record<string, string>>>({
    en: {},
    fr: {},
  });
  const [contentLoaded, setContentLoaded] = useState(false);
  const [contentSaving, setContentSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchContent = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/content-translations");
      const data = await res.json();
      if (data.translations && typeof data.translations === "object") {
        setContentDrafts({
          en: { ...DEFAULT_TRANSLATIONS.en, ...(data.translations.en ?? {}) },
          fr: { ...DEFAULT_TRANSLATIONS.fr, ...(data.translations.fr ?? {}) },
        });
      } else {
        setContentDrafts({
          en: { ...DEFAULT_TRANSLATIONS.en },
          fr: { ...DEFAULT_TRANSLATIONS.fr },
        });
      }
      // Load all page configs
      if (data.bookingPages && typeof data.bookingPages === "object") {
        setAllPageConfigs((prev) => ({
          ...prev,
          ...data.bookingPages,
        }));
      }
      setPageConfigLoaded(true);
    } catch {
      setContentDrafts({
        en: { ...DEFAULT_TRANSLATIONS.en },
        fr: { ...DEFAULT_TRANSLATIONS.fr },
      });
      setPageConfigLoaded(true);
    } finally {
      setContentLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // ── Page Config save ─────────────────────────────────────────────────────
  const savePageConfig = async (config: PageConfig) => {
    setContentSaving(true);
    try {
      // Update local state
      const updatedPages = {
        ...allPageConfigs,
        [selectedPageId]: config,
      };
      
      const res = await fetch("/api/settings/content-translations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingPages: updatedPages }),
      });
      if (!res.ok) throw new Error();
      setAllPageConfigs(updatedPages);
      showToast(`${config.name} saved successfully!`);
    } catch {
      showToast("Failed to save page layout", false);
    } finally {
      setContentSaving(false);
    }
  };

  // ── Content save ──────────────────────────────────────────────────────────
  const saveContent = async () => {
    setContentSaving(true);
    try {
      const res = await fetch("/api/settings/content-translations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translations: contentDrafts }),
      });
      if (!res.ok) throw new Error();
      showToast("Content saved — live on the booking page");
    } catch {
      showToast("Failed to save content", false);
    } finally {
      setContentSaving(false);
    }
  };

  const setContentValue = (key: string, value: string) => {
    setContentDrafts((prev) => ({
      ...prev,
      [contentLang]: { ...prev[contentLang], [key]: value },
    }));
  };

  const resetContentKey = (key: string) => {
    setContentDrafts((prev) => ({
      ...prev,
      [contentLang]: {
        ...prev[contentLang],
        [key]: DEFAULT_TRANSLATIONS[contentLang][key] ?? "",
      },
    }));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  
  // Show visual page builder
  if (editorMode === "visual") {
    if (!pageConfigLoaded) {
      return (
        <div className="h-screen flex items-center justify-center bg-slate-100">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      );
    }

    return (
      <div className="h-screen flex flex-col">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-20 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
              toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* Mode Toggle Header */}
        <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <Link
              href="/cms"
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back to CMS</span>
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            
            {/* Page Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setPageDropdownOpen(!pageDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {PAGE_ICONS[BOOKING_PAGE_LIST.find(p => p.id === selectedPageId)?.icon || 'Home']}
                <span className="text-sm font-semibold text-slate-700">
                  {currentPageConfig?.name || 'Select Page'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${pageDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {pageDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
                  <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Booking Flow Pages
                  </div>
                  {BOOKING_PAGE_LIST.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => {
                        setSelectedPageId(page.id);
                        setPageDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${
                        selectedPageId === page.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                      }`}
                    >
                      <div className={`${selectedPageId === page.id ? 'text-blue-500' : 'text-slate-400'}`}>
                        {PAGE_ICONS[page.icon]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{page.name}</div>
                        <div className="text-xs text-slate-400 truncate">{page.path}</div>
                      </div>
                      {selectedPageId === page.id && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setEditorMode("visual")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all bg-white text-slate-900 shadow-sm"
              >
                <Paintbrush className="w-4 h-4" />
                Visual
              </button>
              <button
                onClick={() => setEditorMode("text")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-slate-500 hover:text-slate-900"
              >
                <Code className="w-4 h-4" />
                Text Editor
              </button>
            </div>
          </div>
        </div>

        {/* Click outside to close dropdown */}
        {pageDropdownOpen && (
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setPageDropdownOpen(false)}
          />
        )}

        {/* Page Builder */}
        <div className="flex-1 overflow-hidden">
          <PageBuilder
            key={selectedPageId}
            initialConfig={currentPageConfig}
            language={contentLang}
            onLanguageChange={setContentLang}
            onSave={savePageConfig}
            isSaving={contentSaving}
          />
        </div>
      </div>
    );
  }

  // Show text editor mode
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.ok
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Book Appointment CMS</h1>
            <p className="text-sm text-slate-500 mt-1">
              Edit the text, labels, and buttons shown in the public booking flow.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setEditorMode("visual")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-slate-500 hover:text-slate-900"
              >
                <Paintbrush className="w-4 h-4" />
                Visual
              </button>
              <button
                onClick={() => setEditorMode("text")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all bg-slate-900 text-white shadow-sm"
              >
                <Code className="w-4 h-4" />
                Text Editor
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 font-medium">Editing language:</span>
                    <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                      {(["en", "fr"] as Language[]).map((l) => (
                        <button
                          key={l}
                          onClick={() => setContentLang(l)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold uppercase transition-all ${
                            contentLang === l
                              ? "bg-slate-900 text-white shadow"
                              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={saveContent}
                    disabled={contentSaving || !contentLoaded}
                    className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {contentSaving ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Saving…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Publish Changes
                      </>
                    )}
                  </button>
                </div>

                {/* Info banner */}
                <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-sky-800">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    Changes are saved to the database and <strong>immediately reflected</strong> on the public booking page for both languages. Click the reset icon next to any field to restore the default text.
                  </span>
                </div>

                {/* Groups */}
                {!contentLoaded ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {CONTENT_GROUPS.map((group) => (
                      <SectionCard key={group.label}>
                        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                          <h3 className="text-sm font-semibold text-slate-700">{group.label}</h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {group.keys.map((key) => {
                            const current = contentDrafts[contentLang][key] ?? "";
                            const defaultVal = DEFAULT_TRANSLATIONS[contentLang][key] ?? "";
                            const isLong = defaultVal.length > 80;
                            const isModified = current !== defaultVal;
                            const isActive = previewKey === key;

                            return (
                              <div
                                key={key}
                                className={`px-5 py-4 transition-colors ${
                                  isActive ? "bg-sky-50/60" : "hover:bg-slate-50/60"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <code className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                      {key}
                                    </code>
                                    {isModified && (
                                      <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                        Modified
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => setPreviewKey(isActive ? null : key)}
                                      title="Preview default"
                                      className={`p-1.5 rounded-lg transition-colors ${
                                        isActive
                                          ? "bg-sky-100 text-sky-700"
                                          : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                      }`}
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                    </button>
                                    {isModified && (
                                      <button
                                        onClick={() => resetContentKey(key)}
                                        title="Reset to default"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {isActive && (
                                  <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2 mb-2 italic">
                                    Default: {defaultVal}
                                  </p>
                                )}

                                {isLong ? (
                                  <textarea
                                    value={current}
                                    onChange={(e) => setContentValue(key, e.target.value)}
                                    rows={3}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-all bg-white resize-none"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={current}
                                    onChange={(e) => setContentValue(key, e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-all bg-white"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </SectionCard>
                    ))}

                    {/* Live preview panel */}
                    <BookingFlowPreview d={contentDrafts[contentLang]} />
                  </div>
                )}

        </div>
      </div>
    </div>
  );
}

// ── Booking Flow Preview ───────────────────────────────────────────────────────
// Real flow: Landing → First Visit → Category → Treatment → Doctor+Booking Form → Success

const PREVIEW_STEPS = [
  "Landing",
  "First Visit",
  "Category",
  "Treatment",
  "Booking Form",
  "Success",
] as const;
type PreviewStep = (typeof PREVIEW_STEPS)[number];

function BookingFlowPreview({ d }: { d: Record<string, string> }) {
  const [step, setStep] = useState<PreviewStep>("Landing");

  const t = (key: string) => d[key] || key;

  return (
    <SectionCard>
      {/* Header */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Booking Flow Preview</h3>
        <span className="text-xs text-slate-400">Updates as you type</span>
      </div>

      {/* Step tabs */}
      <div className="px-5 pt-3 pb-0 border-b border-slate-100 flex gap-1 flex-wrap">
        {PREVIEW_STEPS.map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`px-3 py-1.5 mb-2 rounded-lg text-xs font-medium transition-all ${
              step === s
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Preview area */}
      <div className="bg-gradient-to-br from-slate-50 via-white to-slate-100 rounded-b-2xl p-6 min-h-[340px]">

        {/* ── Landing ── */}
        {step === "Landing" && (
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">{t("welcome.title")}</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-6 whitespace-pre-line">
              {[d["welcome.description1"], d["welcome.description2"], d["welcome.description3"], d["welcome.description4"], d["welcome.description5"]]
                .filter(Boolean)
                .join("\n\n")}
            </p>
            <div className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full text-sm font-semibold shadow">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {t("welcome.bookAppointment")}
            </div>
          </div>
        )}

        {/* ── First Visit (step 1) ── */}
        {step === "First Visit" && (
          <div className="max-w-lg mx-auto">
            <PreviewStepBar current={1} />
            <div className="bg-white/80 rounded-3xl border border-slate-200 shadow-lg p-8 sm:p-12 text-center mt-4">
              <h1 className="text-2xl font-bold text-slate-900 mb-4">{t("firstVisit.title")}</h1>
              <p className="text-base text-slate-600 mb-10">{t("firstVisit.subtitle")}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <div className="inline-flex items-center justify-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full text-sm font-semibold shadow-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t("firstVisit.yes")}
                </div>
                <div className="inline-flex items-center justify-center gap-2 bg-white text-slate-900 border-2 border-slate-300 px-6 py-3 rounded-full text-sm font-semibold shadow-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {t("firstVisit.no")}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Category (step 2) ── */}
        {step === "Category" && (
          <div className="max-w-lg mx-auto">
            <PreviewStepBar current={2} />
            <div className="mt-4 text-center mb-6">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">{t("category.title")}</h1>
              <p className="text-base text-slate-600">{t("category.subtitle")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {["Aesthetic Treatments", "Consultations", "Skin Care", "Laser"].map((name) => (
                <div key={name} className="bg-white/80 rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">{name}</h3>
                  <div className="flex items-center text-slate-700 text-xs font-medium">
                    <span>{t("treatment.selectTreatment")}</span>
                    <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Treatment (step 3) ── */}
        {step === "Treatment" && (
          <div className="max-w-lg mx-auto">
            <PreviewStepBar current={3} />
            <div className="mt-4 text-center mb-6">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">{t("treatment.title")}</h1>
              <p className="text-base text-slate-600">{t("treatment.subtitle")}</p>
            </div>
            <div className="space-y-3">
              {["Botox", "Fillers", "Skin Booster", "PRP"].map((name) => (
                <div key={name} className="bg-white/80 rounded-2xl px-5 py-4 border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{name}</p>
                    <p className="text-xs text-slate-500">30 min</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Booking Form (step 4 — doctor + personal info) ── */}
        {step === "Booking Form" && (
          <div className="max-w-lg mx-auto">
            <PreviewStepBar current={4} />
            <div className="mt-4">
              <h1 className="text-2xl font-bold text-slate-900 mb-1">{t("doctor.title")}</h1>
              <p className="text-base text-slate-600 mb-5">{t("doctor.subtitle")}</p>
              {/* Doctor cards */}
              <div className="space-y-3 mb-5">
                {["Dr. Sophie Nordback", "Dr. Alexandra Miles"].map((name) => (
                  <div key={name} className="bg-white/80 rounded-2xl px-5 py-4 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">{name}</p>
                      <p className="text-xs text-slate-500">Aesthetic Medicine</p>
                    </div>
                    <div className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap">
                      {t("doctor.bookConsultation")}
                    </div>
                  </div>
                ))}
              </div>
              {/* Booking form fields */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex gap-3">
                  {[t("booking.firstName"), t("booking.lastName")].map((label) => (
                    <div key={label} className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                      <div className="h-8 bg-slate-50 border border-slate-200 rounded-lg" />
                    </div>
                  ))}
                </div>
                {[t("booking.email"), t("booking.phone")].map((label) => (
                  <div key={label}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                    <div className="h-8 bg-slate-50 border border-slate-200 rounded-lg" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t("booking.notes")}</label>
                  <div className="h-14 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <div className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl text-sm font-medium text-center">{t("booking.back")}</div>
                <div className="flex-1 bg-slate-900 text-white py-2.5 rounded-xl text-sm font-medium text-center">{t("booking.continue")}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Success (step 5) ── */}
        {step === "Success" && (
          <div className="max-w-lg mx-auto text-center">
            <PreviewStepBar current={5} />
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 mt-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{t("success.title")}</h2>
              <p className="text-sm text-slate-500 mb-8">
                {t("success.message")
                  .replace("{doctor}", "Dr. Sophie Nordback")
                  .replace("{email}", "patient@example.com")}
              </p>
              <div className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full text-sm font-semibold shadow">
                {t("success.backHome")}
              </div>
            </div>
          </div>
        )}

      </div>
    </SectionCard>
  );
}

function PreviewStepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
              n === current
                ? "bg-slate-900 text-white border-slate-900"
                : n < current
                ? "bg-slate-300 text-white border-slate-300"
                : "bg-white text-slate-400 border-slate-200"
            }`}
          >
            {n}
          </div>
          {n < 5 && <div className={`w-6 h-0.5 ${n < current ? "bg-slate-300" : "bg-slate-200"}`} />}
        </div>
      ))}
    </div>
  );
}
