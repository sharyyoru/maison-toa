import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthorizedBookingDoctors = {
  /** Enabled booking doctors allowed for the treatment/category, in display order. */
  doctors: any[];
  /** Where the list came from; "none" means nobody is assigned. */
  source: "treatment" | "category" | "none";
};

async function enabledAssignedDoctors(
  supabase: SupabaseClient,
  table: "booking_treatment_doctors" | "booking_category_doctors",
  column: "treatment_id" | "category_id",
  id: string,
): Promise<any[] | null> {
  const { data, error } = await supabase
    .from(table)
    .select("doctor_id, order_index, booking_doctors(*)")
    .eq(column, id)
    .order("order_index", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data
    .map((assignment: any) => assignment.booking_doctors)
    .filter((doctor: any) => doctor && doctor.enabled);
}

/**
 * Practitioners allowed to perform a treatment online: the treatment's own
 * assignments, otherwise its category's assignments. A treatment with no
 * assignment at either level has no authorized practitioner — it must never
 * fall back to every enabled doctor.
 */
export async function getAuthorizedBookingDoctors(
  supabase: SupabaseClient,
  { treatmentId, categoryId }: { treatmentId?: string | null; categoryId?: string | null },
): Promise<AuthorizedBookingDoctors> {
  let resolvedCategoryId = categoryId ?? null;

  if (treatmentId && treatmentId !== "none") {
    const treatmentDoctors = await enabledAssignedDoctors(
      supabase,
      "booking_treatment_doctors",
      "treatment_id",
      treatmentId,
    );
    if (treatmentDoctors) return { doctors: treatmentDoctors, source: "treatment" };

    if (!resolvedCategoryId) {
      const { data: treatment, error } = await supabase
        .from("booking_treatments")
        .select("category_id")
        .eq("id", treatmentId)
        .maybeSingle();
      if (error) throw error;
      resolvedCategoryId = treatment?.category_id ?? null;
    }
  }

  if (resolvedCategoryId) {
    const categoryDoctors = await enabledAssignedDoctors(
      supabase,
      "booking_category_doctors",
      "category_id",
      resolvedCategoryId,
    );
    if (categoryDoctors) return { doctors: categoryDoctors, source: "category" };
  }

  return { doctors: [], source: "none" };
}
