import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TardocTaxPointCatalog } from "@/lib/tardocTaxPoints";

/**
 * TARDOC catalog tax points for lines whose tp components were not populated
 * at creation (stored 0/null). Used by send-invoice, generate-pdf and
 * check-xml through the shared line mapper so every output prices identically.
 * Server-side only (service-role client).
 */
export async function loadTardocCatalog(
  lineItems: Array<{
    tariff_code?: number | string | null;
    code?: string | null;
    tp_al?: number | null;
    tp_tl?: number | null;
  }>,
): Promise<Record<string, TardocTaxPointCatalog>> {
  const codes = [...new Set(
    lineItems
      .filter((it) => Number(it.tariff_code) === 7 && (!((it.tp_al ?? 0) > 0) || !((it.tp_tl ?? 0) > 0)))
      .map((it) => it.code)
      .filter((c): c is string => Boolean(c)),
  )];
  const catalog: Record<string, TardocTaxPointCatalog> = {};
  if (codes.length === 0) return catalog;
  const { data } = await supabaseAdmin
    .from("tardoc_group_items")
    .select("tardoc_code, tp_mt, tp_tt")
    .in("tardoc_code", codes);
  for (const row of data ?? []) {
    if (row.tardoc_code && !catalog[row.tardoc_code]) {
      catalog[row.tardoc_code] = { tpMt: row.tp_mt ?? 0, tpTt: row.tp_tt ?? 0 };
    }
  }
  return catalog;
}

export type LocalTardocCode = {
  recordId: number;
  code: string;
  name: string;
  tpMT: number;
  tpTT: number;
  section: string | null;
};

/**
 * Code search used when the Sumex TARDOC validator is unreachable.
 *
 * Covers only codes the clinic already has in its saved TARDOC groups — each
 * of which was taken from the Sumex catalog when it was online. It is a
 * degraded fallback, not the full catalog; the API flags it as such.
 */
export async function searchLocalTardocCodes(query: string, limit = 50): Promise<LocalTardocCode[]> {
  const q = query.trim().replace(/[%_,()]/g, "");
  if (!q) return [];
  const { data } = await supabaseAdmin
    .from("tardoc_group_items")
    .select("tardoc_code, description, tp_mt, tp_tt, tariff_type")
    .or(`tardoc_code.ilike.${q}%,description.ilike.%${q}%`)
    .limit(500);
  const byCode = new Map<string, LocalTardocCode>();
  for (const row of data ?? []) {
    const code: string = row.tardoc_code || "";
    if (!code || /^(mat|acf|tma):/.test(code) || (row.tariff_type && row.tariff_type !== "007")) continue;
    if (byCode.has(code)) continue;
    byCode.set(code, {
      recordId: 0,
      code,
      name: row.description || code,
      tpMT: Number(row.tp_mt) || 0,
      tpTT: Number(row.tp_tt) || 0,
      section: null,
    });
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code)).slice(0, limit);
}
