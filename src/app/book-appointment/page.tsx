import { DEFAULT_BOOKING_PAGES } from "@/components/PageBuilder/types";
import type { PageConfig } from "@/components/PageBuilder/types";
import { mergePageConfig } from "@/lib/bookingPageConfig";
import {
  normalizeCustomLandingSettings,
  type CustomLandingPageSettings,
} from "@/lib/customLandingPage";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import BookAppointmentContent from "./BookAppointmentContent";

export const dynamic = "force-dynamic";

async function getLandingPageData(): Promise<{
  pageConfig: PageConfig;
  customPageSettings: CustomLandingPageSettings;
}> {
  const defaultConfig = DEFAULT_BOOKING_PAGES.landing;

  const { data, error } = await supabaseAdmin
    .from("site_settings")
    .select("key,value")
    .in("key", [
      "booking_pages_config",
      "booking_page_config",
      "booking_landing_custom_page",
    ]);

  if (error) {
    console.error("Failed to load booking landing page config:", error.message);
    return {
      pageConfig: defaultConfig,
      customPageSettings: normalizeCustomLandingSettings(null),
    };
  }

  const settings = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  const savedConfig =
    settings.booking_pages_config?.landing ?? settings.booking_page_config;

  return {
    pageConfig:
      savedConfig?.sections && Array.isArray(savedConfig.sections)
        ? mergePageConfig(defaultConfig, savedConfig)
        : defaultConfig,
    customPageSettings: normalizeCustomLandingSettings(
      settings.booking_landing_custom_page
    ),
  };
}

export default async function BookAppointmentPage() {
  const { pageConfig, customPageSettings } = await getLandingPageData();

  return (
    <BookAppointmentContent
      initialConfig={pageConfig}
      customPageSettings={customPageSettings}
    />
  );
}
