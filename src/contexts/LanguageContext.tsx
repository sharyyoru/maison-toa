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
    "doctor.title": "Available Specialists",
    "doctor.subtitle": "Select a specialist available at {location} to book your consultation",
    "doctor.subtitleLausanne": "Select a specialist available at Lausanne to book your consultation",
    "doctor.bookConsultation": "Book Consultation",
    "doctor.autoSelectEarliest": "Book earliest available specialist",
    "doctor.findingEarliest": "Finding earliest availability...",
    "doctor.earliestSlotsTitle": "Available appointment slots",
    "doctor.backToAllDoctors": "Back to specialist list",
    "doctor.noEarliestAvailable": "No available specialist was found in the next 90 days.",
    "doctor.autoSelectFailed": "Could not find the earliest available specialist. Please select a specialist manually.",
    
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
    "booking.notes": "Treatment Area(s)",
    "booking.notesPlaceholder": "Please indicate the area(s) you would like to treat.",
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
    "booking.emailChecking": "Checking...",
    "booking.emailAvailable": "Email available",
    "booking.accountFound": "Account found",
    "booking.checkingAvailability": "Checking availability...",
    "booking.nextAvailableSlots": "Next 15 available slots",
    "booking.noAvailableSlotsFound": "No available slots found",
    "booking.doctorNotFound": "Doctor not found",
    "booking.noTreatmentsAvailable": "No treatments available in this category.",
    "booking.noCategoriesAvailable": "No categories available at the moment.",
    "booking.treatment": "Treatment",
    "booking.slot": "slot",
    "booking.slots": "slots",
    
    // Success
    "success.title": "Appointment Booked!",
    "success.message": "Your appointment with {doctor} has been confirmed. A confirmation email has been sent to {email}.",
    "success.backHome": "Back to Home",
    
    // Errors
    "error.required": "Please fill in all required fields",
    "error.invalidEmail": "Please enter a valid email address",
    "error.invalidPhone": "Please enter a valid phone number",
    "error.selectDateTime": "Please select a date and time",
    "error.notesRequired": "Please add a note about your visit before continuing.",
    
    // First visit
    "firstVisit.title": "Is this your first visit to Maison Toa?",
    "firstVisit.subtitle": "In order to guide you with precision throughout your journey, we kindly ask you to let us know whether you have already attended a consultation with us.",
    "firstVisit.yes": "Yes, this is my first visit",
    "firstVisit.no": "No, I have already had a consultation",
    
    // Common
    "common.back": "Back",
    "common.loading": "Loading...",
    "common.readMore": "Read more",
    "common.close": "Close",
    "common.description": "Description",
    "common.specialty": "Specialty",
    "common.about": "About",
    "common.footer": "© {year} Maison Tóā",
    "common.payDepositConfirm": "Pay deposit & confirm",
    "common.bookAsExisting": "Book as existing patient",
    "common.bookAsNew": "Book as new patient",
    "common.generalConsultation": "General Consultation",
    "common.generalConsultationDescription": "All appointments are for a general consultation where our specialists will discuss your needs and guide you to the best treatment options.",
    "location.choose": "Choose Your Location",
    "location.chooseSubtitle": "Select your preferred clinic location to see available specialists",
    "location.allOffer": "All Locations Offer",
    "location.allOfferDescription": "Free consultations, 3D simulations, and our full range of aesthetic services. Choose the location most convenient for you.",
    "location.change": "Change Location",
    "location.noSpecialists": "No specialists available at this location.",
    "location.chooseAnother": "Choose Another Location",
    "doctor.backToDoctors": "Back to Doctors",
    "booking.clinicClosed": "The clinic is closed on this date. Please select another date.",
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
    "doctor.subtitle": "Sélectionnez un spécialiste disponible à {location} pour réserver votre consultation",
    "doctor.subtitleLausanne": "Sélectionnez un spécialiste disponible à Lausanne pour réserver votre consultation",
    "doctor.bookConsultation": "Réserver une consultation",
    "doctor.autoSelectEarliest": "Réserver le spécialiste disponible au plus tôt",
    "doctor.findingEarliest": "Recherche de la première disponibilité...",
    "doctor.earliestSlotsTitle": "Créneaux disponibles",
    "doctor.backToAllDoctors": "Retour à la liste des spécialistes",
    "doctor.noEarliestAvailable": "Aucun spécialiste disponible trouvé dans les 90 prochains jours.",
    "doctor.autoSelectFailed": "Impossible de trouver le spécialiste disponible au plus tôt. Veuillez sélectionner un spécialiste manuellement.",
    
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
    "booking.notes": "Zone(s) à traiter",
    "booking.notesPlaceholder": "Veuillez indiquer la ou les zone(s) que vous souhaitez traiter.",
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
    "booking.emailChecking": "Vérification...",
    "booking.emailAvailable": "E-mail disponible",
    "booking.accountFound": "Compte trouvé",
    "booking.checkingAvailability": "Vérification des disponibilités...",
    "booking.nextAvailableSlots": "15 prochains créneaux disponibles",
    "booking.noAvailableSlotsFound": "Aucun créneau disponible trouvé",
    "booking.doctorNotFound": "Médecin introuvable",
    "booking.noTreatmentsAvailable": "Aucun traitement disponible dans cette catégorie.",
    "booking.noCategoriesAvailable": "Aucune catégorie disponible pour le moment.",
    "booking.treatment": "Traitement",
    "booking.slot": "créneau",
    "booking.slots": "créneaux",
    
    // Success
    "success.title": "Rendez-vous confirmé!",
    "success.message": "Votre rendez-vous avec {doctor} a été confirmé. Un e-mail de confirmation a été envoyé à {email}.",
    "success.backHome": "Retour à l'accueil",
    
    // Errors
    "error.required": "Veuillez remplir tous les champs obligatoires",
    "error.invalidEmail": "Veuillez entrer une adresse e-mail valide",
    "error.invalidPhone": "Veuillez entrer un numéro de téléphone valide",
    "error.selectDateTime": "Veuillez sélectionner une date et une heure",
    "error.notesRequired": "Veuillez ajouter une note concernant votre visite avant de continuer.",
    
    // First visit
    "firstVisit.title": "Est-ce votre première visite au sein de Maison Tóā?",
    "firstVisit.subtitle": "Afin de vous orienter avec précision dans votre parcours, nous vous remercions de nous indiquer si vous avez déjà été reçu(e) en consultation.",
    "firstVisit.yes": "Oui, il s’agit de ma première visite",
    "firstVisit.no": "Non, j’ai déjà effectué une consultation",
    
    // Common
    "common.back": "Retour",
    "common.loading": "Chargement...",
    "common.readMore": "Lire la suite",
    "common.close": "Fermer",
    "common.description": "Description",
    "common.specialty": "Spécialité",
    "common.about": "À propos",
    "common.footer": "© {year} Maison Tóā",
    "common.payDepositConfirm": "Payer l'acompte & confirmer",
    "common.bookAsExisting": "Réserver en tant que patient existant",
    "common.bookAsNew": "Réserver en tant que nouveau patient",
    "common.generalConsultation": "Consultation générale",
    "common.generalConsultationDescription": "Tous les rendez-vous sont des consultations générales durant lesquelles nos spécialistes discutent de vos besoins et vous orientent vers les meilleures options de traitement.",
    "location.choose": "Choisissez votre lieu",
    "location.chooseSubtitle": "Sélectionnez votre clinique préférée pour voir les spécialistes disponibles",
    "location.allOffer": "Toutes les cliniques proposent",
    "location.allOfferDescription": "Des consultations, des simulations 3D et toute notre gamme de services esthétiques. Choisissez le lieu qui vous convient le mieux.",
    "location.change": "Changer de lieu",
    "location.noSpecialists": "Aucun spécialiste disponible à ce lieu.",
    "location.chooseAnother": "Choisir un autre lieu",
    "doctor.backToDoctors": "Retour aux spécialistes",
    "booking.clinicClosed": "La clinique est fermée à cette date. Veuillez sélectionner une autre date.",
  },
};

const normalizeLegacyBookingTranslations = (
  language: Language,
  values: Record<string, string>
): Record<string, string> => {
  const normalized = { ...values };
  const legacyValues = language === "en"
    ? {
        "booking.notes": "Additional Notes",
        "booking.notesPlaceholder": "Any specific concerns or requests...",
      }
    : {
        "booking.notes": "Notes supplémentaires",
        "booking.notesPlaceholder": "Préoccupations ou demandes spécifiques...",
      };

  for (const [key, legacyValue] of Object.entries(legacyValues)) {
    if (normalized[key] === legacyValue) {
      normalized[key] = translations[language][key];
    }
  }

  return normalized;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

type Overrides = Record<Language, Record<string, string>>;

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("fr");
  const [overrides, setOverrides] = useState<Overrides>({ en: {}, fr: {} });

  useEffect(() => {
    const saved = localStorage.getItem("booking-language") as Language;
    if (saved && (saved === "en" || saved === "fr")) {
      setLanguageState(saved);
    }
  }, []);

  useEffect(() => {
    fetch("/api/settings/content-translations", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.translations && typeof data.translations === "object") {
          setOverrides({
            en: normalizeLegacyBookingTranslations("en", data.translations.en ?? {}),
            fr: normalizeLegacyBookingTranslations("fr", data.translations.fr ?? {}),
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
