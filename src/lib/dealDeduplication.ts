import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deal Deduplication Utility
 * 
 * Prevents duplicate deal creation by checking if a deal
 * already exists for the same patient within a short time window.
 * Uses exact matches only — no fuzzy/ilike matching.
 */

export type DealCheckParams = {
  patientId: string;
  serviceId?: string | null;
  withinHours?: number; // Default: 3.5 months (2520 hours)
};

export type ExistingDeal = {
  id: string;
  title: string;
  created_at: string;
  service_id: string | null;
};

/**
 * Check if a deal already exists for this patient within a short window.
 * 
 * A deal is considered duplicate if:
 * 1. Same patient_id
 * 2. Same service_id (exact match, if provided)
 * 3. Created within the specified time window (default 3.5 months)
 * 
 * If no serviceId is provided, checks for ANY recent deal for this patient.
 */
export async function findRecentDeal(
  supabase: SupabaseClient,
  params: DealCheckParams
): Promise<ExistingDeal | null> {
  const { patientId, serviceId, withinHours = 2520 } = params;

  // Calculate the cutoff date
  const cutoffDate = new Date();
  cutoffDate.setTime(cutoffDate.getTime() - withinHours * 60 * 60 * 1000);
  const cutoffIso = cutoffDate.toISOString();

  // Build query: same patient, within time window
  let query = supabase
    .from("deals")
    .select("id, title, created_at, service_id")
    .eq("patient_id", patientId)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(1);

  // If we have a service_id, check for exact match
  if (serviceId) {
    query = query.eq("service_id", serviceId);
  }

  const { data } = await query.maybeSingle();

  return data as ExistingDeal | null;
}

/**
 * Check if a deal should be created or if it's a duplicate.
 * Returns { shouldCreate: true } or { shouldCreate: false, existingDeal }
 */
export async function shouldCreateDeal(
  supabase: SupabaseClient,
  params: DealCheckParams
): Promise<{ shouldCreate: true } | { shouldCreate: false; existingDeal: ExistingDeal }> {
  const existingDeal = await findRecentDeal(supabase, params);

  if (existingDeal) {
    return { shouldCreate: false, existingDeal };
  }

  return { shouldCreate: true };
}
