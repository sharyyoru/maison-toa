import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Filter schema for marketing audience selection. Mirrors the `filter` jsonb
 * column on `marketing_lists` and the `filter_snapshot` on `marketing_campaigns`.
 */
export type MarketingFilter = {
  /** Exact-match list of contact_owner_name values. */
  ownerNames?: string[];
  /** ISO date (YYYY-MM-DD). Matches patients.created_at >= this. */
  createdAfter?: string | null;
  /** ISO date (YYYY-MM-DD). Matches patients.created_at < this (exclusive end). */
  createdBefore?: string | null;
  /** "any" | "has" | "none" */
  hasDeal?: "any" | "has" | "none";
  /** Restrict to patients whose deals have one of these stage IDs. */
  dealStageIds?: string[];
  /** 1-12. Match patients whose DOB month equals this (for birthday campaigns). */
  dobMonth?: number | null;
  /** Lead-source string match (exact). */
  sources?: string[];
  /** Full-text partial match across name/email. */
  search?: string;
  /** When true (default), skip patients without an email. */
  requireEmail?: boolean;
  /** When true (default), exclude patients.marketing_opt_out = true. */
  excludeOptOut?: boolean;
};

export type PatientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
  source: string | null;
  contact_owner_name: string | null;
  created_at: string | null;
  marketing_opt_out?: boolean | null;
};

/** Maximum recipients a single campaign may send to. Defence in depth. */
export const MAX_CAMPAIGN_RECIPIENTS = 5000;

function normaliseFilter(f: MarketingFilter | null | undefined): MarketingFilter {
  return {
    ownerNames: f?.ownerNames ?? [],
    createdAfter: f?.createdAfter ?? null,
    createdBefore: f?.createdBefore ?? null,
    hasDeal: f?.hasDeal ?? "any",
    dealStageIds: f?.dealStageIds ?? [],
    dobMonth: f?.dobMonth ?? null,
    sources: f?.sources ?? [],
    search: f?.search ?? "",
    requireEmail: f?.requireEmail ?? true,
    excludeOptOut: f?.excludeOptOut ?? true,
  };
}

/**
 * Apply a MarketingFilter against the `patients` table and return the matching rows.
 * The caller is responsible for providing an admin Supabase client.
 *
 * Limits: MAX_CAMPAIGN_RECIPIENTS hard cap.
 */
export async function fetchAudience(
  supabase: SupabaseClient,
  filter: MarketingFilter | null | undefined,
  opts: { limit?: number; offset?: number; countOnly?: boolean } = {},
): Promise<{ rows: PatientRow[]; count: number | null }> {
  const f = normaliseFilter(filter);
  const hardCap = Math.min(opts.limit ?? MAX_CAMPAIGN_RECIPIENTS, MAX_CAMPAIGN_RECIPIENTS);

  // If we need to filter by deal presence/stage, first pull the matching patient_ids
  let patientIdFilter: string[] | null = null;
  if (f.hasDeal === "has" || f.hasDeal === "none" || (f.dealStageIds && f.dealStageIds.length > 0)) {
    let dealsQuery = supabase.from("deals").select("patient_id");
    if (f.dealStageIds && f.dealStageIds.length > 0) {
      dealsQuery = dealsQuery.in("stage_id", f.dealStageIds);
    }
    const { data: dealRows, error: dealErr } = await dealsQuery.limit(50000);
    if (dealErr) throw dealErr;
    const dealPatientIds = Array.from(
      new Set((dealRows ?? []).map((r) => r.patient_id).filter((x): x is string => !!x)),
    );
    if (f.hasDeal === "none") {
      // We need patients NOT in this set. We can't use .not("id", "in", ...) for huge sets
      // so we fetch all candidate patients and filter in memory below.
      patientIdFilter = dealPatientIds; // interpret as exclusion
    } else {
      // "has" or specific stage → only these patient IDs match
      if (dealPatientIds.length === 0) {
        return { rows: [], count: 0 };
      }
      patientIdFilter = dealPatientIds;
    }
  }

  let query = supabase
    .from("patients")
    .select(
      "id, first_name, last_name, email, phone, dob, source, contact_owner_name, created_at, marketing_opt_out",
      { count: opts.countOnly ? "exact" : "planned" },
    );

  if (f.requireEmail) {
    query = query.not("email", "is", null).neq("email", "");
  }
  if (f.excludeOptOut) {
    query = query.or("marketing_opt_out.is.null,marketing_opt_out.eq.false");
  }
  if (f.ownerNames && f.ownerNames.length > 0) {
    query = query.in("contact_owner_name", f.ownerNames);
  }
  if (f.sources && f.sources.length > 0) {
    query = query.in("source", f.sources);
  }
  if (f.createdAfter) {
    query = query.gte("created_at", f.createdAfter);
  }
  if (f.createdBefore) {
    query = query.lt("created_at", f.createdBefore);
  }
  if (f.search && f.search.trim()) {
    const term = `%${f.search.trim()}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`,
    );
  }

  // Deal inclusion (not exclusion) — apply via .in()
  if (patientIdFilter && f.hasDeal !== "none") {
    query = query.in("id", patientIdFilter);
  }

  query = query.order("created_at", { ascending: false }).limit(hardCap);
  if (opts.offset && opts.offset > 0) {
    query = query.range(opts.offset, opts.offset + hardCap - 1);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  let rows = (data ?? []) as PatientRow[];

  // Deal exclusion (we had to fetch and filter in memory)
  if (patientIdFilter && f.hasDeal === "none") {
    const excludeSet = new Set(patientIdFilter);
    rows = rows.filter((r) => !excludeSet.has(r.id));
  }

  // DOB-month filter (must be done in JS — dob is a date, Supabase can't easily extract month)
  if (f.dobMonth && f.dobMonth >= 1 && f.dobMonth <= 12) {
    rows = rows.filter((r) => {
      if (!r.dob) return false;
      const d = new Date(r.dob);
      if (Number.isNaN(d.getTime())) return false;
      return d.getUTCMonth() + 1 === f.dobMonth;
    });
  }

  return { rows, count: count ?? rows.length };
}

/**
 * Substitute {{patient.first_name}} (and tolerant variants) in the given string
 * using values from the patient row.
 */
export function substitutePatientVariables(
  input: string,
  patient: PatientRow,
): string {
  if (!input) return "";
  const fullName = [patient.first_name, patient.last_name].filter(Boolean).join(" ");
  const vars: Record<string, string> = {
    "patient.first_name": patient.first_name ?? "",
    "patient.last_name": patient.last_name ?? "",
    "patient.full_name": fullName,
    "patient.name": fullName,
    "patient.email": patient.email ?? "",
    "patient.phone": patient.phone ?? "",
    // Friendly aliases
    "first_name": patient.first_name ?? "",
    "firstname": patient.first_name ?? "",
    "firstName": patient.first_name ?? "",
    "last_name": patient.last_name ?? "",
    "lastname": patient.last_name ?? "",
    "lastName": patient.last_name ?? "",
    "full_name": fullName,
    "fullname": fullName,
    "fullName": fullName,
    "name": fullName,
    "email": patient.email ?? "",
    "phone": patient.phone ?? "",
  };

  // Match ONE-OR-MORE opening braces, a variable key (letters/digits/_./space),
  // then ONE-OR-MORE closing braces. This tolerates `{x}`, `{{x}}`, `{x}}`, `{{x}`.
  return input.replace(/\{+\s*([a-zA-Z0-9_.]+)\s*\}+/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    return match;
  });
}
