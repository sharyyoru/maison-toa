"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Language = "en" | "fr";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Main page
    "welcome.title": "Welcome to Maison Toa",
    "welcome.description1": "A clinic of aesthetic medicine, surgery and advanced treatments in Lausanne, founded by Dr. Sophie Nordback, FMH specialist in plastic, reconstructive and aesthetic surgery, and Dr. Alexandra Miles, FMH specialist in dermatology and aesthetic medicine.",
    "welcome.description2": "Maison Toa embodies a refined and contemporary vision of beauty, where aesthetic medicine, expert treatments and longevity medicine come together to reveal what truly matters.",
    "welcome.description3": "Surrounded by specialized physicians and expert therapists, each treatment is designed as a bespoke experience, with absolute respect for your identity.",
    "welcome.description4": "Here, nothing is transformed, everything is enhanced.",
    "welcome.description5": "Maison Toa accompanies you over time with precision, balance and elegance, to preserve, reveal and sustain your natural beauty.",
    "welcome.bookAppointment": "Book Appointment",
    
    // Patient type selection
    "patientType.title": "Are you a new or existing patient?",
    "patientType.subtitle": "This helps us provide you with the best experience",
    "patientType.newPatient": "New Patient",
    "patientType.newPatientDesc": "First time visiting our clinic",
    "patientType.existingPatient": "Existing Patient",
    "patientType.existingPatientDesc": "I've visited before",
    
    // Category selection
    "category.title": "Select your desired treatment",
    "category.subtitle": "Choose a treatment category to continue",
    
    // Treatment selection
    "treatment.title": "Select your desired treatment",
    "treatment.selectTreatment": "Select Treatment",
    
    // Doctor selection
    "doctor.title": "Select a Specialist",
    "doctor.subtitle": "Select a specialist available at Lausanne to book your consultation",
    "doctor.bookConsultation": "Book Consultation",
    
    // Booking form
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
    
    // Success
    "success.title": "Appointment Booked!",
    "success.message": "Your appointment with {doctor} has been confirmed. A confirmation email has been sent to {email}.",
    "success.backHome": "Back to Home",
    
    // Errors
    "error.required": "Please fill in all required fields",
    "error.invalidEmail": "Please enter a valid email address",
    "error.invalidPhone": "Please enter a valid phone number",
    "error.selectDateTime": "Please select a date and time",
    
    // First visit
    "firstVisit.title": "Is this your first visit to Maison Toa?",
    "firstVisit.subtitle": "In order to guide you with precision throughout your journey, we kindly ask you to let us know whether you have already attended a consultation with us.",
    "firstVisit.yes": "Yes, this is my first visit",
    "firstVisit.no": "No, I have already had a consultation",
    
    // Common
    "common.back": "Back",
    "common.loading": "Loading...",
    "common.footer": "© {year} Maison Toá. All rights reserved.",
  },
  fr: {
    // Main page
    "welcome.title": "Bienvenue chez Maison Toa",
    "welcome.description1": "Clinique de médecine esthétique, de chirurgie et de soins à Lausanne, fondée par la Dre Sophie Nordback, spécialiste FMH en chirurgie plastique, reconstructive et esthétique, et la Dre Alexandra Miles, spécialiste FMH en dermatologie et médecine esthétique.",
    "welcome.description2": "Maison Tōa incarne une vision exigeante et contemporaine de la beauté, où médecine esthétique, soins experts et médecine de longévité s'unissent pour révéler l'essentiel.",
    "welcome.description3": "Entourée de médecins spécialisés et d'expertes en soins, chaque prise en charge est pensée comme une expérience sur mesure, dans le respect absolu de votre identité.",
    "welcome.description4": "Ici, rien n'est transformé, tout est sublimé.",
    "welcome.description5": "Maison Tōa vous accompagne dans le temps, avec précision, justesse et élégance, pour préserver, révéler et faire durer votre beauté naturelle.",
    "welcome.bookAppointment": "Prendre rendez-vous",
    
    // Patient type selection
    "patientType.title": "Êtes-vous un nouveau patient ou un patient existant?",
    "patientType.subtitle": "Cela nous aide à vous offrir la meilleure expérience",
    "patientType.newPatient": "Nouveau Patient",
    "patientType.newPatientDesc": "Première visite à notre clinique",
    "patientType.existingPatient": "Patient Existant",
    "patientType.existingPatientDesc": "J'ai déjà consulté",
    
    // Category selection
    "category.title": "Sélectionnez la prise en charge souhaitée",
    "category.subtitle": "Choisissez une catégorie de traitement pour continuer",
    
    // Treatment selection
    "treatment.title": "Sélectionnez la prise en charge souhaitée",
    "treatment.selectTreatment": "Sélectionner le traitement",
    
    // Doctor selection
    "doctor.title": "Spécialistes disponibles",
    "doctor.subtitle": "Sélectionnez un spécialiste disponible à Lausanne pour réserver votre consultation",
    "doctor.bookConsultation": "Réserver une consultation",
    
    // Booking form
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
    
    // Success
    "success.title": "Rendez-vous confirmé!",
    "success.message": "Votre rendez-vous avec {doctor} a été confirmé. Un e-mail de confirmation a été envoyé à {email}.",
    "success.backHome": "Retour à l'accueil",
    
    // Errors
    "error.required": "Veuillez remplir tous les champs obligatoires",
    "error.invalidEmail": "Veuillez entrer une adresse e-mail valide",
    "error.invalidPhone": "Veuillez entrer un numéro de téléphone valide",
    "error.selectDateTime": "Veuillez sélectionner une date et une heure",
    
    // First visit
    "firstVisit.title": "Est-ce votre première visite au sein de Maison Tóā?",
    "firstVisit.subtitle": "Afin de vous orienter avec précision dans votre parcours, nous vous remercions de nous indiquer si vous avez déjà été reçu(e) en consultation.",
    "firstVisit.yes": "Oui, il s’agit de ma première visite",
    "firstVisit.no": "Non, j’ai déjà effectué une consultation",
    
    // Common
    "common.back": "Retour",
    "common.loading": "Chargement...",
    "common.footer": "© {year} Maison Toá. Tous droits réservés.",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

type Overrides = Record<Language, Record<string, string>>;

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [overrides, setOverrides] = useState<Overrides>({ en: {}, fr: {} });

  useEffect(() => {
    const saved = localStorage.getItem("booking-language") as Language;
    if (saved && (saved === "en" || saved === "fr")) {
      setLanguageState(saved);
    }
  }, []);

  useEffect(() => {
    fetch("/api/settings/content-translations")
      .then((r) => r.json())
      .then((data) => {
        if (data.translations && typeof data.translations === "object") {
          setOverrides({
            en: data.translations.en ?? {},
            fr: data.translations.fr ?? {},
          });
        }
      })
      .catch(() => {});
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("booking-language", lang);
  };

  const t = (key: string): string => {
    return overrides[language][key] ?? translations[language][key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
