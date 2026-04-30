// Operative Protocol (PO) Form Definitions
// Layout follows the exact structure from DOCX templates
import { FormDefinition } from "../formDefinitions";

export const OPERATIVE_PROTOCOL_FORMS: FormDefinition[] = [
  // ===== PO Abdominoplastie =====
  {
    id: "po-abdominoplastie",
    name: "Operative Protocol - Abdominoplasty",
    nameFr: "Protocole Opératoire - Abdominoplastie",
    description: "Post-operative protocol for abdominoplasty procedure",
    descriptionFr: "Protocole post-opératoire pour abdominoplastie",
    language: "fr",
    category: "operative-protocol",
    originalFile: "Modèle PO Abdominoplastie.docx",
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

  // ===== PO Lifting =====
  {
    id: "po-lifting",
    name: "Operative Protocol - Facelift",
    nameFr: "Protocole Opératoire - Lifting",
    description: "Post-operative protocol for facelift procedure",
    descriptionFr: "Protocole post-opératoire pour lifting",
    language: "fr",
    category: "operative-protocol",
    originalFile: "Modèle OP  lifting.docx",
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

  // ===== PO Otoplastie =====
  {
    id: "po-otoplastie",
    name: "Operative Protocol - Otoplasty",
    nameFr: "Protocole Opératoire - Otoplastie",
    description: "Post-operative protocol for ear surgery",
    descriptionFr: "Protocole post-opératoire pour otoplastie",
    language: "fr",
    category: "operative-protocol",
    originalFile: "Modèle PO Otoplastie.docx",
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

  // ===== PO Liposuccion =====
  {
    id: "po-liposuccion",
    name: "Operative Protocol - Liposuction",
    nameFr: "Protocole Opératoire - Liposuccion",
    description: "Post-operative protocol for liposuction",
    descriptionFr: "Protocole post-opératoire pour liposuccion",
    language: "fr",
    category: "operative-protocol",
    originalFile: "Modèle PO lipo.docx",
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

  // ===== PO Blépharoplastie Supérieure =====
  {
    id: "po-bleph-sup",
    name: "Operative Protocol - Upper Blepharoplasty",
    nameFr: "Protocole Opératoire - Blépharoplastie Supérieure",
    description: "Post-operative protocol for upper eyelid surgery",
    descriptionFr: "Protocole post-opératoire pour blépharoplastie supérieure",
    language: "fr",
    category: "operative-protocol",
    originalFile: "PO bléph sup.docx",
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

  // ===== PO Blépharoplastie Inférieure =====
  {
    id: "po-bleph-inf",
    name: "Operative Protocol - Lower Blepharoplasty",
    nameFr: "Protocole Opératoire - Blépharoplastie Inférieure",
    description: "Post-operative protocol for lower eyelid surgery",
    descriptionFr: "Protocole post-opératoire pour blépharoplastie inférieure",
    language: "fr",
    category: "operative-protocol",
    originalFile: "PO bléph inf.docx",
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

  // ===== PO Blépharoplastie 4 paupières =====
  {
    id: "po-bleph-4-paupieres",
    name: "Operative Protocol - Four Eyelid Blepharoplasty",
    nameFr: "Protocole Opératoire - Blépharoplastie 4 paupières",
    description: "Post-operative protocol for four eyelid surgery",
    descriptionFr: "Protocole post-opératoire pour blépharoplastie 4 paupières",
    language: "fr",
    category: "operative-protocol",
    originalFile: "Modèle bléph 4 paup.docx",
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

  // ===== PO Nymphoplastie =====
  {
    id: "po-nymphoplastie",
    name: "Operative Protocol - Labiaplasty",
    nameFr: "Protocole Opératoire - Nymphoplastie",
    description: "Post-operative protocol for labiaplasty",
    descriptionFr: "Protocole post-opératoire pour nymphoplastie",
    language: "fr",
    category: "operative-protocol",
    originalFile: "PO nymphoplastie.docx",
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

  // ===== PO Vierge (Blank Template) =====
  {
    id: "po-vierge",
    name: "Operative Protocol - Blank Template",
    nameFr: "Protocole Opératoire - Vierge",
    description: "Blank operative protocol template",
    descriptionFr: "Modèle de protocole opératoire vierge",
    language: "fr",
    category: "operative-protocol",
    originalFile: "PO vierge.docx",
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
