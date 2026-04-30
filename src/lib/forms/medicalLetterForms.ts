// Medical Letter Form Definitions
import { FormDefinition } from "../formDefinitions";

export const MEDICAL_LETTER_FORMS: FormDefinition[] = [
  // ===== Lettre Type Dr Miles =====
  {
    id: "lettre-type-dr-miles",
    name: "Standard Letter - Dr Miles",
    nameFr: "Lettre Type - Dr Miles",
    description: "Standard medical letter template for Dr Miles",
    descriptionFr: "Modèle de lettre médicale standard pour Dr Miles",
    language: "fr",
    category: "medical-letter",
    originalFile: "LETTRE TYPE DR MILES.docx",
    doctor: "dr-miles",
    sections: [
      {
        id: "recipient-info",
        title: "Recipient Information",
        titleFr: "Informations du destinataire",
        fields: [
          { id: "recipient_name", type: "text", label: "Recipient Name", labelFr: "Nom du destinataire", required: true },
          { id: "recipient_title", type: "text", label: "Title/Position", labelFr: "Titre/Fonction" },
          { id: "recipient_address", type: "textarea", label: "Recipient Address", labelFr: "Adresse du destinataire", required: true },
        ],
      },
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations Patient",
        fields: [
          { id: "patient_name", type: "text", label: "Patient Name", labelFr: "Nom du patient", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
        ],
      },
      {
        id: "letter-content",
        title: "Letter Content",
        titleFr: "Contenu de la lettre",
        fields: [
          { id: "subject", type: "text", label: "Subject", labelFr: "Objet", required: true },
          { id: "salutation", type: "text", label: "Salutation", labelFr: "Formule de politesse",
            placeholder: "Cher(e) Confrère/Consœur",
            placeholderFr: "Cher(e) Confrère/Consœur"
          },
          { id: "letter_body", type: "textarea", label: "Letter Body", labelFr: "Corps de la lettre", required: true },
          { id: "closing", type: "text", label: "Closing", labelFr: "Formule de clôture",
            placeholder: "Avec mes meilleures salutations",
            placeholderFr: "Avec mes meilleures salutations"
          },
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

  // ===== Modèle LS Lausanne =====
  {
    id: "modele-ls-lausanne",
    name: "Lausanne Model Letter",
    nameFr: "Modèle LS Lausanne",
    description: "Lausanne medical letter template",
    descriptionFr: "Modèle de lettre médicale Lausanne",
    language: "fr",
    category: "medical-letter",
    originalFile: "Modèle LS lsne.docx",
    sections: [
      {
        id: "recipient-info",
        title: "Recipient Information",
        titleFr: "Informations du destinataire",
        fields: [
          { id: "recipient_name", type: "text", label: "Recipient Name", labelFr: "Nom du destinataire", required: true },
          { id: "recipient_title", type: "text", label: "Title/Position", labelFr: "Titre/Fonction" },
          { id: "recipient_institution", type: "text", label: "Institution", labelFr: "Institution" },
          { id: "recipient_address", type: "textarea", label: "Recipient Address", labelFr: "Adresse du destinataire", required: true },
        ],
      },
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations Patient",
        fields: [
          { id: "patient_name", type: "text", label: "Patient Name", labelFr: "Nom du patient", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "avs_number", type: "text", label: "AVS Number", labelFr: "Numéro AVS" },
        ],
      },
      {
        id: "consultation-info",
        title: "Consultation Information",
        titleFr: "Informations de consultation",
        fields: [
          { id: "consultation_date", type: "date", label: "Consultation Date", labelFr: "Date de consultation", required: true },
          { id: "reason_for_consultation", type: "textarea", label: "Reason for Consultation", labelFr: "Motif de consultation", required: true },
        ],
      },
      {
        id: "clinical-findings",
        title: "Clinical Findings",
        titleFr: "Constatations cliniques",
        fields: [
          { id: "history", type: "textarea", label: "History", labelFr: "Anamnèse" },
          { id: "examination_findings", type: "textarea", label: "Examination Findings", labelFr: "Examen clinique" },
          { id: "diagnosis", type: "textarea", label: "Diagnosis", labelFr: "Diagnostic" },
        ],
      },
      {
        id: "treatment-plan",
        title: "Treatment Plan",
        titleFr: "Plan de traitement",
        fields: [
          { id: "proposed_treatment", type: "textarea", label: "Proposed Treatment", labelFr: "Traitement proposé" },
          { id: "follow_up", type: "textarea", label: "Follow-up Plan", labelFr: "Plan de suivi" },
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
