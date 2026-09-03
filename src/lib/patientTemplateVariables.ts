export type PatientTemplateSource = {
  first_name?: string | null;
  last_name?: string | null;
  gender?: string | null;
  [key: string]: unknown;
};

/** Add patient values that must be computed from the current profile at send time. */
export function withPatientTemplateVariables<T extends PatientTemplateSource>(
  patient: T,
): T & { full_name: string; salutation_fr: string; salutation_en: string } {
  const firstName = patient.first_name?.trim() ?? "";
  const lastName = patient.last_name?.trim() ?? "";
  const gender = patient.gender?.trim().toLowerCase();
  const frenchTitle = gender === "female" ? "Chère Madame" : gender === "male" ? "Cher Monsieur" : "Bonjour";
  const englishTitle = gender === "female" ? "Dear Madam" : gender === "male" ? "Dear Sir" : "Dear";

  return {
    ...patient,
    full_name: [firstName, lastName].filter(Boolean).join(" "),
    salutation_fr: [frenchTitle, lastName].filter(Boolean).join(" "),
    salutation_en: [englishTitle, lastName].filter(Boolean).join(" "),
  };
}
