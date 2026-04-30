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
  // ===== FICHE PATIENT - FRENCH =====
  {
    id: "fiche-patient-fr",
    name: "Patient Information Form",
    nameFr: "Fiche patient",
    description: "Patient registration and consent form",
    descriptionFr: "Formulaire d'inscription et de consentement du patient",
    language: "fr",
    category: "questionnaire",
    originalFile: "fiche-patient-fr.pdf",
    sections: [
      {
        id: "personal-info",
        title: "Personal Information",
        titleFr: "Vos informations",
        fields: [
          { id: "last_name", type: "text", label: "Last Name", labelFr: "Nom", required: true },
          { id: "first_name", type: "text", label: "First Name", labelFr: "Prénom", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "phone", type: "phone", label: "Phone", labelFr: "Téléphone", required: true },
          { id: "email", type: "email", label: "Email", labelFr: "Email", required: true },
          { id: "address_line1", type: "text", label: "Address", labelFr: "Adresse postale", required: true },
          { id: "address_line2", type: "text", label: "Address Line 2", labelFr: "Adresse ligne 2" },
          { id: "city", type: "text", label: "City", labelFr: "Ville", required: true },
          { id: "postal_code", type: "text", label: "Postal Code", labelFr: "Code postal", required: true },
        ],
      },
      {
        id: "communication-preferences",
        title: "Communication Preferences",
        titleFr: "Préférences de communication",
        fields: [
          { 
            id: "email_offers_consent", 
            type: "radio", 
            label: "Do you accept to receive monthly email communications about our offers?", 
            labelFr: "Acceptez-vous de recevoir une communication par e-mail une fois par mois de nos offres?", 
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
            labelFr: "Acceptez-vous que les photos prises par Maison Toa puissent être utilisées dans le cadre de nos réseaux sociaux et études de cas?", 
            required: true,
            options: [
              { value: "yes", label: "Yes", labelFr: "Oui" },
              { value: "no", label: "No", labelFr: "Non" }
            ],
            helpText: "Photos are published anonymously and blurred. Your name is not revealed. You have the right to revoke this authorization at any time.",
            helpTextFr: "Les photographies sont publiées de façon anonyme et floutées. Votre nom n'est pas dévoilé. Vous êtes en droit de révoquer cette autorisation à tout moment."
          },
        ],
      },
      {
        id: "interests",
        title: "Areas of Interest",
        titleFr: "Domaines d'intérêt",
        fields: [
          { 
            id: "specialty_interest", 
            type: "select", 
            label: "Which specialty are you interested in?", 
            labelFr: "Par quelle spécialité êtes-vous intéressée?",
            options: [
              { value: "plastic_surgery", label: "Plastic Surgery", labelFr: "Chirurgie plastique" },
              { value: "dermatology", label: "Dermatology", labelFr: "Dermatologie" },
              { value: "injections", label: "Injections", labelFr: "Injections" },
              { value: "lasers", label: "Lasers", labelFr: "Lasers" },
              { value: "signature_care", label: "Maison Tóā Signature Care", labelFr: "Soin signature Maison Tóā" },
              { value: "hair", label: "Hair", labelFr: "Cheveux" }
            ]
          },
          { 
            id: "referral_source", 
            type: "select", 
            label: "How did you hear about us?", 
            labelFr: "Comment avez-vous entendu parler de nous?",
            options: [
              { value: "recommendation", label: "Recommendation", labelFr: "Recommandation" },
              { value: "influencer", label: "Influencer", labelFr: "Influenceur" },
              { value: "instagram", label: "Instagram", labelFr: "Instagram" },
              { value: "facebook", label: "Facebook", labelFr: "Facebook" },
              { value: "google", label: "Google Search", labelFr: "Recherche Google" }
            ]
          },
        ],
      },
      {
        id: "data-consent",
        title: "Data Processing Consent",
        titleFr: "Consentement au traitement des données",
        description: "By signing, I confirm that I consent to the processing of my data, to access by the physician, and to their transmission to third parties in accordance with the information intended for patients. I am aware of the potential risks related to the exchange of sensitive personal data (possible consultation by unauthorized third parties in case of use of insecure communication tools) as well as my rights. I consent to mutual contact between my physician and myself using the contact information provided above. The medical office transmits patient information exclusively through secure communication channels. I agree that administrative questions, such as appointment rescheduling, may be transmitted via unencrypted emails.",
        descriptionFr: "Par ma signature, je confirme consentir au traitement de mes données, à l'accès à celles-ci par la ou le médecin ainsi qu'à leur transmission à des tiers conformément à l'information destinée à la patientèle. Je suis conscient-e des risques potentiels liés à l'échange de données personnelles sensibles (consultation possible par des tiers non autorisés en cas d'utilisation d'outils de communication peu sûrs) ainsi que de mes droits. Je consens à un contact mutuel entre ma ou mon médecin et moi-même en tant que patiente ou patient au moyen des indications de contact figurant ci-dessus. Le cabinet médical transmet les informations concernant les patients exclusivement par des voies de communication sécurisées. Je suis d'accord pour que les questions administratives, telles que les reports de rendez-vous, transitent via des courriers électroniques non chiffrés.",
        fields: [
          { id: "data_consent_acknowledged", type: "checkbox", label: "I have read and understood the data processing consent above", labelFr: "J'ai lu et compris le consentement au traitement des données ci-dessus", required: true },
          { id: "signature", type: "signature", label: "Signature", labelFr: "Signature", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },

  // ===== FICHE PATIENT - ENGLISH =====
  {
    id: "fiche-patient-en",
    name: "Patient Information Form",
    nameFr: "Fiche patient",
    description: "Patient registration and consent form",
    descriptionFr: "Formulaire d'inscription et de consentement du patient",
    language: "en",
    category: "questionnaire",
    originalFile: "fiche-patient-en.pdf",
    sections: [
      {
        id: "personal-info",
        title: "Your Information",
        fields: [
          { id: "last_name", type: "text", label: "Last Name", required: true },
          { id: "first_name", type: "text", label: "First Name", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", required: true },
          { id: "phone", type: "phone", label: "Phone", required: true },
          { id: "email", type: "email", label: "Email", required: true },
          { id: "address_line1", type: "text", label: "Address", required: true },
          { id: "address_line2", type: "text", label: "Address Line 2" },
          { id: "city", type: "text", label: "City", required: true },
          { id: "postal_code", type: "text", label: "Postal Code", required: true },
        ],
      },
      {
        id: "communication-preferences",
        title: "Communication Preferences",
        fields: [
          { 
            id: "email_offers_consent", 
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
            ],
            helpText: "Photos are published anonymously and blurred. Your name is not revealed. You have the right to revoke this authorization at any time."
          },
        ],
      },
      {
        id: "interests",
        title: "Areas of Interest",
        fields: [
          { 
            id: "specialty_interest", 
            type: "select", 
            label: "Which specialty are you interested in?",
            options: [
              { value: "plastic_surgery", label: "Plastic Surgery" },
              { value: "dermatology", label: "Dermatology" },
              { value: "injections", label: "Injections" },
              { value: "lasers", label: "Lasers" },
              { value: "signature_care", label: "Maison Tóā Signature Care" },
              { value: "hair", label: "Hair" }
            ]
          },
          { 
            id: "referral_source", 
            type: "select", 
            label: "How did you hear about us?",
            options: [
              { value: "recommendation", label: "Recommendation" },
              { value: "influencer", label: "Influencer" },
              { value: "instagram", label: "Instagram" },
              { value: "facebook", label: "Facebook" },
              { value: "google", label: "Google Search" }
            ]
          },
        ],
      },
      {
        id: "data-consent",
        title: "Data Processing Consent",
        description: "By signing, I confirm that I consent to the processing of my data, to access by the physician, and to their transmission to third parties in accordance with the information intended for patients. I am aware of the potential risks related to the exchange of sensitive personal data (possible consultation by unauthorized third parties in case of use of insecure communication tools) as well as my rights. I consent to mutual contact between my physician and myself using the contact information provided above. The medical office transmits patient information exclusively through secure communication channels. I agree that administrative questions, such as appointment rescheduling, may be transmitted via unencrypted emails.",
        fields: [
          { id: "data_consent_acknowledged", type: "checkbox", label: "I have read and understood the data processing consent above", required: true },
          { id: "signature", type: "signature", label: "Signature", required: true },
          { id: "signature_date", type: "date", label: "Date", required: true },
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
