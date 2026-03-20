import { NextRequest, NextResponse } from "next/server";
import {
  getChapters,
  getSections,
  getServiceGroups,
  searchByCode,
  searchByChapter,
  searchByServiceGroup,
  getSessionInfo,
  invalidateSession,
  calculatePrice,
  type SumexLanguage,
  type TardocServiceRecord,
} from "@/lib/sumexTardoc";
import { CANTON_TAX_POINT_VALUES, DEFAULT_CANTON, type SwissCanton } from "@/lib/tardoc";

export const runtime = "nodejs";

/**
 * GET /api/tardoc/sumex
 *
 * Live TARDOC catalog from Sumex1 Validator API.
 *
 * Query params:
 *   action:     "chapters" | "sections" | "serviceGroups" | "searchCode" | "searchChapter" | "searchServiceGroup" | "info" | "refresh"
 *   code:       TARDOC code for searchCode (e.g. "AA.00")
 *   chapter:    Chapter code for searchChapter (e.g. "TA.10")
 *   group:      Service group code for searchServiceGroup
 *   mainOnly:   "1" to return only main services (default "0")
 *   lang:       "1"=DE, "2"=FR (default), "3"=IT
 *   canton:     Swiss canton code for price calc (default "GE")
 *   parent:     Parent code for chapters (default "" = root)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const action = sp.get("action") || "chapters";
    const lang = (Number(sp.get("lang")) || 2) as SumexLanguage;
    const canton = (sp.get("canton") || DEFAULT_CANTON) as SwissCanton;
    const taxPointValue = CANTON_TAX_POINT_VALUES[canton] ?? CANTON_TAX_POINT_VALUES[DEFAULT_CANTON];

    switch (action) {
      // ----------------------------------------------------------------
      // Catalog: browse chapters
      // ----------------------------------------------------------------
      case "chapters": {
        const parent = sp.get("parent") || "";
        const chapters = await getChapters(parent, lang);
        return NextResponse.json({ success: true, data: chapters });
      }

      // ----------------------------------------------------------------
      // Catalog: sections
      // ----------------------------------------------------------------
      case "sections": {
        const sections = await getSections(lang);
        return NextResponse.json({ success: true, data: sections });
      }

      // ----------------------------------------------------------------
      // Catalog: service groups
      // ----------------------------------------------------------------
      case "serviceGroups": {
        const groups = await getServiceGroups(lang);
        return NextResponse.json({ success: true, data: groups });
      }

      // ----------------------------------------------------------------
      // Search by code (e.g. "AA.00" returns all services matching that code prefix)
      // ----------------------------------------------------------------
      case "searchCode": {
        const code = sp.get("code");
        if (!code) {
          return NextResponse.json(
            { success: false, error: "code parameter is required" },
            { status: 400 },
          );
        }
        const mainOnly = sp.get("mainOnly") === "1";
        const result = await searchByCode(code, mainOnly, lang);
        const enriched = enrichServices(result.services, taxPointValue);
        return NextResponse.json({
          success: true,
          data: enriched,
          meta: { count: result.count, canton, taxPointValue },
        });
      }

      // ----------------------------------------------------------------
      // Search by chapter
      // ----------------------------------------------------------------
      case "searchChapter": {
        const chapter = sp.get("chapter");
        if (!chapter) {
          return NextResponse.json(
            { success: false, error: "chapter parameter is required" },
            { status: 400 },
          );
        }
        const mainOnly = sp.get("mainOnly") === "1";
        const result = await searchByChapter(chapter, mainOnly, lang);
        const enriched = enrichServices(result.services, taxPointValue);
        return NextResponse.json({
          success: true,
          data: enriched,
          meta: { count: result.count, canton, taxPointValue },
        });
      }

      // ----------------------------------------------------------------
      // Search by service group
      // ----------------------------------------------------------------
      case "searchServiceGroup": {
        const group = sp.get("group");
        if (!group) {
          return NextResponse.json(
            { success: false, error: "group parameter is required" },
            { status: 400 },
          );
        }
        const mainOnly = sp.get("mainOnly") === "1";
        const result = await searchByServiceGroup(group, mainOnly, lang);
        const enriched = enrichServices(result.services, taxPointValue);
        return NextResponse.json({
          success: true,
          data: enriched,
          meta: { count: result.count, canton, taxPointValue },
        });
      }

      // ----------------------------------------------------------------
      // Session info (DB version, etc.)
      // ----------------------------------------------------------------
      case "info": {
        const info = await getSessionInfo(lang);
        return NextResponse.json({ success: true, data: info });
      }

      // ----------------------------------------------------------------
      // Force refresh session
      // ----------------------------------------------------------------
      case "refresh": {
        invalidateSession();
        const info = await getSessionInfo(lang);
        return NextResponse.json({ success: true, data: info, message: "Session refreshed" });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Error in /api/tardoc/sumex:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

type EnrichedService = TardocServiceRecord & {
  priceCHF: number;
  priceMT: number;
  priceTT: number;
};

function enrichServices(
  services: TardocServiceRecord[],
  taxPointValue: number,
): EnrichedService[] {
  return services.map((svc) => ({
    ...svc,
    priceCHF: calculatePrice(svc.tpMT, svc.tpTT, taxPointValue),
    priceMT: Math.round(svc.tpMT * taxPointValue * 100) / 100,
    priceTT: Math.round(svc.tpTT * taxPointValue * 100) / 100,
  }));
}
