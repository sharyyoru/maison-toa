// Breast Surgery Form Definitions
// Layout follows the exact structure from DOCX templates
import { FormDefinition } from "../formDefinitions";

export const BREAST_SURGERY_FORMS: FormDefinition[] = [
  // ===== PO Pexie Mammaire =====
  {
    id: "po-pexie-mammaire",
    name: "Operative Protocol - Breast Lift",
    nameFr: "Protocole Opératoire - Pexie Mammaire",
    description: "Post-operative protocol for breast lift (mastopexy)",
    descriptionFr: "Protocole post-opératoire pour pexie mammaire",
    language: "fr",
    category: "operative-protocol",
    originalFile: "Modèle pexie mammaire.docx",
    sections: [
      {
        id: "patient",
        title: "Patient",
        titleFr: "Patient",
        fields: [
          { id: "nom", type: "text", label: "Last Name", labelFr: "NOM", required: true },
          { id: "prenom", type: "text", label: "First Name", labelFr: "Prénom", required: true },
          { id: "date_naissance", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
        ],
      },
      {
        id: "operation-details",
        title: "Operation Details",
        titleFr: "Détails de l'opération",
        fields: [
          { id: "date_operation", type: "date", label: "Operation Date", labelFr: "Date de l'opération", required: true },
          { id: "lieu", type: "text", label: "Location", labelFr: "Lieu", required: true },
          { id: "type_anesthesie", type: "text", label: "Type of Anesthesia", labelFr: "Type d'anesthésie", required: true },
          { id: "operateurs", type: "text", label: "Operator(s)", labelFr: "Opérateur(s)", required: true },
          { id: "anesthesiste", type: "text", label: "Anesthesiologist", labelFr: "Anesthésiste" },
          { id: "instrumentiste", type: "text", label: "Scrub Nurse", labelFr: "Instrumentiste" },
        ],
      },
      {
        id: "diagnostic",
        title: "Diagnostic",
        titleFr: "Diagnostic",
        fields: [
          { id: "diagnostic", type: "text", label: "Diagnosis", labelFr: "DIAGNOSTIC", required: true },
        ],
      },
      {
        id: "interventions",
        title: "Interventions",
        titleFr: "Interventions",
        fields: [
          { id: "interventions", type: "text", label: "Interventions", labelFr: "INTERVENTIONS", required: true },
        ],
      },
      {
        id: "description",
        title: "Description of Intervention",
        titleFr: "Description de l'intervention",
        fields: [
          { id: "description_intervention", type: "textarea", label: "Description of Intervention", labelFr: "Description de l'intervention", required: true },
        ],
      },
      {
        id: "suites",
        title: "Post-operative Care",
        titleFr: "Suites",
        fields: [
          { id: "suites", type: "textarea", label: "Post-operative Care", labelFr: "SUITES", required: true },
        ],
      },
      {
        id: "complications",
        title: "Complications",
        titleFr: "Complications",
        fields: [
          { id: "complications", type: "text", label: "Complications", labelFr: "Complications", placeholder: "aucune", placeholderFr: "aucune" },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "surgeon_signature", type: "signature", label: "Surgeon Signature", labelFr: "Signature du chirurgien", required: true },
        ],
      },
    ],
  },

  // ===== PO AM Pexie =====
  {
    id: "po-pexie-am",
    name: "Operative Protocol - Breast Lift with Implants",
    nameFr: "Protocole Opératoire - Pexie avec Augmentation Mammaire",
    description: "Post-operative protocol for breast lift with augmentation",
    descriptionFr: "Protocole post-opératoire pour pexie avec augmentation mammaire",
    language: "fr",
    category: "operative-protocol",
    originalFile: "PO PEXIE   AM .docx",
    sections: [
      {
        id: "patient",
        title: "Patient",
        titleFr: "Patient",
        fields: [
          { id: "nom", type: "text", label: "Last Name", labelFr: "NOM", required: true },
          { id: "prenom", type: "text", label: "First Name", labelFr: "Prénom", required: true },
          { id: "date_naissance", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
        ],
      },
      {
        id: "operation-details",
        title: "Operation Details",
        titleFr: "Détails de l'opération",
        fields: [
          { id: "date_operation", type: "date", label: "Operation Date", labelFr: "Date de l'opération", required: true },
          { id: "lieu", type: "text", label: "Location", labelFr: "Lieu", required: true },
          { id: "type_anesthesie", type: "text", label: "Type of Anesthesia", labelFr: "Type d'anesthésie", required: true },
          { id: "operateurs", type: "text", label: "Operator(s)", labelFr: "Opérateur(s)", required: true },
          { id: "anesthesiste", type: "text", label: "Anesthesiologist", labelFr: "Anesthésiste" },
          { id: "instrumentiste", type: "text", label: "Scrub Nurse", labelFr: "Instrumentiste" },
        ],
      },
      {
        id: "diagnostic",
        title: "Diagnostic",
        titleFr: "Diagnostic",
        fields: [
          { id: "diagnostic", type: "text", label: "Diagnosis", labelFr: "DIAGNOSTIC", required: true },
        ],
      },
      {
        id: "interventions",
        title: "Interventions",
        titleFr: "Interventions",
        fields: [
          { id: "interventions", type: "text", label: "Interventions", labelFr: "INTERVENTIONS", required: true },
        ],
      },
      {
        id: "description",
        title: "Description of Intervention",
        titleFr: "Description de l'intervention",
        fields: [
          { id: "description_intervention", type: "textarea", label: "Description of Intervention", labelFr: "Description de l'intervention", required: true },
        ],
      },
      {
        id: "suites",
        title: "Post-operative Care",
        titleFr: "Suites",
        fields: [
          { id: "suites", type: "textarea", label: "Post-operative Care", labelFr: "SUITES", required: true },
        ],
      },
      {
        id: "complications",
        title: "Complications",
        titleFr: "Complications",
        fields: [
          { id: "complications", type: "text", label: "Complications", labelFr: "Complications", placeholder: "aucune", placeholderFr: "aucune" },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "surgeon_signature", type: "signature", label: "Surgeon Signature", labelFr: "Signature du chirurgien", required: true },
        ],
      },
    ],
  },

  // ===== PO AM Dual Plane =====
  {
    id: "po-am-dual-plane",
    name: "Operative Protocol - Breast Augmentation Dual Plane",
    nameFr: "Protocole Opératoire - Augmentation Mammaire Dual Plane",
    description: "Post-operative protocol for breast augmentation with dual plane technique",
    descriptionFr: "Protocole post-opératoire pour augmentation mammaire dual plane",
    language: "fr",
    category: "operative-protocol",
    originalFile: "Modèle PO  AM Dual plane.docx",
    sections: [
      {
        id: "patient",
        title: "Patient",
        titleFr: "Patient",
        fields: [
          { id: "nom", type: "text", label: "Last Name", labelFr: "NOM", required: true },
          { id: "prenom", type: "text", label: "First Name", labelFr: "Prénom", required: true },
          { id: "date_naissance", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
        ],
      },
      {
        id: "operation-details",
        title: "Operation Details",
        titleFr: "Détails de l'opération",
        fields: [
          { id: "date_operation", type: "date", label: "Operation Date", labelFr: "Date de l'opération", required: true },
          { id: "lieu", type: "text", label: "Location", labelFr: "Lieu", required: true },
          { id: "type_anesthesie", type: "text", label: "Type of Anesthesia", labelFr: "Type d'anesthésie", required: true },
          { id: "operateurs", type: "text", label: "Operator(s)", labelFr: "Opérateur(s)", required: true },
          { id: "anesthesiste", type: "text", label: "Anesthesiologist", labelFr: "Anesthésiste" },
          { id: "instrumentiste", type: "text", label: "Scrub Nurse", labelFr: "Instrumentiste" },
        ],
      },
      {
        id: "diagnostic",
        title: "Diagnostic",
        titleFr: "Diagnostic",
        fields: [
          { id: "diagnostic", type: "text", label: "Diagnosis", labelFr: "DIAGNOSTIC", required: true },
        ],
      },
      {
        id: "interventions",
        title: "Interventions",
        titleFr: "Interventions",
        fields: [
          { id: "interventions", type: "text", label: "Interventions", labelFr: "INTERVENTIONS", required: true },
        ],
      },
      {
        id: "description",
        title: "Description of Intervention",
        titleFr: "Description de l'intervention",
        fields: [
          { id: "description_intervention", type: "textarea", label: "Description of Intervention", labelFr: "Description de l'intervention", required: true },
        ],
      },
      {
        id: "suites",
        title: "Post-operative Care",
        titleFr: "Suites",
        fields: [
          { id: "suites", type: "textarea", label: "Post-operative Care", labelFr: "SUITES", required: true },
        ],
      },
      {
        id: "complications",
        title: "Complications",
        titleFr: "Complications",
        fields: [
          { id: "complications", type: "text", label: "Complications", labelFr: "Complications", placeholder: "aucune", placeholderFr: "aucune" },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "surgeon_signature", type: "signature", label: "Surgeon Signature", labelFr: "Signature du chirurgien", required: true },
        ],
      },
    ],
  },

  // ===== PO AM Retro Glandulaire =====
  {
    id: "po-am-retroglandulaire",
    name: "Operative Protocol - Breast Augmentation Subglandular",
    nameFr: "Protocole Opératoire - Augmentation Mammaire Rétro-glandulaire",
    description: "Post-operative protocol for subglandular breast augmentation",
    descriptionFr: "Protocole post-opératoire pour augmentation mammaire rétro-glandulaire",
    language: "fr",
    category: "operative-protocol",
    originalFile: "Modèle PO  AM Retro glandulaire.docx",
    sections: [
      {
        id: "patient",
        title: "Patient",
        titleFr: "Patient",
        fields: [
          { id: "nom", type: "text", label: "Last Name", labelFr: "NOM", required: true },
          { id: "prenom", type: "text", label: "First Name", labelFr: "Prénom", required: true },
          { id: "date_naissance", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
        ],
      },
      {
        id: "operation-details",
        title: "Operation Details",
        titleFr: "Détails de l'opération",
        fields: [
          { id: "date_operation", type: "date", label: "Operation Date", labelFr: "Date de l'opération", required: true },
          { id: "lieu", type: "text", label: "Location", labelFr: "Lieu", required: true },
          { id: "type_anesthesie", type: "text", label: "Type of Anesthesia", labelFr: "Type d'anesthésie", required: true },
          { id: "operateurs", type: "text", label: "Operator(s)", labelFr: "Opérateur(s)", required: true },
          { id: "anesthesiste", type: "text", label: "Anesthesiologist", labelFr: "Anesthésiste" },
          { id: "instrumentiste", type: "text", label: "Scrub Nurse", labelFr: "Instrumentiste" },
        ],
      },
      {
        id: "diagnostic",
        title: "Diagnostic",
        titleFr: "Diagnostic",
        fields: [
          { id: "diagnostic", type: "text", label: "Diagnosis", labelFr: "DIAGNOSTIC", required: true },
        ],
      },
      {
        id: "interventions",
        title: "Interventions",
        titleFr: "Interventions",
        fields: [
          { id: "interventions", type: "text", label: "Interventions", labelFr: "INTERVENTIONS", required: true },
        ],
      },
      {
        id: "description",
        title: "Description of Intervention",
        titleFr: "Description de l'intervention",
        fields: [
          { id: "description_intervention", type: "textarea", label: "Description of Intervention", labelFr: "Description de l'intervention", required: true },
        ],
      },
      {
        id: "suites",
        title: "Post-operative Care",
        titleFr: "Suites",
        fields: [
          { id: "suites", type: "textarea", label: "Post-operative Care", labelFr: "SUITES", required: true },
        ],
      },
      {
        id: "complications",
        title: "Complications",
        titleFr: "Complications",
        fields: [
          { id: "complications", type: "text", label: "Complications", labelFr: "Complications", placeholder: "aucune", placeholderFr: "aucune" },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "surgeon_signature", type: "signature", label: "Surgeon Signature", labelFr: "Signature du chirurgien", required: true },
        ],
      },
    ],
  },

  // ===== PO Réduction Mammaire Supérieure =====
  {
    id: "po-reduction-mammaire-sup",
    name: "Operative Protocol - Breast Reduction (Superior Pedicle)",
    nameFr: "Protocole Opératoire - Réduction Mammaire (Pédicule Supérieur)",
    description: "Post-operative protocol for breast reduction with superior pedicle",
    descriptionFr: "Protocole post-opératoire pour réduction mammaire pédicule supérieur",
    language: "fr",
    category: "operative-protocol",
    originalFile: "Modèle PO sup  Red Mam.docx",
    sections: [
      {
        id: "patient",
        title: "Patient",
        titleFr: "Patient",
        fields: [
          { id: "nom", type: "text", label: "Last Name", labelFr: "NOM", required: true },
          { id: "prenom", type: "text", label: "First Name", labelFr: "Prénom", required: true },
          { id: "date_naissance", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
        ],
      },
      {
        id: "operation-details",
        title: "Operation Details",
        titleFr: "Détails de l'opération",
        fields: [
          { id: "date_operation", type: "date", label: "Operation Date", labelFr: "Date de l'opération", required: true },
          { id: "lieu", type: "text", label: "Location", labelFr: "Lieu", required: true },
          { id: "type_anesthesie", type: "text", label: "Type of Anesthesia", labelFr: "Type d'anesthésie", required: true },
          { id: "operateurs", type: "text", label: "Operator(s)", labelFr: "Opérateur(s)", required: true },
          { id: "anesthesiste", type: "text", label: "Anesthesiologist", labelFr: "Anesthésiste" },
          { id: "instrumentiste", type: "text", label: "Scrub Nurse", labelFr: "Instrumentiste" },
        ],
      },
      {
        id: "diagnostic",
        title: "Diagnostic",
        titleFr: "Diagnostic",
        fields: [
          { id: "diagnostic", type: "text", label: "Diagnosis", labelFr: "DIAGNOSTIC", required: true },
        ],
      },
      {
        id: "interventions",
        title: "Interventions",
        titleFr: "Interventions",
        fields: [
          { id: "interventions", type: "text", label: "Interventions", labelFr: "INTERVENTIONS", required: true },
        ],
      },
      {
        id: "description",
        title: "Description of Intervention",
        titleFr: "Description de l'intervention",
        fields: [
          { id: "description_intervention", type: "textarea", label: "Description of Intervention", labelFr: "Description de l'intervention", required: true },
        ],
      },
      {
        id: "suites",
        title: "Post-operative Care",
        titleFr: "Suites",
        fields: [
          { id: "suites", type: "textarea", label: "Post-operative Care", labelFr: "SUITES", required: true },
        ],
      },
      {
        id: "complications",
        title: "Complications",
        titleFr: "Complications",
        fields: [
          { id: "complications", type: "text", label: "Complications", labelFr: "Complications", placeholder: "aucune", placeholderFr: "aucune" },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "surgeon_signature", type: "signature", label: "Surgeon Signature", labelFr: "Signature du chirurgien", required: true },
        ],
      },
    ],
  },

  // ===== PO Réduction Mammaire Inférieure =====
  {
    id: "po-reduction-mammaire-inf",
    name: "Operative Protocol - Breast Reduction (Inferior Pedicle)",
    nameFr: "Protocole Opératoire - Réduction Mammaire (Pédicule Inférieur)",
    description: "Post-operative protocol for breast reduction with inferior pedicle",
    descriptionFr: "Protocole post-opératoire pour réduction mammaire pédicule inférieur",
    language: "fr",
    category: "operative-protocol",
    originalFile: "Modèle PO inf Réd mam.docx",
    sections: [
      {
        id: "patient",
        title: "Patient",
        titleFr: "Patient",
        fields: [
          { id: "nom", type: "text", label: "Last Name", labelFr: "NOM", required: true },
          { id: "prenom", type: "text", label: "First Name", labelFr: "Prénom", required: true },
          { id: "date_naissance", type: "date", label: "Date of Birth", labelFr: "Date de naissance", required: true },
        ],
      },
      {
        id: "operation-details",
        title: "Operation Details",
        titleFr: "Détails de l'opération",
        fields: [
          { id: "date_operation", type: "date", label: "Operation Date", labelFr: "Date de l'opération", required: true },
          { id: "lieu", type: "text", label: "Location", labelFr: "Lieu", required: true },
          { id: "type_anesthesie", type: "text", label: "Type of Anesthesia", labelFr: "Type d'anesthésie", required: true },
          { id: "operateurs", type: "text", label: "Operator(s)", labelFr: "Opérateur(s)", required: true },
          { id: "anesthesiste", type: "text", label: "Anesthesiologist", labelFr: "Anesthésiste" },
          { id: "instrumentiste", type: "text", label: "Scrub Nurse", labelFr: "Instrumentiste" },
        ],
      },
      {
        id: "diagnostic",
        title: "Diagnostic",
        titleFr: "Diagnostic",
        fields: [
          { id: "diagnostic", type: "text", label: "Diagnosis", labelFr: "DIAGNOSTIC", required: true },
        ],
      },
      {
        id: "interventions",
        title: "Interventions",
        titleFr: "Interventions",
        fields: [
          { id: "interventions", type: "text", label: "Interventions", labelFr: "INTERVENTIONS", required: true },
        ],
      },
      {
        id: "description",
        title: "Description of Intervention",
        titleFr: "Description de l'intervention",
        fields: [
          { id: "description_intervention", type: "textarea", label: "Description of Intervention", labelFr: "Description de l'intervention", required: true },
        ],
      },
      {
        id: "suites",
        title: "Post-operative Care",
        titleFr: "Suites",
        fields: [
          { id: "suites", type: "textarea", label: "Post-operative Care", labelFr: "SUITES", required: true },
        ],
      },
      {
        id: "complications",
        title: "Complications",
        titleFr: "Complications",
        fields: [
          { id: "complications", type: "text", label: "Complications", labelFr: "Complications", placeholder: "aucune", placeholderFr: "aucune" },
        ],
      },
      {
        id: "signature",
        title: "Signature",
        titleFr: "Signature",
        fields: [
          { id: "surgeon_signature", type: "signature", label: "Surgeon Signature", labelFr: "Signature du chirurgien", required: true },
        ],
      },
    ],
  },
];
