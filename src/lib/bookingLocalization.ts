export type BookingLanguage = "en" | "fr";

export interface LocalizedBookingName {
  name: string;
  name_en?: string | null;
}

export function getLocalizedBookingName(item: LocalizedBookingName, language: BookingLanguage): string {
  if (language === "en" && item.name_en?.trim()) {
    return item.name_en.trim();
  }

  return item.name;
}
