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
