/**
 * Patient data sanitization helpers.
 *
 * These run at every patient create/update point (API routes + client forms) to
 * prevent bad data from reaching Supabase — which would later cause silent
 * Sumex HTTP 204 failures or display issues.
 *
 * Known Sumex silent-204 causes fixed here:
 *  - Phone: comma/semicolon-separated multi-number  → keep first only
 *  - Town:  "Renens VD" (city + canton suffix)      → strip trailing 2-letter code
 *  - Country: canton code stored as country          → clear it (belongs in canton field)
 *
 * Security:
 *  - stripHtml: removes all HTML/script tags from free-text fields to prevent XSS
 *    injection via public-facing forms (booking, registration, leads).
 */

/** Valid Swiss canton abbreviations (ISO 3166-2:CH). */
export const SWISS_CANTONS: Record<string, string> = {
  AG: "Aargau",
  AI: "Appenzell Innerrhoden",
  AR: "Appenzell Ausserrhoden",
  BE: "Bern",
  BL: "Basel-Landschaft",
  BS: "Basel-Stadt",
  FR: "Fribourg",
  GE: "Genève",
  GL: "Glarus",
  GR: "Graubünden",
  JU: "Jura",
  LU: "Luzern",
  NE: "Neuchâtel",
  NW: "Nidwalden",
  OW: "Obwalden",
  SG: "St. Gallen",
  SH: "Schaffhausen",
  SO: "Solothurn",
  SZ: "Schwyz",
  TG: "Thurgau",
  TI: "Ticino",
  UR: "Uri",
  VD: "Vaud",
  VS: "Valais",
  ZG: "Zug",
  ZH: "Zürich",
};

const CANTON_CODES = new Set(Object.keys(SWISS_CANTONS));

/** Swiss country synonyms that should be normalised to 'CH'. */
const SWISS_SYNONYMS = new Set([
  "suisse", "schweiz", "svizzera", "switzerland", "ch",
]);

/**
 * Strip all HTML tags and potentially dangerous content from a string.
 * Prevents XSS via public-facing forms (patient names, notes, messages).
 * Returns null when the input is empty after stripping.
 */
export function stripHtml(value: string | null | undefined): string | null {
  if (!value) return null;
  // Remove all HTML tags (including <script>, <img onerror=...>, etc.)
  const stripped = value
    .replace(/<[^>]*>/g, "")          // strip all tags
    .replace(/javascript\s*:/gi, "")  // strip javascript: URIs
    .replace(/on\w+\s*=/gi, "")       // strip inline event handlers (onclick=, onerror=, etc.)
    .trim();
  return stripped || null;
}

/**
 * Sanitize a phone string:
 *  - If comma/semicolon-separated, keep only the first number.
 *  - Trim whitespace.
 *  - Returns null when the input is empty.
 */
export function sanitizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const first = phone.split(/[,;]/)[0].trim();
  return first || null;
}

/**
 * Sanitize a city/town string:
 *  - Strip trailing " XX" canton abbreviation (e.g. "Renens VD" → "Renens").
 *  - Trim whitespace.
 *  - Returns null when the input is empty.
 */
export function sanitizeTown(town: string | null | undefined): string | null {
  if (!town) return null;
  return town.replace(/\s+[A-Z]{2}$/, "").trim() || null;
}

/**
 * Sanitize the country field:
 *  - Swiss canton codes (e.g. "VD") → null  (canton ≠ country; country should be "CH" or null)
 *  - Swiss synonyms ("Suisse", "Schweiz", "Switzerland", …) → "CH"
 *  - Other values are left as-is (trim only).
 *  - Returns null when the input is empty.
 */
export function sanitizeCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  if (!trimmed) return null;
  if (CANTON_CODES.has(trimmed)) return null;
  if (SWISS_SYNONYMS.has(trimmed.toLowerCase())) return "CH";
  return trimmed;
}

/**
 * Sanitize all patient address/contact fields at once.
 * Accepts a partial patient payload and returns the same shape with cleaned values.
 * Safe to spread into a Supabase insert/update call.
 */
export function sanitizePatientFields<T extends {
  phone?: string | null;
  town?: string | null;
  country?: string | null;
}>(fields: T): T {
  const out = { ...fields };
  if ("phone"   in out) out.phone   = sanitizePhone(out.phone)   as T["phone"];
  if ("town"    in out) out.town    = sanitizeTown(out.town)     as T["town"];
  if ("country" in out) out.country = sanitizeCountry(out.country) as T["country"];
  return out;
}
