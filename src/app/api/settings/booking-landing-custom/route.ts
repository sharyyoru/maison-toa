import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_CUSTOM_LANDING_SETTINGS,
  normalizeCustomLandingSettings,
  type CustomLandingLanguage,
  type CustomLandingPageSettings,
} from "@/lib/customLandingPage";
import {
  sanitizeCustomLandingCss,
  sanitizeCustomLandingHtml,
} from "@/lib/sanitizeCustomLandingPage";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SETTINGS_KEY = "booking_landing_custom_page";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };

async function loadSettings() {
  const { data, error } = await supabaseAdmin
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) throw error;
  return normalizeCustomLandingSettings(data?.value as Partial<CustomLandingPageSettings> | null);
}

async function saveSettings(settings: CustomLandingPageSettings) {
  const { error } = await supabaseAdmin.from("site_settings").upsert(
    { key: SETTINGS_KEY, value: settings, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw error;
}

export async function GET() {
  try {
    return NextResponse.json(await loadSettings(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to load custom booking landing page:", error);
    return NextResponse.json(DEFAULT_CUSTOM_LANDING_SETTINGS, { headers: NO_STORE_HEADERS });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = await loadSettings();

    if (body.action === "saveDraft") {
      const language = body.language as CustomLandingLanguage;
      if (!(["en", "fr"] as string[]).includes(language)) {
        return NextResponse.json({ error: "Invalid language." }, { status: 400 });
      }
      if (!body.projectData || typeof body.html !== "string" || typeof body.css !== "string") {
        return NextResponse.json({ error: "Project data, HTML and CSS are required." }, { status: 400 });
      }
      settings.drafts[language] = {
        projectData: body.projectData,
        html: body.html,
        css: body.css,
        updatedAt: new Date().toISOString(),
      };
      await saveSettings(settings);
      return NextResponse.json(settings, { headers: NO_STORE_HEADERS });
    }

    if (body.action === "publish") {
      if (!settings.drafts.en || !settings.drafts.fr) {
        return NextResponse.json(
          { error: "Save both the English and French drafts before publishing." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      const publishedAt = new Date().toISOString();
      settings.published = {
        en: {
          html: sanitizeCustomLandingHtml(settings.drafts.en.html),
          css: sanitizeCustomLandingCss(settings.drafts.en.css),
          publishedAt,
        },
        fr: {
          html: sanitizeCustomLandingHtml(settings.drafts.fr.html),
          css: sanitizeCustomLandingCss(settings.drafts.fr.css),
          publishedAt,
        },
      };
      settings.activeMode = "custom";
      settings.publishedAt = publishedAt;
      await saveSettings(settings);
      return NextResponse.json(settings, { headers: NO_STORE_HEADERS });
    }

    if (body.action === "useVisual") {
      settings.activeMode = "visual";
      await saveSettings(settings);
      return NextResponse.json(settings, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    console.error("Failed to update custom booking landing page:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update custom landing page." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
