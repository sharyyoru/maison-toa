import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, locales, LOCALE_COOKIE_NAME, type AppLocale } from "./routing";

/**
 * next-intl request config. Reads the locale from the NEXT_LOCALE cookie and
 * loads the matching messages bundle from src/messages/<locale>.json.
 *
 * Falls back to the default locale (English) if the cookie is missing or
 * holds an unsupported value.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale: AppLocale = locales.includes(cookieLocale as AppLocale)
    ? (cookieLocale as AppLocale)
    : defaultLocale;

  const messages = (await import(`@/messages/${locale}.json`)).default;
  return { locale, messages };
});
