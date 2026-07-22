export type CustomLandingLanguage = "en" | "fr";

export interface CustomLandingDraft {
  projectData: Record<string, unknown>;
  html: string;
  css: string;
  updatedAt: string;
}

export interface CustomLandingPublishedPage {
  html: string;
  css: string;
  publishedAt: string;
}

export interface CustomLandingPageSettings {
  activeMode: "visual" | "custom";
  drafts: Record<CustomLandingLanguage, CustomLandingDraft | null>;
  published: Record<CustomLandingLanguage, CustomLandingPublishedPage | null>;
  publishedAt: string | null;
}

export const DEFAULT_CUSTOM_LANDING_SETTINGS: CustomLandingPageSettings = {
  activeMode: "visual",
  drafts: { en: null, fr: null },
  published: { en: null, fr: null },
  publishedAt: null,
};

const STARTER_COPY = {
  en: {
    title: "Welcome to Maison Tōa",
    body: "A contemporary clinic for aesthetic medicine, plastic surgery and expert care in Lausanne.",
    button: "Book an appointment",
  },
  fr: {
    title: "Bienvenue chez Maison Tōa",
    body: "Une clinique contemporaine de médecine esthétique, de chirurgie plastique et de soins experts à Lausanne.",
    button: "Prendre rendez-vous",
  },
} satisfies Record<CustomLandingLanguage, Record<string, string>>;

export function getCustomLandingStarter(language: CustomLandingLanguage) {
  const copy = STARTER_COPY[language];

  return {
    html: `<main class="toa-page">
  <section class="toa-hero">
    <img class="toa-logo" src="/logos/maisontoa-logo.png" alt="Maison Tōa" />
    <div class="toa-content">
      <p class="toa-eyebrow">Maison Tōa · Lausanne</p>
      <h1>${copy.title}</h1>
      <p class="toa-description">${copy.body}</p>
      <a class="toa-button" href="/book-appointment/first-visit">${copy.button}</a>
    </div>
  </section>
</main>`,
    css: `* { box-sizing: border-box; }
body { margin: 0; color: #0f172a; font-family: Arial, sans-serif; }
.toa-page { min-height: 100vh; background: linear-gradient(135deg, #f8fafc, #ffffff 55%, #eef2f7); }
.toa-hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 72px 24px; text-align: center; }
.toa-logo { width: min(280px, 62vw); height: auto; margin-bottom: 52px; }
.toa-content { max-width: 760px; }
.toa-eyebrow { margin: 0 0 18px; color: #64748b; font-size: 12px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(38px, 6vw, 70px); line-height: 1.05; letter-spacing: -.04em; }
.toa-description { margin: 26px auto 36px; max-width: 650px; color: #475569; font-size: clamp(17px, 2vw, 21px); line-height: 1.7; }
.toa-button { display: inline-block; padding: 16px 28px; border-radius: 999px; background: #0f172a; color: #fff; font-weight: 700; text-decoration: none; box-shadow: 0 12px 30px rgba(15, 23, 42, .2); }
.toa-button:hover { background: #1e293b; transform: translateY(-1px); }
@media (max-width: 640px) { .toa-hero { padding: 64px 20px; } .toa-logo { margin-bottom: 38px; } }`,
  };
}

export function normalizeCustomLandingSettings(
  value: Partial<CustomLandingPageSettings> | null | undefined
): CustomLandingPageSettings {
  return {
    activeMode: value?.activeMode === "custom" ? "custom" : "visual",
    drafts: {
      en: value?.drafts?.en ?? null,
      fr: value?.drafts?.fr ?? null,
    },
    published: {
      en: value?.published?.en ?? null,
      fr: value?.published?.fr ?? null,
    },
    publishedAt: value?.publishedAt ?? null,
  };
}

export function buildCustomPageDocument(html: string, css: string) {
  const safeCss = css.replace(/<\/style/gi, "<\\/style");
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><base target="_top" /><style>${safeCss}</style></head><body>${html}</body></html>`;
}
