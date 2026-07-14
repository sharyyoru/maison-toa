import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingDoctorCalendarLink = {
  bookingDoctorName: string;
  providerId: string | null;
  providerName: string | null;
};

/** Resolve the exact /appointments calendar selected on a booking doctor. */
export async function resolveBookingDoctorCalendar(
  supabase: SupabaseClient,
  doctorSlug: string
): Promise<BookingDoctorCalendarLink | null> {
  const { data: bookingDoctor } = await supabase
    .from("booking_doctors")
    .select("name, calendar_provider_id")
    .eq("slug", doctorSlug)
    .maybeSingle();

  if (!bookingDoctor) return null;

  if (!bookingDoctor.calendar_provider_id) {
    return {
      bookingDoctorName: bookingDoctor.name,
      providerId: null,
      providerName: null,
    };
  }

  const { data: provider } = await supabase
    .from("providers")
    .select("name")
    .eq("id", bookingDoctor.calendar_provider_id)
    .maybeSingle();

  return {
    bookingDoctorName: bookingDoctor.name,
    providerId: bookingDoctor.calendar_provider_id,
    providerName: provider?.name ?? null,
  };
}
