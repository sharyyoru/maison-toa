"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

const COOKIE_NAME = "NEXT_LOCALE";
// Persist the choice for one year. The cookie is read by next-intl on the
// server in src/i18n/request.ts to pick the active locale.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Pill toggle that flips the CRM UI between English and French. Writes the
 * `NEXT_LOCALE` cookie and triggers a router refresh so server components
 * re-render with the new messages bundle.
 *
 * NOTE: This is a CRM-only toggle. The public booking flow continues to use
 * the legacy `@/contexts/LanguageContext` system.
 */
export default function CrmLanguageToggle() {
  const locale = useLocale();
  const t = useTranslations("header");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setLocale(next: "en" | "fr") {
    if (next === locale) return;
    document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  const isEn = locale === "en";

  return (
    <button
      type="button"
      onClick={() => setLocale(isEn ? "fr" : "en")}
      disabled={pending}
      title={isEn ? t("switchToFrench") : t("switchToEnglish")}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isEn ? (
        <>
          <svg className="h-4 w-4 overflow-hidden rounded-sm" viewBox="0 0 640 480" aria-hidden="true">
            <g fillRule="evenodd">
              <path fill="#012169" d="M0 0h640v480H0z" />
              <path
                fill="#FFF"
                d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0h75z"
              />
              <path
                fill="#C8102E"
                d="m424 281 216 159v40L369 281h55zm-184 20 6 35L54 480H0l240-179zM640 0v3L391 191l2-44L590 0h50zM0 0l239 176h-60L0 42V0z"
              />
              <path fill="#FFF" d="M241 0v480h160V0H241zM0 160v160h640V160H0z" />
              <path fill="#C8102E" d="M0 193v96h640v-96H0zM273 0v480h96V0h-96z" />
            </g>
          </svg>
          <span>EN</span>
        </>
      ) : (
        <>
          <svg className="h-4 w-4 overflow-hidden rounded-sm" viewBox="0 0 640 480" aria-hidden="true">
            <g fillRule="evenodd" strokeWidth="1pt">
              <path fill="#fff" d="M0 0h640v480H0z" />
              <path fill="#00267f" d="M0 0h213.3v480H0z" />
              <path fill="#f31830" d="M426.7 0H640v480H426.7z" />
            </g>
          </svg>
          <span>FR</span>
        </>
      )}
    </button>
  );
}
