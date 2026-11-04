/**
 * Resolves the tariff point value (valeur du point tarifaire / Taxpunktwert)
 * for an invoice line.
 *
 * Previously this was `CANTON_TAX_POINT_VALUES[canton] ?? 0.96` — a hardcoded
 * constant keyed on canton alone. Swiss TPVs are negotiated per cost-bearer
 * group AND per canton and change over time, so a single canton-wide number is
 * wrong for any insurer on a different rate. Billing staff were correcting
 * them by hand, and insurers were rejecting with 59109 / eK6.T001
 * ("valeurs du point tarifaire trop élevées").
 *
 * Resolution is most-specific-wins, so adding an insurer rate is additive and
 * never changes behaviour for insurers that have no row.
 *
 *   1. exact insurer GLN + canton + law
 *   2. exact insurer GLN + canton
 *   3. insurer group + canton + law
 *   4. insurer group + canton
 *   5. canton default            <- what the seed contains today
 *   6. caller-supplied fallback  <- the old constant
 *
 * The matching itself is pure so it can be unit-tested without a database.
 */

export type TariffPointValueRow = {
  insurer_gln: string | null;
  insurer_group: string | null;
  canton: string;
  law_type: string | null;
  tariff_type: string;
  value: number | string;
  valid_from: string | null;
  valid_to: string | null;
};

export type TariffPointQuery = {
  canton: string;
  tariffType?: string;
  insurerGln?: string | null;
  insurerGroup?: string | null;
  lawType?: string | null;
  /** Date the treatment took place — rates are period-bound. */
  on?: Date | string;
};

export type TariffPointResolution = {
  value: number;
  /** How the value was found — surfaced in the UI so staff can see why. */
  source:
    | "insurer_gln_law"
    | "insurer_gln"
    | "insurer_group_law"
    | "insurer_group"
    | "canton"
    | "fallback";
  matched: TariffPointValueRow | null;
};

function toDate(value: Date | string | undefined): Date {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
}

function inForce(row: TariffPointValueRow, when: Date): boolean {
  const from = row.valid_from ? new Date(row.valid_from) : null;
  const to = row.valid_to ? new Date(row.valid_to) : null;
  if (from && when < from) return false;
  // valid_to is inclusive of the day itself.
  if (to && when > new Date(to.getTime() + 86_399_999)) return false;
  return true;
}

/** Newest applicable rate first, so a mid-year change supersedes cleanly. */
function newestFirst(a: TariffPointValueRow, b: TariffPointValueRow): number {
  return new Date(b.valid_from ?? 0).getTime() - new Date(a.valid_from ?? 0).getTime();
}

/**
 * Pick the applicable rate from a candidate set.
 * `fallback` is used only when nothing matches — pass the legacy constant so
 * behaviour is unchanged for any scope that has no row yet.
 */
export function resolveTariffPointValue(
  rows: TariffPointValueRow[],
  query: TariffPointQuery,
  fallback: number,
): TariffPointResolution {
  const when = toDate(query.on);
  const tariffType = query.tariffType ?? "007";
  const canton = (query.canton || "").toUpperCase();
  const law = query.lawType ?? null;

  const candidates = (rows ?? []).filter(
    (r) =>
      (r.canton || "").toUpperCase() === canton &&
      r.tariff_type === tariffType &&
      inForce(r, when),
  );

  const pick = (
    predicate: (r: TariffPointValueRow) => boolean,
    source: TariffPointResolution["source"],
  ): TariffPointResolution | null => {
    const hit = candidates.filter(predicate).sort(newestFirst)[0];
    if (!hit) return null;
    const value = Number(hit.value);
    if (!Number.isFinite(value) || value <= 0) return null;
    return { value, source, matched: hit };
  };

  const gln = query.insurerGln || null;
  const group = query.insurerGroup || null;

  return (
    (gln && law && pick((r) => r.insurer_gln === gln && r.law_type === law, "insurer_gln_law")) ||
    (gln && pick((r) => r.insurer_gln === gln && !r.law_type, "insurer_gln")) ||
    (group && law && pick((r) => !r.insurer_gln && r.insurer_group === group && r.law_type === law, "insurer_group_law")) ||
    (group && pick((r) => !r.insurer_gln && r.insurer_group === group && !r.law_type, "insurer_group")) ||
    (law && pick((r) => !r.insurer_gln && !r.insurer_group && r.law_type === law, "canton")) ||
    pick((r) => !r.insurer_gln && !r.insurer_group && !r.law_type, "canton") || {
      value: fallback,
      source: "fallback" as const,
      matched: null,
    }
  );
}
