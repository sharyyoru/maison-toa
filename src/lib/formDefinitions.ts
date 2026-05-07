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
