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
  category: "consent" | "questionnaire" | "instructions";
  originalFile: string;
  sections: FormSection[];
};

export const FORM_DEFINITIONS: FormDefinition[] = [
  // ===== ANESTHESIA QUESTIONNAIRE - FRENCH =====
  {
    id: "questionnaire-anesthesie-fr",
    name: "Anesthesia Questionnaire",
    nameFr: "Questionnaire d'anesthésie",
    description: "Pre-anesthesia medical questionnaire",
    descriptionFr: "Questionnaire médical pré-anesthésie",
    language: "fr",
    category: "questionnaire",
    originalFile: "FR - Questionnaire d'anesthésie.pdf",
    sections: [
      {
        id: "personal-info",
        title: "Personal Information",
        titleFr: "Informations personnelles",
        fields: [
          { id: "full_name", type: "text", label: "Full Name", labelFr: "Nom complet", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "weight", type: "number", label: "Weight (kg)", labelFr: "Poids (kg)", required: true },
          { id: "height", type: "number", label: "Height (cm)", labelFr: "Taille (cm)", required: true },
        ],
      },
      {
        id: "medical-history",
        title: "Medical History",
        titleFr: "Antécédents médicaux",
        fields: [
          { id: "heart_disease", type: "checkbox", label: "Heart disease", labelFr: "Maladie cardiaque" },
          { id: "hypertension", type: "checkbox", label: "High blood pressure", labelFr: "Hypertension artérielle" },
          { id: "diabetes", type: "checkbox", label: "Diabetes", labelFr: "Diabète" },
          { id: "asthma", type: "checkbox", label: "Asthma / Respiratory problems", labelFr: "Asthme / Problèmes respiratoires" },
          { id: "allergies", type: "checkbox", label: "Known allergies", labelFr: "Allergies connues" },
          { id: "allergies_details", type: "textarea", label: "If yes, please specify", labelFr: "Si oui, veuillez préciser", placeholder: "List any allergies..." },
          { id: "bleeding_disorders", type: "checkbox", label: "Bleeding disorders", labelFr: "Troubles de la coagulation" },
          { id: "thyroid_problems", type: "checkbox", label: "Thyroid problems", labelFr: "Problèmes de thyroïde" },
          { id: "kidney_disease", type: "checkbox", label: "Kidney disease", labelFr: "Maladie rénale" },
          { id: "liver_disease", type: "checkbox", label: "Liver disease", labelFr: "Maladie hépatique" },
          { id: "neurological_disorders", type: "checkbox", label: "Neurological disorders", labelFr: "Troubles neurologiques" },
          { id: "previous_surgeries", type: "textarea", label: "Previous surgeries", labelFr: "Chirurgies antérieures", placeholder: "List previous surgeries with dates..." },
        ],
      },
      {
        id: "medications",
        title: "Current Medications",
        titleFr: "Médicaments actuels",
        fields: [
          { id: "taking_medications", type: "radio", label: "Are you currently taking any medications?", labelFr: "Prenez-vous actuellement des médicaments?", options: [{ value: "yes", label: "Yes", labelFr: "Oui" }, { value: "no", label: "No", labelFr: "Non" }] },
          { id: "medications_list", type: "textarea", label: "List all medications", labelFr: "Liste des médicaments", placeholder: "Include name, dosage, and frequency..." },
          { id: "blood_thinners", type: "checkbox", label: "Blood thinners (Aspirin, Warfarin, etc.)", labelFr: "Anticoagulants (Aspirine, Warfarine, etc.)" },
          { id: "supplements", type: "textarea", label: "Vitamins/Supplements", labelFr: "Vitamines/Compléments", placeholder: "List any supplements..." },
        ],
      },
      {
        id: "lifestyle",
        title: "Lifestyle",
        titleFr: "Mode de vie",
        fields: [
          { id: "smoker", type: "radio", label: "Do you smoke?", labelFr: "Fumez-vous?", options: [{ value: "yes", label: "Yes", labelFr: "Oui" }, { value: "no", label: "No", labelFr: "Non" }, { value: "former", label: "Former smoker", labelFr: "Ancien fumeur" }] },
          { id: "smoking_details", type: "text", label: "If yes, how many per day?", labelFr: "Si oui, combien par jour?" },
          { id: "alcohol", type: "radio", label: "Do you consume alcohol?", labelFr: "Consommez-vous de l'alcool?", options: [{ value: "no", label: "No", labelFr: "Non" }, { value: "occasionally", label: "Occasionally", labelFr: "Occasionnellement" }, { value: "regularly", label: "Regularly", labelFr: "Régulièrement" }] },
          { id: "recreational_drugs", type: "radio", label: "Do you use recreational drugs?", labelFr: "Utilisez-vous des drogues récréatives?", options: [{ value: "yes", label: "Yes", labelFr: "Oui" }, { value: "no", label: "No", labelFr: "Non" }] },
        ],
      },
      {
        id: "anesthesia-history",
        title: "Anesthesia History",
        titleFr: "Antécédents d'anesthésie",
        fields: [
          { id: "previous_anesthesia", type: "radio", label: "Have you had anesthesia before?", labelFr: "Avez-vous déjà eu une anesthésie?", options: [{ value: "yes", label: "Yes", labelFr: "Oui" }, { value: "no", label: "No", labelFr: "Non" }] },
          { id: "anesthesia_complications", type: "checkbox", label: "Any complications with previous anesthesia?", labelFr: "Complications lors d'anesthésies précédentes?" },
          { id: "anesthesia_complications_details", type: "textarea", label: "If yes, please describe", labelFr: "Si oui, veuillez décrire" },
          { id: "family_anesthesia_problems", type: "checkbox", label: "Family history of anesthesia problems", labelFr: "Antécédents familiaux de problèmes d'anesthésie" },
          { id: "malignant_hyperthermia", type: "checkbox", label: "Personal or family history of malignant hyperthermia", labelFr: "Antécédents personnels ou familiaux d'hyperthermie maligne" },
        ],
      },
      {
        id: "consent",
        title: "Acknowledgment",
        titleFr: "Reconnaissance",
        fields: [
          { id: "information_accurate", type: "checkbox", label: "I confirm that all information provided is accurate", labelFr: "Je confirme que toutes les informations fournies sont exactes", required: true },
          { id: "signature", type: "signature", label: "Signature", labelFr: "Signature", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },

  // ===== ANESTHESIA QUESTIONNAIRE - ENGLISH =====
  {
    id: "questionnaire-anesthesie-en",
    name: "Anesthesia Questionnaire",
    nameFr: "Questionnaire d'anesthésie",
    description: "Pre-anesthesia medical questionnaire",
    descriptionFr: "Questionnaire médical pré-anesthésie",
    language: "en",
    category: "questionnaire",
    originalFile: "EN - Questionnaire d'anesthésie  (1).pdf",
    sections: [
      {
        id: "personal-info",
        title: "Personal Information",
        fields: [
          { id: "full_name", type: "text", label: "Full Name", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", required: true },
          { id: "weight", type: "number", label: "Weight (kg)", required: true },
          { id: "height", type: "number", label: "Height (cm)", required: true },
        ],
      },
      {
        id: "medical-history",
        title: "Medical History",
        fields: [
          { id: "heart_disease", type: "checkbox", label: "Heart disease" },
          { id: "hypertension", type: "checkbox", label: "High blood pressure" },
          { id: "diabetes", type: "checkbox", label: "Diabetes" },
          { id: "asthma", type: "checkbox", label: "Asthma / Respiratory problems" },
          { id: "allergies", type: "checkbox", label: "Known allergies" },
          { id: "allergies_details", type: "textarea", label: "If yes, please specify", placeholder: "List any allergies..." },
          { id: "bleeding_disorders", type: "checkbox", label: "Bleeding disorders" },
          { id: "thyroid_problems", type: "checkbox", label: "Thyroid problems" },
          { id: "kidney_disease", type: "checkbox", label: "Kidney disease" },
          { id: "liver_disease", type: "checkbox", label: "Liver disease" },
          { id: "neurological_disorders", type: "checkbox", label: "Neurological disorders" },
          { id: "previous_surgeries", type: "textarea", label: "Previous surgeries", placeholder: "List previous surgeries with dates..." },
        ],
      },
      {
        id: "medications",
        title: "Current Medications",
        fields: [
          { id: "taking_medications", type: "radio", label: "Are you currently taking any medications?", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
          { id: "medications_list", type: "textarea", label: "List all medications", placeholder: "Include name, dosage, and frequency..." },
          { id: "blood_thinners", type: "checkbox", label: "Blood thinners (Aspirin, Warfarin, etc.)" },
          { id: "supplements", type: "textarea", label: "Vitamins/Supplements", placeholder: "List any supplements..." },
        ],
      },
      {
        id: "lifestyle",
        title: "Lifestyle",
        fields: [
          { id: "smoker", type: "radio", label: "Do you smoke?", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "former", label: "Former smoker" }] },
          { id: "smoking_details", type: "text", label: "If yes, how many per day?" },
          { id: "alcohol", type: "radio", label: "Do you consume alcohol?", options: [{ value: "no", label: "No" }, { value: "occasionally", label: "Occasionally" }, { value: "regularly", label: "Regularly" }] },
          { id: "recreational_drugs", type: "radio", label: "Do you use recreational drugs?", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
        ],
      },
      {
        id: "anesthesia-history",
        title: "Anesthesia History",
        fields: [
          { id: "previous_anesthesia", type: "radio", label: "Have you had anesthesia before?", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
          { id: "anesthesia_complications", type: "checkbox", label: "Any complications with previous anesthesia?" },
          { id: "anesthesia_complications_details", type: "textarea", label: "If yes, please describe" },
          { id: "family_anesthesia_problems", type: "checkbox", label: "Family history of anesthesia problems" },
          { id: "malignant_hyperthermia", type: "checkbox", label: "Personal or family history of malignant hyperthermia" },
        ],
      },
      {
        id: "consent",
        title: "Acknowledgment",
        fields: [
          { id: "information_accurate", type: "checkbox", label: "I confirm that all information provided is accurate", required: true },
          { id: "signature", type: "signature", label: "Signature", required: true },
          { id: "signature_date", type: "date", label: "Date", required: true },
        ],
      },
    ],
  },

  // ===== ANESTHESIA CONSENT - FRENCH =====
  {
    id: "consentement-anesthesie-fr",
    name: "Anesthesia Consent",
    nameFr: "Consentement anesthésie",
    description: "Consent form for anesthesia procedures",
    descriptionFr: "Formulaire de consentement pour les procédures d'anesthésie",
    language: "fr",
    category: "consent",
    originalFile: "Consentement anesthésie - Aesthetics (2).pdf",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations du patient",
        fields: [
          { id: "full_name", type: "text", label: "Full Name", labelFr: "Nom complet", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "procedure_date", type: "date", label: "Planned Procedure Date", labelFr: "Date de l'intervention prévue", required: true },
        ],
      },
      {
        id: "anesthesia-type",
        title: "Type of Anesthesia",
        titleFr: "Type d'anesthésie",
        fields: [
          { id: "anesthesia_type", type: "select", label: "Type of anesthesia planned", labelFr: "Type d'anesthésie prévue", required: true, options: [
            { value: "general", label: "General anesthesia", labelFr: "Anesthésie générale" },
            { value: "local", label: "Local anesthesia", labelFr: "Anesthésie locale" },
            { value: "sedation", label: "Sedation", labelFr: "Sédation" },
            { value: "regional", label: "Regional anesthesia", labelFr: "Anesthésie régionale" },
          ]},
        ],
      },
      {
        id: "risks-acknowledgment",
        title: "Risk Acknowledgment",
        titleFr: "Reconnaissance des risques",
        description: "I acknowledge that I have been informed about the risks associated with anesthesia.",
        descriptionFr: "Je reconnais avoir été informé(e) des risques associés à l'anesthésie.",
        fields: [
          { id: "understood_risks", type: "checkbox", label: "I understand that anesthesia carries certain risks including but not limited to: allergic reactions, breathing difficulties, cardiovascular complications, and in rare cases, death.", labelFr: "Je comprends que l'anesthésie comporte certains risques, notamment: réactions allergiques, difficultés respiratoires, complications cardiovasculaires et, dans de rares cas, décès.", required: true },
          { id: "questions_answered", type: "checkbox", label: "I have had the opportunity to ask questions and they have been answered to my satisfaction", labelFr: "J'ai eu l'occasion de poser des questions et elles ont été répondues à ma satisfaction", required: true },
          { id: "fasting_instructions", type: "checkbox", label: "I understand and will follow the fasting instructions (no food or drink for the specified time before surgery)", labelFr: "Je comprends et suivrai les instructions de jeûne (pas de nourriture ni de boisson pendant le temps spécifié avant la chirurgie)", required: true },
        ],
      },
      {
        id: "consent",
        title: "Consent",
        titleFr: "Consentement",
        fields: [
          { id: "consent_given", type: "checkbox", label: "I consent to receive anesthesia as described above", labelFr: "Je consens à recevoir l'anesthésie telle que décrite ci-dessus", required: true },
          { id: "signature", type: "signature", label: "Patient Signature", labelFr: "Signature du patient", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },

  // ===== ANESTHESIA CONSENT - ENGLISH =====
  {
    id: "consentement-anesthesie-en",
    name: "Anesthesia Consent",
    nameFr: "Consentement anesthésie",
    description: "Consent form for anesthesia procedures",
    descriptionFr: "Formulaire de consentement pour les procédures d'anesthésie",
    language: "en",
    category: "consent",
    originalFile: "EN - Consentement anesthésie (1).pdf",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        fields: [
          { id: "full_name", type: "text", label: "Full Name", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", required: true },
          { id: "procedure_date", type: "date", label: "Planned Procedure Date", required: true },
        ],
      },
      {
        id: "anesthesia-type",
        title: "Type of Anesthesia",
        fields: [
          { id: "anesthesia_type", type: "select", label: "Type of anesthesia planned", required: true, options: [
            { value: "general", label: "General anesthesia" },
            { value: "local", label: "Local anesthesia" },
            { value: "sedation", label: "Sedation" },
            { value: "regional", label: "Regional anesthesia" },
          ]},
        ],
      },
      {
        id: "risks-acknowledgment",
        title: "Risk Acknowledgment",
        description: "I acknowledge that I have been informed about the risks associated with anesthesia.",
        fields: [
          { id: "understood_risks", type: "checkbox", label: "I understand that anesthesia carries certain risks including but not limited to: allergic reactions, breathing difficulties, cardiovascular complications, and in rare cases, death.", required: true },
          { id: "questions_answered", type: "checkbox", label: "I have had the opportunity to ask questions and they have been answered to my satisfaction", required: true },
          { id: "fasting_instructions", type: "checkbox", label: "I understand and will follow the fasting instructions (no food or drink for the specified time before surgery)", required: true },
        ],
      },
      {
        id: "consent",
        title: "Consent",
        fields: [
          { id: "consent_given", type: "checkbox", label: "I consent to receive anesthesia as described above", required: true },
          { id: "signature", type: "signature", label: "Patient Signature", required: true },
          { id: "signature_date", type: "date", label: "Date", required: true },
        ],
      },
    ],
  },

  // ===== INFORMED CONSENT - BREAST AUGMENTATION (FRENCH) =====
  {
    id: "consentement-augmentation-mammaire-fr",
    name: "Informed Consent - Breast Augmentation",
    nameFr: "Consentement éclairé - Augmentation mammaire",
    description: "Informed consent form for breast augmentation surgery",
    descriptionFr: "Formulaire de consentement éclairé pour chirurgie d'augmentation mammaire",
    language: "fr",
    category: "consent",
    originalFile: "Annexe AM FR.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations du patient",
        fields: [
          { id: "full_name", type: "text", label: "Full Name", labelFr: "Nom complet", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "procedure_date", type: "date", label: "Planned Surgery Date", labelFr: "Date de chirurgie prévue", required: true },
        ],
      },
      {
        id: "procedure-details",
        title: "Procedure Details",
        titleFr: "Détails de l'intervention",
        fields: [
          { id: "implant_type", type: "select", label: "Implant Type", labelFr: "Type d'implant", options: [
            { value: "silicone", label: "Silicone", labelFr: "Silicone" },
            { value: "saline", label: "Saline", labelFr: "Sérum physiologique" },
          ]},
          { id: "implant_placement", type: "select", label: "Implant Placement", labelFr: "Placement de l'implant", options: [
            { value: "submuscular", label: "Under the muscle", labelFr: "Sous le muscle" },
            { value: "subglandular", label: "Over the muscle", labelFr: "Sur le muscle" },
            { value: "dual_plane", label: "Dual plane", labelFr: "Double plan" },
          ]},
          { id: "incision_location", type: "select", label: "Incision Location", labelFr: "Emplacement de l'incision", options: [
            { value: "inframammary", label: "Under the breast fold", labelFr: "Sous le pli mammaire" },
            { value: "periareolar", label: "Around the areola", labelFr: "Autour de l'aréole" },
            { value: "axillary", label: "Under the arm", labelFr: "Sous le bras" },
          ]},
        ],
      },
      {
        id: "risks",
        title: "Risks and Complications",
        titleFr: "Risques et complications",
        description: "I acknowledge understanding the following potential risks:",
        descriptionFr: "Je reconnais comprendre les risques potentiels suivants:",
        fields: [
          { id: "risk_infection", type: "checkbox", label: "Infection", labelFr: "Infection", required: true },
          { id: "risk_bleeding", type: "checkbox", label: "Bleeding and hematoma", labelFr: "Saignement et hématome", required: true },
          { id: "risk_capsular", type: "checkbox", label: "Capsular contracture", labelFr: "Contracture capsulaire", required: true },
          { id: "risk_sensation", type: "checkbox", label: "Changes in nipple or breast sensation", labelFr: "Changements de sensation du mamelon ou du sein", required: true },
          { id: "risk_asymmetry", type: "checkbox", label: "Asymmetry", labelFr: "Asymétrie", required: true },
          { id: "risk_rupture", type: "checkbox", label: "Implant rupture or leak", labelFr: "Rupture ou fuite de l'implant", required: true },
          { id: "risk_revision", type: "checkbox", label: "Need for revision surgery", labelFr: "Nécessité d'une chirurgie de révision", required: true },
        ],
      },
      {
        id: "consent",
        title: "Consent",
        titleFr: "Consentement",
        fields: [
          { id: "procedure_explained", type: "checkbox", label: "The procedure has been explained to me in detail", labelFr: "L'intervention m'a été expliquée en détail", required: true },
          { id: "questions_answered", type: "checkbox", label: "I have had the opportunity to ask questions", labelFr: "J'ai eu l'occasion de poser des questions", required: true },
          { id: "consent_given", type: "checkbox", label: "I consent to undergo breast augmentation surgery", labelFr: "Je consens à subir une chirurgie d'augmentation mammaire", required: true },
          { id: "signature", type: "signature", label: "Patient Signature", labelFr: "Signature du patient", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },

  // ===== INFORMED CONSENT - BREAST AUGMENTATION (ENGLISH) =====
  {
    id: "consentement-augmentation-mammaire-en",
    name: "Informed Consent - Breast Augmentation",
    nameFr: "Consentement éclairé - Augmentation mammaire",
    description: "Informed consent form for breast augmentation surgery",
    descriptionFr: "Formulaire de consentement éclairé pour chirurgie d'augmentation mammaire",
    language: "en",
    category: "consent",
    originalFile: "Informed breast augmentation ENG.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        fields: [
          { id: "full_name", type: "text", label: "Full Name", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", required: true },
          { id: "procedure_date", type: "date", label: "Planned Surgery Date", required: true },
        ],
      },
      {
        id: "procedure-details",
        title: "Procedure Details",
        fields: [
          { id: "implant_type", type: "select", label: "Implant Type", options: [
            { value: "silicone", label: "Silicone" },
            { value: "saline", label: "Saline" },
          ]},
          { id: "implant_placement", type: "select", label: "Implant Placement", options: [
            { value: "submuscular", label: "Under the muscle" },
            { value: "subglandular", label: "Over the muscle" },
            { value: "dual_plane", label: "Dual plane" },
          ]},
          { id: "incision_location", type: "select", label: "Incision Location", options: [
            { value: "inframammary", label: "Under the breast fold" },
            { value: "periareolar", label: "Around the areola" },
            { value: "axillary", label: "Under the arm" },
          ]},
        ],
      },
      {
        id: "risks",
        title: "Risks and Complications",
        description: "I acknowledge understanding the following potential risks:",
        fields: [
          { id: "risk_infection", type: "checkbox", label: "Infection", required: true },
          { id: "risk_bleeding", type: "checkbox", label: "Bleeding and hematoma", required: true },
          { id: "risk_capsular", type: "checkbox", label: "Capsular contracture", required: true },
          { id: "risk_sensation", type: "checkbox", label: "Changes in nipple or breast sensation", required: true },
          { id: "risk_asymmetry", type: "checkbox", label: "Asymmetry", required: true },
          { id: "risk_rupture", type: "checkbox", label: "Implant rupture or leak", required: true },
          { id: "risk_revision", type: "checkbox", label: "Need for revision surgery", required: true },
        ],
      },
      {
        id: "consent",
        title: "Consent",
        fields: [
          { id: "procedure_explained", type: "checkbox", label: "The procedure has been explained to me in detail", required: true },
          { id: "questions_answered", type: "checkbox", label: "I have had the opportunity to ask questions", required: true },
          { id: "consent_given", type: "checkbox", label: "I consent to undergo breast augmentation surgery", required: true },
          { id: "signature", type: "signature", label: "Patient Signature", required: true },
          { id: "signature_date", type: "date", label: "Date", required: true },
        ],
      },
    ],
  },

  // ===== INFORMED CONSENT - BREAST LIFT/REDUCTION (FRENCH) =====
  {
    id: "consentement-lift-reduction-fr",
    name: "Informed Consent - Breast Lift & Reduction",
    nameFr: "Consentement éclairé - Lifting et réduction mammaire",
    description: "Informed consent form for breast lift and reduction surgery",
    descriptionFr: "Formulaire de consentement éclairé pour chirurgie de lifting et réduction mammaire",
    language: "fr",
    category: "consent",
    originalFile: "Annexe Lift et Reduction FR copie.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations du patient",
        fields: [
          { id: "full_name", type: "text", label: "Full Name", labelFr: "Nom complet", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "procedure_date", type: "date", label: "Planned Surgery Date", labelFr: "Date de chirurgie prévue", required: true },
        ],
      },
      {
        id: "procedure-type",
        title: "Procedure Type",
        titleFr: "Type d'intervention",
        fields: [
          { id: "procedure_type", type: "select", label: "Type of procedure", labelFr: "Type d'intervention", required: true, options: [
            { value: "lift", label: "Breast lift (mastopexy)", labelFr: "Lifting mammaire (mastopexie)" },
            { value: "reduction", label: "Breast reduction", labelFr: "Réduction mammaire" },
            { value: "both", label: "Lift with reduction", labelFr: "Lifting avec réduction" },
          ]},
        ],
      },
      {
        id: "risks",
        title: "Risks and Complications",
        titleFr: "Risques et complications",
        fields: [
          { id: "risk_scarring", type: "checkbox", label: "Permanent scarring", labelFr: "Cicatrices permanentes", required: true },
          { id: "risk_sensation", type: "checkbox", label: "Changes in nipple sensation", labelFr: "Changements de sensation du mamelon", required: true },
          { id: "risk_breastfeeding", type: "checkbox", label: "Potential impact on breastfeeding ability", labelFr: "Impact potentiel sur la capacité d'allaitement", required: true },
          { id: "risk_asymmetry", type: "checkbox", label: "Asymmetry", labelFr: "Asymétrie", required: true },
          { id: "risk_necrosis", type: "checkbox", label: "Tissue necrosis (rare)", labelFr: "Nécrose tissulaire (rare)", required: true },
        ],
      },
      {
        id: "consent",
        title: "Consent",
        titleFr: "Consentement",
        fields: [
          { id: "procedure_explained", type: "checkbox", label: "The procedure has been explained to me in detail", labelFr: "L'intervention m'a été expliquée en détail", required: true },
          { id: "consent_given", type: "checkbox", label: "I consent to undergo this surgery", labelFr: "Je consens à subir cette chirurgie", required: true },
          { id: "signature", type: "signature", label: "Patient Signature", labelFr: "Signature du patient", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },

  // ===== GENERAL INFORMED CONSENT (FRENCH) =====
  {
    id: "consentement-eclaire-fr",
    name: "General Informed Consent",
    nameFr: "Consentement éclairé général",
    description: "General informed consent form for surgical procedures",
    descriptionFr: "Formulaire de consentement éclairé général pour interventions chirurgicales",
    language: "fr",
    category: "consent",
    originalFile: "CONSENTEMENT ÉCLAIRÉ.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations du patient",
        fields: [
          { id: "full_name", type: "text", label: "Full Name", labelFr: "Nom complet", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "procedure_name", type: "text", label: "Planned Procedure", labelFr: "Intervention prévue", required: true },
          { id: "procedure_date", type: "date", label: "Planned Date", labelFr: "Date prévue", required: true },
        ],
      },
      {
        id: "acknowledgments",
        title: "Acknowledgments",
        titleFr: "Reconnaissances",
        fields: [
          { id: "procedure_explained", type: "checkbox", label: "The nature and purpose of the procedure has been explained to me", labelFr: "La nature et le but de l'intervention m'ont été expliqués", required: true },
          { id: "risks_explained", type: "checkbox", label: "The risks, benefits, and alternatives have been explained to me", labelFr: "Les risques, avantages et alternatives m'ont été expliqués", required: true },
          { id: "questions_answered", type: "checkbox", label: "I have had the opportunity to ask questions and they have been answered satisfactorily", labelFr: "J'ai eu l'occasion de poser des questions et elles ont été répondues de manière satisfaisante", required: true },
          { id: "voluntary_consent", type: "checkbox", label: "I give my consent voluntarily", labelFr: "Je donne mon consentement volontairement", required: true },
        ],
      },
      {
        id: "consent",
        title: "Consent",
        titleFr: "Consentement",
        fields: [
          { id: "consent_given", type: "checkbox", label: "I consent to undergo the proposed procedure", labelFr: "Je consens à subir l'intervention proposée", required: true },
          { id: "signature", type: "signature", label: "Patient Signature", labelFr: "Signature du patient", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },

  // ===== PRE-OPERATIVE INSTRUCTIONS (ENGLISH) =====
  {
    id: "preoperative-instructions-en",
    name: "Pre-operative Instructions",
    nameFr: "Instructions préopératoires",
    description: "Pre-operative instructions acknowledgment form",
    descriptionFr: "Formulaire de reconnaissance des instructions préopératoires",
    language: "en",
    category: "instructions",
    originalFile: "Preoperative instruction OP ENG.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        fields: [
          { id: "full_name", type: "text", label: "Full Name", required: true },
          { id: "procedure_date", type: "date", label: "Surgery Date", required: true },
        ],
      },
      {
        id: "pre-op-checklist",
        title: "Pre-operative Checklist",
        description: "Please confirm you have been informed of and will follow these instructions:",
        fields: [
          { id: "fasting", type: "checkbox", label: "No food or drink after midnight before surgery", required: true },
          { id: "medications", type: "checkbox", label: "Stop blood thinners as instructed (Aspirin, Ibuprofen, Vitamin E, etc.)", required: true },
          { id: "smoking", type: "checkbox", label: "Stop smoking at least 2 weeks before surgery", required: true },
          { id: "alcohol", type: "checkbox", label: "Avoid alcohol 48 hours before surgery", required: true },
          { id: "makeup", type: "checkbox", label: "Remove all makeup, nail polish, and jewelry before surgery", required: true },
          { id: "clothing", type: "checkbox", label: "Wear loose, comfortable clothing on the day of surgery", required: true },
          { id: "transportation", type: "checkbox", label: "Arrange for someone to drive you home after surgery", required: true },
          { id: "caregiver", type: "checkbox", label: "Arrange for someone to stay with you for 24 hours after surgery", required: true },
        ],
      },
      {
        id: "contact-info",
        title: "Emergency Contact",
        fields: [
          { id: "emergency_contact_name", type: "text", label: "Emergency Contact Name", required: true },
          { id: "emergency_contact_phone", type: "phone", label: "Emergency Contact Phone", required: true },
          { id: "emergency_contact_relation", type: "text", label: "Relationship", required: true },
        ],
      },
      {
        id: "acknowledgment",
        title: "Acknowledgment",
        fields: [
          { id: "instructions_understood", type: "checkbox", label: "I have read and understood all pre-operative instructions", required: true },
          { id: "signature", type: "signature", label: "Patient Signature", required: true },
          { id: "signature_date", type: "date", label: "Date", required: true },
        ],
      },
    ],
  },

  // ===== PRE AND POST-OPERATIVE INSTRUCTIONS (FRENCH) =====
  {
    id: "consignes-pre-post-op-fr",
    name: "Pre and Post-operative Instructions",
    nameFr: "Consignes pré et post-opératoires",
    description: "Pre and post-operative instructions acknowledgment form",
    descriptionFr: "Formulaire de reconnaissance des consignes pré et post-opératoires",
    language: "fr",
    category: "instructions",
    originalFile: "consignes pre et post op FR.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations du patient",
        fields: [
          { id: "full_name", type: "text", label: "Full Name", labelFr: "Nom complet", required: true },
          { id: "procedure_date", type: "date", label: "Surgery Date", labelFr: "Date de chirurgie", required: true },
        ],
      },
      {
        id: "pre-op-checklist",
        title: "Pre-operative Instructions",
        titleFr: "Consignes préopératoires",
        fields: [
          { id: "fasting", type: "checkbox", label: "No food or drink after midnight", labelFr: "Pas de nourriture ni de boisson après minuit", required: true },
          { id: "medications", type: "checkbox", label: "Stop blood thinners as instructed", labelFr: "Arrêter les anticoagulants comme indiqué", required: true },
          { id: "smoking", type: "checkbox", label: "Stop smoking 2 weeks before surgery", labelFr: "Arrêter de fumer 2 semaines avant la chirurgie", required: true },
          { id: "alcohol", type: "checkbox", label: "No alcohol 48 hours before surgery", labelFr: "Pas d'alcool 48 heures avant la chirurgie", required: true },
        ],
      },
      {
        id: "post-op-checklist",
        title: "Post-operative Instructions",
        titleFr: "Consignes postopératoires",
        fields: [
          { id: "rest", type: "checkbox", label: "Rest for the first 48 hours", labelFr: "Repos pendant les premières 48 heures", required: true },
          { id: "medication_compliance", type: "checkbox", label: "Take prescribed medications as directed", labelFr: "Prendre les médicaments prescrits comme indiqué", required: true },
          { id: "compression_garment", type: "checkbox", label: "Wear compression garment as instructed", labelFr: "Porter le vêtement de compression comme indiqué", required: true },
          { id: "follow_up", type: "checkbox", label: "Attend all follow-up appointments", labelFr: "Assister à tous les rendez-vous de suivi", required: true },
          { id: "activity_restrictions", type: "checkbox", label: "No strenuous activity for 4-6 weeks", labelFr: "Pas d'activité intense pendant 4-6 semaines", required: true },
        ],
      },
      {
        id: "acknowledgment",
        title: "Acknowledgment",
        titleFr: "Reconnaissance",
        fields: [
          { id: "instructions_understood", type: "checkbox", label: "I have read and understood all instructions", labelFr: "J'ai lu et compris toutes les consignes", required: true },
          { id: "signature", type: "signature", label: "Patient Signature", labelFr: "Signature du patient", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
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

export function getFormsByCategory(category: "consent" | "questionnaire" | "instructions"): FormDefinition[] {
  return FORM_DEFINITIONS.filter((form) => form.category === category);
}

export function getAllForms(): FormDefinition[] {
  return FORM_DEFINITIONS;
}
