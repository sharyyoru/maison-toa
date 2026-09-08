export type TardocTaxPointInput = {
  tpAl?: number | null;
  tpTl?: number | null;
  tpAlValue?: number | null;
  tpTlValue?: number | null;
};

export type TardocTaxPointCatalog = {
  tpMt?: number | null;
  tpTt?: number | null;
};

export type TardocTaxPointResult = {
  tpAl: number;
  tpTl: number;
  tpAlValue: number;
  tpTlValue: number;
};

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveComponent(value: number | null | undefined, fallback: number | null | undefined): number {
  const direct = finiteNumber(value);
  const catalog = finiteNumber(fallback);
  // A stored value — including a deliberate zero (e.g. charge-free TARDOC
  // lines accompanying a surgery flat rate) — is authoritative. The catalog
  // is only used when the component was never stored (null/undefined/NaN).
  if (direct !== null) return direct;
  if (catalog !== null) return catalog;
  return 0;
}

function resolveValue(value: number | null | undefined): number {
  const resolved = finiteNumber(value);
  return resolved !== null && resolved > 0 ? resolved : 1;
}

export function resolveTardocTaxPoints(
  input: TardocTaxPointInput = {},
  catalog?: TardocTaxPointCatalog,
): TardocTaxPointResult {
  return {
    tpAl: resolveComponent(input.tpAl, catalog?.tpMt),
    tpTl: resolveComponent(input.tpTl, catalog?.tpTt),
    tpAlValue: resolveValue(input.tpAlValue),
    tpTlValue: resolveValue(input.tpTlValue),
  };
}
