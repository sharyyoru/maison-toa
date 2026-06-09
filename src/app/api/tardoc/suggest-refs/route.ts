import { NextRequest, NextResponse } from "next/server";
import {
  searchAdditionalServices,
  searchByCode,
  type SumexLanguage,
  type TardocServiceRecord,
} from "@/lib/sumexTardoc";

export const runtime = "nodejs";

/**
 * POST /api/tardoc/suggest-refs
 *
 * Body:  { codes: string[], lang?: 1 | 2 | 3 }
 *
 *   `codes` is the ORDERED list of TARDOC codes on an invoice (sort_order).
 *   The order matters because the Zuschlag (additional service) lookup walks
 *   *previously*-added codes to discover a valid base.
 *
 * Returns:
 *   {
 *     success: true,
 *     data: Array<{
 *       code: string,
 *       suggestedRef: string,
 *       source: "masterCode" | "additionalService" | "standalone" | "unknown",
 *       baseCode?: string,    // when source = "additionalService"
 *       name?: string,
 *     }>
 *   }
 *
 * Algorithm (verbatim from tardocvalidator100.chm):
 *
 *   1. Catalog-lookup the code (ISearch::SearchCode + GetServices, find exact).
 *      If `MasterCode` is non-empty → suggestedRef = MasterCode, source =
 *      "masterCode". Per chm:ISearch::MasterCode — "The parent code of the
 *      service code, if the service code is a slave. Otherwise empty."
 *
 *   2. Otherwise walk previously-supplied codes most-recent-first. For each
 *      prior code, run ISearch::SearchAdditionalService(prior) and look for
 *      our code in the result list. If found → suggestedRef =
 *      AdditionalServiceReferenceCode of that result row, source =
 *      "additionalService", baseCode = prior. Per chm:ISearch::SearchAdditionalService
 *      — "When retrieving the service record from the result list, call the
 *      property AdditionalServiceReferenceCode to get the proper reference
 *      code."
 *
 *   3. Otherwise source = "standalone", suggestedRef = "".
 *
 *   4. Codes that fail catalog lookup entirely return source = "unknown".
 *
 * NB: This route does not commit anything. The caller must apply the
 *     suggestions and re-validate via IValidate::AddService.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { codes?: unknown; lang?: number };
    const codes = Array.isArray(body.codes)
      ? (body.codes as unknown[]).filter((c): c is string => typeof c === "string" && c.length > 0)
      : [];
    const lang = ((body.lang ?? 2) as SumexLanguage);

    if (codes.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Cache catalog records per unique code (one searchByCode per code).
    const exactCache = new Map<string, TardocServiceRecord | null>();
    async function lookupExact(code: string): Promise<TardocServiceRecord | null> {
      if (exactCache.has(code)) return exactCache.get(code) ?? null;
      try {
        const res = await searchByCode(code, false, lang);
        const exact = res.services.find((s) => s.code === code) ?? null;
        exactCache.set(code, exact);
        return exact;
      } catch (err) {
        console.error(`[suggest-refs] catalog lookup failed for ${code}:`, err);
        exactCache.set(code, null);
        return null;
      }
    }

    // Cache additional-service result lists per base (one SearchAdditionalService
    // per unique base). Each entry maps additionalCode → AdditionalServiceReferenceCode.
    const additionalsCache = new Map<string, Map<string, string>>();
    async function getAdditionalsFor(baseCode: string): Promise<Map<string, string>> {
      const cached = additionalsCache.get(baseCode);
      if (cached) return cached;
      const m = new Map<string, string>();
      try {
        const res = await searchAdditionalServices(baseCode, lang);
        for (const svc of res.services) {
          // Per chm: AdditionalServiceReferenceCode is the proper reference
          // code for the additional service in this base's context.
          m.set(svc.code, svc.additionalServiceReferenceCode || baseCode);
        }
      } catch (err) {
        console.error(
          `[suggest-refs] SearchAdditionalService failed for ${baseCode}:`,
          err,
        );
      }
      additionalsCache.set(baseCode, m);
      return m;
    }

    type Suggestion = {
      code: string;
      suggestedRef: string;
      source: "masterCode" | "additionalService" | "standalone" | "unknown";
      baseCode?: string;
      name?: string;
    };

    const out: Suggestion[] = [];

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];

      // Step 1: catalog → MasterCode
      const exact = await lookupExact(code);
      if (!exact) {
        out.push({ code, suggestedRef: "", source: "unknown" });
        continue;
      }
      if (exact.masterCode && exact.masterCode.trim() !== "") {
        out.push({
          code,
          suggestedRef: exact.masterCode,
          source: "masterCode",
          name: exact.name,
        });
        continue;
      }

      // Step 2: walk priors most-recent-first, looking for `code` in each
      // prior's SearchAdditionalService list.
      let matched: { ref: string; base: string } | null = null;
      for (let j = i - 1; j >= 0 && !matched; j--) {
        const prior = codes[j];
        if (!prior || prior === code) continue;
        const map = await getAdditionalsFor(prior);
        if (map.has(code)) {
          matched = { ref: map.get(code) || prior, base: prior };
        }
      }
      if (matched) {
        out.push({
          code,
          suggestedRef: matched.ref,
          source: "additionalService",
          baseCode: matched.base,
          name: exact.name,
        });
        continue;
      }

      // Step 3: standalone main service
      out.push({ code, suggestedRef: "", source: "standalone", name: exact.name });
    }

    return NextResponse.json({ success: true, data: out });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
