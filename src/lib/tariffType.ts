/**
 * Derive the official Forum-Datenaustausch tariff type for a line item from
 * `invoice_line_items` (or any equivalent shape) when emitting a Sumex1
 * `generalInvoiceRequest 5.00` XML.
 *
 * Why a dedicated helper:
 *   The schema has both `tariff_code` (integer, e.g. 5/7) and a stored
 *   `catalog_name` (text, e.g. "ACF" / "TMA" / "TARDOC" / "MATERIEL").
 *   `tariff_code = 5` is shared between ACF (`005`) and TMA gestures, and
 *   `tariff_code = 7` is shared between TARDOC (`007`) and TMA. Going by
 *   `tariff_code` alone misclassifies TMA gestures as ACF/TARDOC, which the
 *   recipient insurer will reject as a cumulation violation
 *   (e.g. "Cumul: impossible de décompter G|T_005_005").
 *
 * Resolution priority (most authoritative first):
 *   1. `tariff_type` column if present and non-empty.
 *   2. `catalog_name` mapping:
 *        "ACF"      -> "005"
 *        "TMA"      -> "TMA"
 *        "TARDOC"   -> "007"
 *        "MATERIEL" -> "406"
 *   3. `tariff_code` zero-padded to 3 digits (legacy fallback).
 *   4. "590" (manual / custom fallback).
 *
 * The function is intentionally permissive on the input shape so it can be
 * called from any of the consumer routes (`send-invoice`, `check-xml`,
 * `generate-pdf`, etc.) without coupling to a specific row type.
 */
export type TariffTypeInput = {
  tariff_type?: string | null;
  tariff_code?: number | string | null;
  catalog_name?: string | null;
};

const CATALOG_TO_TARIFF: Record<string, string> = {
  ACF:      "005",
  TMA:      "TMA",
  TARDOC:   "007",
  MATERIEL: "406",
};

export function deriveTariffType(item: TariffTypeInput): string {
  // 1. Explicit tariff_type wins
  const explicit = (item.tariff_type ?? "").toString().trim();
  if (explicit !== "") return explicit;

  // 2. catalog_name mapping
  const cat = (item.catalog_name ?? "").toString().trim().toUpperCase();
  if (cat && CATALOG_TO_TARIFF[cat]) return CATALOG_TO_TARIFF[cat];

  // 3. tariff_code zero-padded
  const tc = item.tariff_code;
  if (tc !== undefined && tc !== null && tc !== "") {
    const s = String(tc).trim();
    if (s !== "") return s.padStart(3, "0");
  }

  // 4. Manual / custom fallback
  return "590";
}
