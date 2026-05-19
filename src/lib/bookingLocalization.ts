export type BookingLanguage = "en" | "fr";

export interface LocalizedBookingText {
  name: string;
  name_en?: string | null;
  description?: string | null;
  description_en?: string | null;
}

export function getLocalizedBookingName(item: LocalizedBookingText, language: BookingLanguage): string {
  if (language === "en" && item.name_en?.trim()) {
    return item.name_en.trim();
  }

  return item.name;
}

export function getLocalizedBookingDescription(item: LocalizedBookingText, language: BookingLanguage): string {
  if (language === "en" && item.description_en?.trim()) {
    return item.description_en.trim();
  }

  return item.description?.trim() || "";
}
