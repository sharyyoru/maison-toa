// Form definitions for patient forms
// Each form corresponds to a PDF/DOCX in public/forms/

export type FormFieldType = 
  | "text" 
  | "textarea" 
  | "email" 
  | "phone" 
  | "date" 
  | "checkbox" 
  | "radio" 
  | "select" 
  | "number"
  | "signature"
  | "section";

export type FormField = {
  id: string;
  type: FormFieldType;
  label: string;
  labelFr?: string;
  required?: boolean;
  options?: { value: string; label: string; labelFr?: string }[];
  placeholder?: string;
  placeholderFr?: string;
  helpText?: string;
  helpTextFr?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
};

export type FormSection = {
  id: string;
  title: string;
  titleFr?: string;
  description?: string;
  descriptionFr?: string;
  fields: FormField[];
};

export type FormDefinition = {
  id: string;
  name: string;
  nameFr?: string;
  description: string;
  descriptionFr?: string;
  language: "en" | "fr";
  category: "consent" | "questionnaire" | "instructions" | "attestation" | "convocation" | "operative-protocol" | "medical-letter" | "insurance-letter";
  originalFile: string;
  sections: FormSection[];
  doctor?: string;
};

export const FORM_DEFINITIONS: FormDefinition[] = [
  // ===== PATIENT INFORMATION FORM - FRENCH =====
  {
    id: "patient-information-fr",
    name: "Patient Information Form",
    nameFr: "Informations patient",
    description: "Complete your patient profile with missing information",
    descriptionFr: "Complétez votre profil patient avec les informations manquantes",
    language: "fr",
    category: "questionnaire",
    originalFile: "",
    sections: [
      {
        id: "personal-info",
        title: "Personal Information",
        titleFr: "Informations personnelles",
        description: "Please verify and complete your personal details",
        descriptionFr: "Veuillez vérifier et compléter vos informations personnelles",
        fields: [
          { id: "first_name", type: "text", label: "First Name", labelFr: "Prénom", required: true, placeholder: "First name", placeholderFr: "Prénom" },
          { id: "last_name", type: "text", label: "Last Name", labelFr: "Nom", required: true, placeholder: "Last name", placeholderFr: "Nom" },
          { id: "email", type: "email", label: "Email Address", labelFr: "Adresse e-mail", required: true, placeholder: "name@example.com" },
          { id: "phone", type: "phone", label: "Phone Number", labelFr: "Numéro de téléphone", required: true, placeholder: "+41 79 123 45 67" },
          { 
            id: "gender", 
            type: "select", 
            label: "Gender", 
            labelFr: "Genre",
            options: [
              { value: "male", label: "Male", labelFr: "Homme" },
              { value: "female", label: "Female", labelFr: "Femme" }
            ]
          },
          { id: "dob", type: "date", label: "Date of Birth", labelFr: "Date de naissance" },
        ],
      },
      {
        id: "address-info",
        title: "Address",
        titleFr: "Adresse",
        description: "Please provide your address details",
        descriptionFr: "Veuillez fournir votre adresse",
        fields: [
          { id: "street_address", type: "text", label: "Street Address", labelFr: "Adresse", placeholder: "Street address", placeholderFr: "Adresse" },
          { id: "street_number", type: "text", label: "Number", labelFr: "Numéro", placeholder: "1a" },
          { id: "postal_code", type: "text", label: "Postal Code", labelFr: "Code postal", placeholder: "1000" },
          { id: "town", type: "text", label: "City", labelFr: "Ville", placeholder: "Lausanne" },
          { id: "country", type: "text", label: "Country", labelFr: "Pays", placeholder: "Switzerland", placeholderFr: "Suisse" },
        ],
      },
      {
        id: "preferences",
        title: "Preferences",
        titleFr: "Préférences",
        fields: [
          { 
            id: "language_preference", 
            type: "select", 
            label: "Preferred Language", 
            labelFr: "Langue préférée",
            options: [
              { value: "en", label: "English", labelFr: "Anglais" },
              { value: "fr", label: "French", labelFr: "Français" },
              { value: "de", label: "German", labelFr: "Allemand" },
              { value: "it", label: "Italian", labelFr: "Italien" }
            ]
          },
        ],
      },
      {
        id: "communication-preferences",
        title: "Communication Preferences",
        titleFr: "Préférences de communication",
        fields: [
          {
            id: "email_communications",
            type: "radio",
            label: "Do you accept to receive monthly email communications about our offers?",
            labelFr: "Acceptez-vous de recevoir des communications mensuelles par e-mail concernant nos offres ?",
            required: true,
            options: [
              { value: "yes", label: "Yes", labelFr: "Oui" },
              { value: "no", label: "No", labelFr: "Non" }
            ]
          },
          {
            id: "photo_consent",
            type: "radio",
            label: "Do you accept that photos taken by Maison Toa can be used on our social media and case studies?",
            labelFr: "Acceptez-vous que les photos prises par Maison Toa puissent être utilisées sur nos réseaux sociaux et études de cas ?",
            required: true,
            options: [
              { value: "yes", label: "Yes", labelFr: "Oui" },
              { value: "no", label: "No", labelFr: "Non" }
            ]
          },
        ],
      },
      {
        id: "areas-of-interest",
        title: "Areas of Interest",
        titleFr: "Domaines d'intérêt",
        fields: [
          {
            id: "specialty_interest",
            type: "select",
            label: "Which specialty are you interested in?",
            labelFr: "Quelle spécialité vous intéresse ?",
            options: [
              { value: "aesthetic_medicine", label: "Aesthetic Medicine", labelFr: "Médecine esthétique" },
              { value: "dermatology", label: "Dermatology", labelFr: "Dermatologie" },
              { value: "plastic_surgery", label: "Plastic Surgery", labelFr: "Chirurgie plastique" },
              { value: "laser_treatments", label: "Laser Treatments", labelFr: "Traitements au laser" },
              { value: "other", label: "Other", labelFr: "Autre" }
            ]
          },
          {
            id: "referral_source",
            type: "select",
            label: "How did you hear about us?",
            labelFr: "Comment avez-vous entendu parler de nous ?",
            options: [
              { value: "google", label: "Google", labelFr: "Google" },
              { value: "social_media", label: "Social Media", labelFr: "Réseaux sociaux" },
              { value: "friend_family", label: "Friend/Family", labelFr: "Ami/Famille" },
              { value: "doctor_referral", label: "Doctor Referral", labelFr: "Référence médicale" },
              { value: "advertisement", label: "Advertisement", labelFr: "Publicité" },
              { value: "other", label: "Other", labelFr: "Autre" }
            ]
          },
        ],
      },
      {
        id: "consent",
        title: "Data Processing Consent",
        titleFr: "Consentement au traitement des données",
        description: "By signing, I confirm that I consent to the processing of my data, to access by the physician, and to their transmission to third parties in accordance with the information intended for patients. I am aware of the potential risks related to the exchange of sensitive personal data (possible leakage by unauthorized third parties in case of unsecure communication tools) as well as my rights. I consent to mutual contact between my physician and myself using the contact information provided above. The medical office transmits patient information exclusively through secure communication channels. I agree that administrative questions, such as appointment rescheduling, may be transmitted via unencrypted emails.",
        descriptionFr: "En signant, je confirme que je consens au traitement de mes données, à l'accès par le médecin et à leur transmission à des tiers conformément aux informations destinées aux patients. Je suis conscient des risques potentiels liés à l'échange de données personnelles sensibles (fuite possible par des tiers non autorisés en cas d'outils de communication non sécurisés) ainsi que de mes droits. Je consens au contact mutuel entre mon médecin et moi-même en utilisant les coordonnées fournies ci-dessus. Le cabinet médical transmet les informations des patients exclusivement par des canaux de communication sécurisés. J'accepte que les questions administratives, telles que la reprogrammation de rendez-vous, puissent être transmises par e-mails non cryptés.",
        fields: [
          {
            id: "consent_understood",
            type: "checkbox",
            label: "I have read and understood the data processing consent above",
            labelFr: "J'ai lu et compris le consentement au traitement des données ci-dessus",
            required: true
          },
          {
            id: "signature",
            type: "signature",
            label: "Signature",
            labelFr: "Signature",
            required: true
          },
        ],
      },
    ],
  },

  // ===== PATIENT INFORMATION FORM - ENGLISH =====
  {
    id: "patient-information-en",
    name: "Patient Information Form",
    nameFr: "Informations patient",
    description: "Complete your patient profile with missing information",
    descriptionFr: "Complétez votre profil patient avec les informations manquantes",
    language: "en",
    category: "questionnaire",
    originalFile: "",
    sections: [
      {
        id: "personal-info",
        title: "Personal Information",
        description: "Please verify and complete your personal details",
        fields: [
          { id: "first_name", type: "text", label: "First Name", required: true, placeholder: "First name" },
          { id: "last_name", type: "text", label: "Last Name", required: true, placeholder: "Last name" },
          { id: "email", type: "email", label: "Email Address", required: true, placeholder: "name@example.com" },
          { id: "phone", type: "phone", label: "Phone Number", required: true, placeholder: "+41 79 123 45 67" },
          { 
            id: "gender", 
            type: "select", 
            label: "Gender",
            options: [
              { value: "male", label: "Male" },
              { value: "female", label: "Female" }
            ]
          },
          { id: "dob", type: "date", label: "Date of Birth" },
        ],
      },
      {
        id: "address-info",
        title: "Address",
        description: "Please provide your address details",
        fields: [
          { id: "street_address", type: "text", label: "Street Address", placeholder: "Street address" },
          { id: "street_number", type: "text", label: "Number", placeholder: "1a" },
          { id: "postal_code", type: "text", label: "Postal Code", placeholder: "1000" },
          { id: "town", type: "text", label: "City", placeholder: "Lausanne" },
          { id: "country", type: "text", label: "Country", placeholder: "Switzerland" },
        ],
      },
      {
        id: "preferences",
        title: "Preferences",
        fields: [
          { 
            id: "language_preference", 
            type: "select", 
            label: "Preferred Language",
            options: [
              { value: "en", label: "English" },
              { value: "fr", label: "French" },
              { value: "de", label: "German" },
              { value: "it", label: "Italian" }
            ]
          },
        ],
      },
      {
        id: "communication-preferences",
        title: "Communication Preferences",
        fields: [
          {
            id: "email_communications",
            type: "radio",
            label: "Do you accept to receive monthly email communications about our offers?",
            required: true,
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]
          },
          {
            id: "photo_consent",
            type: "radio",
            label: "Do you accept that photos taken by Maison Toa can be used on our social media and case studies?",
            required: true,
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]
          },
        ],
      },
      {
        id: "areas-of-interest",
        title: "Areas of Interest",
        fields: [
          {
            id: "specialty_interest",
            type: "select",
            label: "Which specialty are you interested in?",
            options: [
              { value: "aesthetic_medicine", label: "Aesthetic Medicine" },
              { value: "dermatology", label: "Dermatology" },
              { value: "plastic_surgery", label: "Plastic Surgery" },
              { value: "laser_treatments", label: "Laser Treatments" },
              { value: "other", label: "Other" }
            ]
          },
          {
            id: "referral_source",
            type: "select",
            label: "How did you hear about us?",
            options: [
              { value: "google", label: "Google" },
              { value: "social_media", label: "Social Media" },
              { value: "friend_family", label: "Friend/Family" },
              { value: "doctor_referral", label: "Doctor Referral" },
              { value: "advertisement", label: "Advertisement" },
              { value: "other", label: "Other" }
            ]
          },
        ],
      },
      {
        id: "consent",
        title: "Data Processing Consent",
        description: "By signing, I confirm that I consent to the processing of my data, to access by the physician, and to their transmission to third parties in accordance with the information intended for patients. I am aware of the potential risks related to the exchange of sensitive personal data (possible leakage by unauthorized third parties in case of unsecure communication tools) as well as my rights. I consent to mutual contact between my physician and myself using the contact information provided above. The medical office transmits patient information exclusively through secure communication channels. I agree that administrative questions, such as appointment rescheduling, may be transmitted via unencrypted emails.",
        fields: [
          {
            id: "consent_understood",
            type: "checkbox",
            label: "I have read and understood the data processing consent above",
            required: true
          },
          {
            id: "signature",
            type: "signature",
            label: "Signature",
            required: true
          },
        ],
      },
    ],
  },
];

export function getFormById(formId: string): FormDefinition | undefined {
  return FORM_DEFINITIONS.find((form) => form.id === formId);
}

export function getFormsByLanguage(language: "en" | "fr"): FormDefinition[] {
  return FORM_DEFINITIONS.filter((form) => form.language === language);
}

export function getFormsByCategory(category: "consent" | "questionnaire" | "instructions" | "attestation" | "convocation" | "operative-protocol" | "medical-letter" | "insurance-letter"): FormDefinition[] {
  return FORM_DEFINITIONS.filter((form) => form.category === category);
}

export function getAllForms(): FormDefinition[] {
  return FORM_DEFINITIONS;
}
