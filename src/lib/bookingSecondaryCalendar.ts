import type { SupabaseClient } from "@supabase/supabase-js";
import type { SecondaryCalendarPosition } from "@/lib/bookingCalendarIntervals";

export type BookingSecondaryCalendarContext = {
  categoryId: string | null;
  categoryName: string | null;
  treatmentId: string | null;
  primaryDurationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  secondaryCalendar: {
    providerId: string;
    providerName: string;
    durationMinutes: number;
    position: SecondaryCalendarPosition;
  } | null;
};

type ResolveParams = {
  treatmentId?: string | null;
  categorySlug?: string | null;
  patientType?: string | null;
};

type CategoryRow = {
  id: string;
  name: string | null;
  booking_duration_minutes?: number | null;
  secondary_calendar_provider_id: string | null;
  secondary_calendar_duration_minutes: number | null;
  secondary_calendar_position: SecondaryCalendarPosition;
};

export async function resolveBookingSecondaryCalendar(
  supabase: SupabaseClient,
  { treatmentId, categorySlug, patientType }: ResolveParams,
): Promise<BookingSecondaryCalendarContext> {
  let category: CategoryRow | null = null;
  let resolvedTreatmentId: string | null = null;
  let primaryDurationMinutes = 60;
  let bufferBeforeMinutes = 0;
  let bufferAfterMinutes = 0;
  let targetProviderId: string | null = null;
  let targetDurationMinutes: number | null = null;
  let targetPosition: SecondaryCalendarPosition = "start";

  if (treatmentId && treatmentId !== "none") {
    const { data: treatment } = await supabase
      .from("booking_treatments")
      .select(`
        id,
        category_id,
        duration_minutes,
        buffer_before_minutes,
        buffer_after_minutes,
        secondary_calendar_mode,
        secondary_calendar_provider_id,
        secondary_calendar_duration_minutes,
        secondary_calendar_position,
        booking_categories:category_id(
          id,
          name,
          booking_duration_minutes,
          secondary_calendar_provider_id,
          secondary_calendar_duration_minutes,
          secondary_calendar_position
        )
      `)
      .eq("id", treatmentId)
      .maybeSingle();

    if (treatment) {
      resolvedTreatmentId = treatment.id;
      primaryDurationMinutes = treatment.duration_minutes || 60;
      bufferBeforeMinutes = treatment.buffer_before_minutes || 0;
      bufferAfterMinutes = treatment.buffer_after_minutes || 0;
      category = (Array.isArray(treatment.booking_categories)
        ? treatment.booking_categories[0]
        : treatment.booking_categories) as CategoryRow | null;

      if (treatment.secondary_calendar_mode === "custom") {
        targetProviderId = treatment.secondary_calendar_provider_id;
        targetDurationMinutes = treatment.secondary_calendar_duration_minutes;
        targetPosition = treatment.secondary_calendar_position || "start";
      } else if (treatment.secondary_calendar_mode !== "disabled") {
        targetProviderId = category?.secondary_calendar_provider_id ?? null;
        targetDurationMinutes = category?.secondary_calendar_duration_minutes ?? null;
        targetPosition = category?.secondary_calendar_position || "start";
      }
    }
  }

  if (!category && categorySlug) {
    let categoryQuery = supabase
      .from("booking_categories")
      .select("id, name, booking_duration_minutes, secondary_calendar_provider_id, secondary_calendar_duration_minutes, secondary_calendar_position")
      .eq("slug", categorySlug);
    if (patientType) categoryQuery = categoryQuery.eq("patient_type", patientType);
    const { data } = await categoryQuery.limit(1).maybeSingle();
    category = data as CategoryRow | null;
    primaryDurationMinutes = category?.booking_duration_minutes || 60;
    targetProviderId = category?.secondary_calendar_provider_id ?? null;
    targetDurationMinutes = category?.secondary_calendar_duration_minutes ?? null;
    targetPosition = category?.secondary_calendar_position || "start";
  }

  let secondaryCalendar: BookingSecondaryCalendarContext["secondaryCalendar"] = null;
  if (targetProviderId && targetDurationMinutes) {
    const { data: provider } = await supabase
      .from("providers")
      .select("id, name")
      .eq("id", targetProviderId)
      .in("role", ["doctor", "nurse", "technician"])
      .maybeSingle();
    if (provider) {
      secondaryCalendar = {
        providerId: provider.id,
        providerName: provider.name,
        durationMinutes: targetDurationMinutes,
        position: targetPosition,
      };
    }
  }

  return {
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    treatmentId: resolvedTreatmentId,
    primaryDurationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    secondaryCalendar,
  };
}
