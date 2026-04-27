# CRM Translations (`next-intl`)

Source-of-truth message bundles for the internal CRM UI. The public booking
flow (`/book-appointment`, `/appointments/manage`) still uses the legacy
`@/contexts/LanguageContext` and is **not** managed here.

## Files

- `en.json` — English (default locale, source language).
- `fr.json` — French. Every key in `en.json` must exist here too.

## Conventions

- **Namespaces** are top-level keys grouped by surface area:
  - `nav.*` — sidebar navigation labels
  - `header.*` — top header (buttons, tooltips, toggles)
  - `common.*` — verbs and shared words reused everywhere (Save, Cancel, etc.)
  - `calendar.*` — appointments page (filters, modal, badges, status labels)
  - `patient.*` — patient profile pages
  - `services.*` — services + categories admin
- **Keys** are `camelCase` and short. Prefer specific keys over reusing.
- **Interpolation** uses ICU syntax: `"hello": "Hello {name}"`.
- **Pluralization** uses ICU plural: `"items": "{count, plural, =0 {no items} one {# item} other {# items}}"`.

## How it's wired

- Locale is stored in the `NEXT_LOCALE` cookie (no URL prefix).
- `src/i18n/request.ts` reads the cookie and loads the matching JSON bundle.
- `src/i18n/routing.ts` defines the supported locales (`en`, `fr`).
- `next.config.ts` is wrapped with `next-intl/plugin` pointing at `src/i18n/request.ts`.
- `src/components/CrmLanguageToggle.tsx` flips the cookie and refreshes the route.

## Adding a key

1. Add the key to `en.json` (source).
2. Add the matching translation to `fr.json`.
3. Use it in code:
   ```tsx
   import { useTranslations } from "next-intl";
   const t = useTranslations("nav");
   <span>{t("dashboard")}</span>
   ```
