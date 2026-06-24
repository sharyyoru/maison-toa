export type PatientLanguage = "en" | "fr";

export function normalizePatientLanguage(
  value: unknown,
  fallback: PatientLanguage = "en",
): PatientLanguage {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "fr" ? "fr" : normalized === "en" ? "en" : fallback;
}
