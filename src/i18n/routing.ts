/**
 * next-intl routing config for the internal CRM.
 *
 * We use a cookie-based locale (no URL prefix) so existing routes like
 * /appointments, /patients, /services keep working unchanged. The locale is
 * stored in the `NEXT_LOCALE` cookie and read server-side in i18n/request.ts.
 */
export const locales = ["en", "fr"] as const;
export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
