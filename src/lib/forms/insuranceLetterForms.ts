// Insurance Letter Form Definitions
import { FormDefinition } from "../formDefinitions";

export const INSURANCE_LETTER_FORMS: FormDefinition[] = [
  // ===== Lettre Assurance Générique =====
  {
    id: "lettre-assurance-generique",
    name: "Insurance Request Letter - Generic",
    nameFr: "Lettre de demande d'assurance - Générique",
    description: "Generic insurance coverage request letter",
    descriptionFr: "Lettre de demande de prise en charge assurance générique",
    language: "fr",
    category: "insurance-letter",
    originalFile: "Modèle lettre assurance.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations Patient",
        fields: [
          { id: "patient_name", type: "text", label: "Patient Name", labelFr: "Nom du patient", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "avs_number", type: "text", label: "AVS Number", labelFr: "Numéro AVS", required: true },
          { id: "patient_address", type: "textarea", label: "Patient Address", labelFr: "Adresse du patient", required: true },
        ],
      },
      {
        id: "insurance-info",
        title: "Insurance Information",
        titleFr: "Informations Assurance",
        fields: [
          { id: "insurance_name", type: "text", label: "Insurance Company", labelFr: "Nom de l'assurance", required: true },
          { id: "insurance_address", type: "textarea", label: "Insurance Address", labelFr: "Adresse de l'assurance", required: true },
          { id: "policy_number", type: "text", label: "Policy Number", labelFr: "Numéro de police" },
        ],
      },
      {
        id: "medical-info",
        title: "Medical Information",
        titleFr: "Informations Médicales",
        fields: [
          { id: "diagnosis", type: "textarea", label: "Diagnosis", labelFr: "Diagnostic", required: true },
          { id: "proposed_treatment", type: "textarea", label: "Proposed Treatment", labelFr: "Traitement proposé", required: true },
          { id: "medical_necessity", type: "textarea", label: "Medical Necessity Justification", labelFr: "Justification de la nécessité médicale", required: true },
          { id: "estimated_cost", type: "text", label: "Estimated Cost (CHF)", labelFr: "Coût estimé (CHF)" },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "doctor_signature", type: "signature", label: "Doctor Signature", labelFr: "Signature du médecin", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },

  // ===== Assurance Réduction Mammaire =====
  {
    id: "assurance-reduction-mammaire",
    name: "Insurance Request - Breast Reduction",
    nameFr: "Demande d'assurance - Réduction mammaire",
    description: "Insurance coverage request for breast reduction",
    descriptionFr: "Demande de prise en charge pour réduction mammaire",
    language: "fr",
    category: "insurance-letter",
    originalFile: "Assurance pour  Red Mam.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations Patient",
        fields: [
          { id: "patient_name", type: "text", label: "Patient Name", labelFr: "Nom du patient", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "avs_number", type: "text", label: "AVS Number", labelFr: "Numéro AVS", required: true },
          { id: "height", type: "text", label: "Height (cm)", labelFr: "Taille (cm)", required: true },
          { id: "weight", type: "text", label: "Weight (kg)", labelFr: "Poids (kg)", required: true },
          { id: "bmi", type: "text", label: "BMI", labelFr: "IMC" },
        ],
      },
      {
        id: "insurance-info",
        title: "Insurance Information",
        titleFr: "Informations Assurance",
        fields: [
          { id: "insurance_name", type: "text", label: "Insurance Company", labelFr: "Nom de l'assurance", required: true },
          { id: "insurance_address", type: "textarea", label: "Insurance Address", labelFr: "Adresse de l'assurance", required: true },
          { id: "policy_number", type: "text", label: "Policy Number", labelFr: "Numéro de police" },
        ],
      },
      {
        id: "medical-symptoms",
        title: "Symptoms",
        titleFr: "Symptômes",
        fields: [
          { id: "back_pain", type: "checkbox", label: "Back Pain", labelFr: "Douleurs dorsales" },
          { id: "neck_pain", type: "checkbox", label: "Neck Pain", labelFr: "Douleurs cervicales" },
          { id: "shoulder_pain", type: "checkbox", label: "Shoulder Pain", labelFr: "Douleurs aux épaules" },
          { id: "skin_irritation", type: "checkbox", label: "Skin Irritation/Intertrigo", labelFr: "Irritation cutanée/Intertrigo" },
          { id: "bra_strap_grooves", type: "checkbox", label: "Bra Strap Grooves", labelFr: "Marques des bretelles" },
          { id: "posture_problems", type: "checkbox", label: "Posture Problems", labelFr: "Problèmes de posture" },
          { id: "symptom_duration", type: "text", label: "Duration of Symptoms", labelFr: "Durée des symptômes" },
          { id: "conservative_treatments", type: "textarea", label: "Conservative Treatments Tried", labelFr: "Traitements conservateurs essayés" },
        ],
      },
      {
        id: "breast-measurements",
        title: "Breast Measurements",
        titleFr: "Mensurations mammaires",
        fields: [
          { id: "bra_size", type: "text", label: "Current Bra Size", labelFr: "Taille de soutien-gorge actuelle", required: true },
          { id: "sn_nipple_distance_left", type: "text", label: "SN-Nipple Distance Left (cm)", labelFr: "Distance SN-mamelon gauche (cm)" },
          { id: "sn_nipple_distance_right", type: "text", label: "SN-Nipple Distance Right (cm)", labelFr: "Distance SN-mamelon droit (cm)" },
          { id: "estimated_resection_left", type: "text", label: "Estimated Resection Left (g)", labelFr: "Résection estimée gauche (g)", required: true },
          { id: "estimated_resection_right", type: "text", label: "Estimated Resection Right (g)", labelFr: "Résection estimée droite (g)", required: true },
        ],
      },
      {
        id: "justification",
        title: "Medical Justification",
        titleFr: "Justification médicale",
        fields: [
          { id: "medical_necessity", type: "textarea", label: "Medical Necessity", labelFr: "Nécessité médicale", required: true },
          { id: "functional_impact", type: "textarea", label: "Functional Impact", labelFr: "Impact fonctionnel" },
          { id: "psychological_impact", type: "textarea", label: "Psychological Impact", labelFr: "Impact psychologique" },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "doctor_signature", type: "signature", label: "Doctor Signature", labelFr: "Signature du médecin", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },

  // ===== Demande Assurance Blépharoplastie =====
  {
    id: "assurance-blepharoplastie",
    name: "Insurance Request - Blepharoplasty",
    nameFr: "Demande d'assurance - Blépharoplastie",
    description: "Insurance coverage request for eyelid surgery",
    descriptionFr: "Demande de prise en charge pour blépharoplastie",
    language: "fr",
    category: "insurance-letter",
    originalFile: "demande de prise en charge blépharoplastie.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations Patient",
        fields: [
          { id: "patient_name", type: "text", label: "Patient Name", labelFr: "Nom du patient", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "avs_number", type: "text", label: "AVS Number", labelFr: "Numéro AVS", required: true },
        ],
      },
      {
        id: "insurance-info",
        title: "Insurance Information",
        titleFr: "Informations Assurance",
        fields: [
          { id: "insurance_name", type: "text", label: "Insurance Company", labelFr: "Nom de l'assurance", required: true },
          { id: "insurance_address", type: "textarea", label: "Insurance Address", labelFr: "Adresse de l'assurance", required: true },
          { id: "policy_number", type: "text", label: "Policy Number", labelFr: "Numéro de police" },
        ],
      },
      {
        id: "medical-findings",
        title: "Medical Findings",
        titleFr: "Constatations médicales",
        fields: [
          { id: "visual_field_impairment", type: "checkbox", label: "Visual Field Impairment", labelFr: "Altération du champ visuel" },
          { id: "dermatochalasis", type: "checkbox", label: "Dermatochalasis", labelFr: "Dermatochalasis" },
          { id: "ptosis", type: "checkbox", label: "Ptosis", labelFr: "Ptosis" },
          { id: "brow_ptosis", type: "checkbox", label: "Brow Ptosis", labelFr: "Ptosis sourcilier" },
          { id: "eye_irritation", type: "checkbox", label: "Eye Irritation", labelFr: "Irritation oculaire" },
          { id: "headaches", type: "checkbox", label: "Compensatory Headaches", labelFr: "Céphalées compensatoires" },
          { id: "clinical_description", type: "textarea", label: "Clinical Description", labelFr: "Description clinique", required: true },
        ],
      },
      {
        id: "visual-field-test",
        title: "Visual Field Test Results",
        titleFr: "Résultats du champ visuel",
        fields: [
          { id: "visual_field_test_date", type: "date", label: "Test Date", labelFr: "Date du test" },
          { id: "visual_field_reduction", type: "text", label: "Visual Field Reduction (%)", labelFr: "Réduction du champ visuel (%)" },
          { id: "mrd1_left", type: "text", label: "MRD1 Left (mm)", labelFr: "MRD1 gauche (mm)" },
          { id: "mrd1_right", type: "text", label: "MRD1 Right (mm)", labelFr: "MRD1 droit (mm)" },
          { id: "test_notes", type: "textarea", label: "Test Notes", labelFr: "Notes du test" },
        ],
      },
      {
        id: "justification",
        title: "Medical Justification",
        titleFr: "Justification médicale",
        fields: [
          { id: "medical_necessity", type: "textarea", label: "Medical Necessity", labelFr: "Nécessité médicale", required: true },
          { id: "functional_impact", type: "textarea", label: "Functional Impact", labelFr: "Impact fonctionnel", required: true },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "doctor_signature", type: "signature", label: "Doctor Signature", labelFr: "Signature du médecin", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },

  // ===== Demande Assurance Botox Hyperhidrose =====
  {
    id: "assurance-botox-hyperhidrose",
    name: "Insurance Request - Botox for Hyperhidrosis",
    nameFr: "Demande d'assurance - Botox pour hyperhidrose",
    description: "Insurance coverage request for Botox treatment of hyperhidrosis",
    descriptionFr: "Demande de prise en charge pour traitement Botox de l'hyperhidrose",
    language: "fr",
    category: "insurance-letter",
    originalFile: "demande Assurance botox pour  hyperhydrose.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations Patient",
        fields: [
          { id: "patient_name", type: "text", label: "Patient Name", labelFr: "Nom du patient", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "avs_number", type: "text", label: "AVS Number", labelFr: "Numéro AVS", required: true },
        ],
      },
      {
        id: "insurance-info",
        title: "Insurance Information",
        titleFr: "Informations Assurance",
        fields: [
          { id: "insurance_name", type: "text", label: "Insurance Company", labelFr: "Nom de l'assurance", required: true },
          { id: "insurance_address", type: "textarea", label: "Insurance Address", labelFr: "Adresse de l'assurance", required: true },
          { id: "policy_number", type: "text", label: "Policy Number", labelFr: "Numéro de police" },
        ],
      },
      {
        id: "clinical-info",
        title: "Clinical Information",
        titleFr: "Informations cliniques",
        fields: [
          { id: "hyperhidrosis_location", type: "select", label: "Location of Hyperhidrosis", labelFr: "Localisation de l'hyperhidrose", required: true,
            options: [
              { value: "axillary", label: "Axillary (Underarms)", labelFr: "Axillaire (Aisselles)" },
              { value: "palmar", label: "Palmar (Hands)", labelFr: "Palmaire (Mains)" },
              { value: "plantar", label: "Plantar (Feet)", labelFr: "Plantaire (Pieds)" },
              { value: "facial", label: "Facial", labelFr: "Facial" },
              { value: "multiple", label: "Multiple Locations", labelFr: "Localisations multiples" },
            ]
          },
          { id: "symptom_duration", type: "text", label: "Duration of Symptoms", labelFr: "Durée des symptômes", required: true },
          { id: "frequency", type: "text", label: "Frequency of Episodes", labelFr: "Fréquence des épisodes" },
          { id: "hdss_score", type: "select", label: "HDSS Score", labelFr: "Score HDSS",
            options: [
              { value: "1", label: "1 - Never noticeable", labelFr: "1 - Jamais remarquée" },
              { value: "2", label: "2 - Tolerable, sometimes interferes", labelFr: "2 - Tolérable, interfère parfois" },
              { value: "3", label: "3 - Barely tolerable, frequently interferes", labelFr: "3 - À peine tolérable, interfère fréquemment" },
              { value: "4", label: "4 - Intolerable, always interferes", labelFr: "4 - Intolérable, interfère toujours" },
            ]
          },
        ],
      },
      {
        id: "impact",
        title: "Impact Assessment",
        titleFr: "Évaluation de l'impact",
        fields: [
          { id: "social_impact", type: "textarea", label: "Social Impact", labelFr: "Impact social" },
          { id: "professional_impact", type: "textarea", label: "Professional Impact", labelFr: "Impact professionnel" },
          { id: "psychological_impact", type: "textarea", label: "Psychological Impact", labelFr: "Impact psychologique" },
        ],
      },
      {
        id: "treatments-tried",
        title: "Previous Treatments",
        titleFr: "Traitements antérieurs",
        fields: [
          { id: "antiperspirants", type: "checkbox", label: "Antiperspirants", labelFr: "Antitranspirants" },
          { id: "iontophoresis", type: "checkbox", label: "Iontophoresis", labelFr: "Ionophorèse" },
          { id: "oral_medications", type: "checkbox", label: "Oral Medications", labelFr: "Médicaments oraux" },
          { id: "previous_botox", type: "checkbox", label: "Previous Botox Treatment", labelFr: "Traitement Botox antérieur" },
          { id: "treatment_details", type: "textarea", label: "Treatment Details", labelFr: "Détails des traitements" },
        ],
      },
      {
        id: "justification",
        title: "Medical Justification",
        titleFr: "Justification médicale",
        fields: [
          { id: "medical_necessity", type: "textarea", label: "Medical Necessity", labelFr: "Nécessité médicale", required: true },
          { id: "proposed_treatment", type: "textarea", label: "Proposed Treatment Plan", labelFr: "Plan de traitement proposé", required: true },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "doctor_signature", type: "signature", label: "Doctor Signature", labelFr: "Signature du médecin", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },

  // ===== Demande Assurance Laser Hyperpilosité =====
  {
    id: "assurance-laser-hyperpilosite",
    name: "Insurance Request - Laser for Hirsutism",
    nameFr: "Demande d'assurance - Laser pour hyperpilosité",
    description: "Insurance coverage request for laser hair removal",
    descriptionFr: "Demande de prise en charge pour épilation laser",
    language: "fr",
    category: "insurance-letter",
    originalFile: "demande Assurance laser pour Hyperpilosité.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations Patient",
        fields: [
          { id: "patient_name", type: "text", label: "Patient Name", labelFr: "Nom du patient", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "avs_number", type: "text", label: "AVS Number", labelFr: "Numéro AVS", required: true },
        ],
      },
      {
        id: "insurance-info",
        title: "Insurance Information",
        titleFr: "Informations Assurance",
        fields: [
          { id: "insurance_name", type: "text", label: "Insurance Company", labelFr: "Nom de l'assurance", required: true },
          { id: "insurance_address", type: "textarea", label: "Insurance Address", labelFr: "Adresse de l'assurance", required: true },
          { id: "policy_number", type: "text", label: "Policy Number", labelFr: "Numéro de police" },
        ],
      },
      {
        id: "clinical-info",
        title: "Clinical Information",
        titleFr: "Informations cliniques",
        fields: [
          { id: "affected_areas", type: "textarea", label: "Affected Areas", labelFr: "Zones affectées", required: true },
          { id: "ferriman_gallwey_score", type: "text", label: "Ferriman-Gallwey Score", labelFr: "Score de Ferriman-Gallwey" },
          { id: "underlying_condition", type: "select", label: "Underlying Condition", labelFr: "Condition sous-jacente",
            options: [
              { value: "pcos", label: "PCOS", labelFr: "SOPK" },
              { value: "hormonal_imbalance", label: "Hormonal Imbalance", labelFr: "Déséquilibre hormonal" },
              { value: "medication_induced", label: "Medication-Induced", labelFr: "Induit par médicaments" },
              { value: "idiopathic", label: "Idiopathic", labelFr: "Idiopathique" },
              { value: "other", label: "Other", labelFr: "Autre" },
            ]
          },
          { id: "symptom_duration", type: "text", label: "Duration of Symptoms", labelFr: "Durée des symptômes", required: true },
        ],
      },
      {
        id: "impact",
        title: "Impact Assessment",
        titleFr: "Évaluation de l'impact",
        fields: [
          { id: "psychological_impact", type: "textarea", label: "Psychological Impact", labelFr: "Impact psychologique", required: true },
          { id: "social_impact", type: "textarea", label: "Social Impact", labelFr: "Impact social" },
          { id: "skin_complications", type: "textarea", label: "Skin Complications from Hair Removal", labelFr: "Complications cutanées liées à l'épilation" },
        ],
      },
      {
        id: "treatments-tried",
        title: "Previous Treatments",
        titleFr: "Traitements antérieurs",
        fields: [
          { id: "waxing", type: "checkbox", label: "Waxing", labelFr: "Épilation à la cire" },
          { id: "shaving", type: "checkbox", label: "Shaving", labelFr: "Rasage" },
          { id: "depilatory_creams", type: "checkbox", label: "Depilatory Creams", labelFr: "Crèmes dépilatoires" },
          { id: "electrolysis", type: "checkbox", label: "Electrolysis", labelFr: "Électrolyse" },
          { id: "hormonal_treatment", type: "checkbox", label: "Hormonal Treatment", labelFr: "Traitement hormonal" },
          { id: "treatment_details", type: "textarea", label: "Treatment Details", labelFr: "Détails des traitements" },
        ],
      },
      {
        id: "justification",
        title: "Medical Justification",
        titleFr: "Justification médicale",
        fields: [
          { id: "medical_necessity", type: "textarea", label: "Medical Necessity", labelFr: "Nécessité médicale", required: true },
          { id: "proposed_treatment", type: "textarea", label: "Proposed Treatment Plan", labelFr: "Plan de traitement proposé", required: true },
          { id: "number_of_sessions", type: "text", label: "Estimated Number of Sessions", labelFr: "Nombre de séances estimé" },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "doctor_signature", type: "signature", label: "Doctor Signature", labelFr: "Signature du médecin", required: true },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },
];
