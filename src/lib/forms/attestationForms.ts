// Attestation and Convocation Form Definitions
import { FormDefinition } from "../formDefinitions";

export const ATTESTATION_FORMS: FormDefinition[] = [
  // ===== Attestation RDV AM =====
  {
    id: "attestation-rdv-am",
    name: "Appointment Attestation - AM",
    nameFr: "Attestation de rendez-vous - AM",
    description: "Appointment attestation form",
    descriptionFr: "Attestation de rendez-vous",
    language: "fr",
    category: "attestation",
    originalFile: "Modèle AM Attestation rdv.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations Patient",
        fields: [
          { id: "patient_name", type: "text", label: "Patient Name", labelFr: "Nom du patient", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "patient_address", type: "textarea", label: "Patient Address", labelFr: "Adresse du patient" },
        ],
      },
      {
        id: "appointment-info",
        title: "Appointment Information",
        titleFr: "Informations du rendez-vous",
        fields: [
          { id: "appointment_date", type: "date", label: "Appointment Date", labelFr: "Date du rendez-vous", required: true },
          { id: "appointment_time", type: "text", label: "Appointment Time", labelFr: "Heure du rendez-vous", required: true },
          { id: "appointment_purpose", type: "textarea", label: "Purpose of Visit", labelFr: "Motif de la consultation" },
          { id: "doctor_name", type: "text", label: "Doctor Name", labelFr: "Nom du médecin", required: true },
        ],
      },
      {
        id: "attestation",
        title: "Attestation",
        titleFr: "Attestation",
        fields: [
          { id: "attestation_text", type: "textarea", label: "Attestation Text", labelFr: "Texte de l'attestation",
            helpText: "Certifies that the above-named patient had an appointment at our clinic",
            helpTextFr: "Certifie que le patient ci-dessus nommé avait un rendez-vous dans notre clinique"
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

  // ===== Attestation RDV SN =====
  {
    id: "attestation-rdv-sn",
    name: "Appointment Attestation - SN",
    nameFr: "Attestation de rendez-vous - SN",
    description: "Appointment attestation form",
    descriptionFr: "Attestation de rendez-vous",
    language: "fr",
    category: "attestation",
    originalFile: "Modèle SN Attestation rdv.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations Patient",
        fields: [
          { id: "patient_name", type: "text", label: "Patient Name", labelFr: "Nom du patient", required: true },
          { id: "date_of_birth", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
          { id: "patient_address", type: "textarea", label: "Patient Address", labelFr: "Adresse du patient" },
        ],
      },
      {
        id: "appointment-info",
        title: "Appointment Information",
        titleFr: "Informations du rendez-vous",
        fields: [
          { id: "appointment_date", type: "date", label: "Appointment Date", labelFr: "Date du rendez-vous", required: true },
          { id: "appointment_time", type: "text", label: "Appointment Time", labelFr: "Heure du rendez-vous", required: true },
          { id: "appointment_purpose", type: "textarea", label: "Purpose of Visit", labelFr: "Motif de la consultation" },
          { id: "doctor_name", type: "text", label: "Doctor Name", labelFr: "Nom du médecin", required: true },
        ],
      },
      {
        id: "attestation",
        title: "Attestation",
        titleFr: "Attestation",
        fields: [
          { id: "attestation_text", type: "textarea", label: "Attestation Text", labelFr: "Texte de l'attestation" },
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

  // ===== Convocation Fotofinder =====
  {
    id: "convocation-fotofinder",
    name: "Fotofinder Appointment Convocation",
    nameFr: "Convocation Fotofinder",
    description: "Convocation for Fotofinder appointment",
    descriptionFr: "Convocation pour rendez-vous Fotofinder",
    language: "fr",
    category: "convocation",
    originalFile: "Lettre convocation Fotofinder.docx",
    sections: [
      {
        id: "patient-info",
        title: "Patient Information",
        titleFr: "Informations Patient",
        fields: [
          { id: "patient_name", type: "text", label: "Patient Name", labelFr: "Nom du patient", required: true },
          { id: "patient_address", type: "textarea", label: "Patient Address", labelFr: "Adresse du patient", required: true },
        ],
      },
      {
        id: "appointment-info",
        title: "Appointment Details",
        titleFr: "Détails du rendez-vous",
        fields: [
          { id: "appointment_date", type: "date", label: "Appointment Date", labelFr: "Date du rendez-vous", required: true },
          { id: "appointment_time", type: "text", label: "Appointment Time", labelFr: "Heure du rendez-vous", required: true },
          { id: "location", type: "textarea", label: "Location", labelFr: "Lieu" },
        ],
      },
      {
        id: "instructions",
        title: "Preparation Instructions",
        titleFr: "Instructions de préparation",
        fields: [
          { id: "preparation_instructions", type: "textarea", label: "Preparation Instructions", labelFr: "Instructions de préparation",
            helpText: "Instructions for patient preparation before the Fotofinder examination",
            helpTextFr: "Instructions pour la préparation du patient avant l'examen Fotofinder"
          },
          { id: "duration_estimate", type: "text", label: "Estimated Duration", labelFr: "Durée estimée" },
          { id: "what_to_bring", type: "textarea", label: "What to Bring", labelFr: "Documents à apporter" },
        ],
      },
      {
        id: "contact",
        title: "Contact Information",
        titleFr: "Coordonnées",
        fields: [
          { id: "contact_phone", type: "phone", label: "Contact Phone", labelFr: "Téléphone de contact" },
          { id: "contact_email", type: "email", label: "Contact Email", labelFr: "Email de contact" },
          { id: "cancellation_policy", type: "textarea", label: "Cancellation Policy", labelFr: "Politique d'annulation" },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "secretary_signature", type: "signature", label: "Secretary Signature", labelFr: "Signature du secrétariat" },
          { id: "signature_date", type: "date", label: "Date", labelFr: "Date", required: true },
        ],
      },
    ],
  },
];
