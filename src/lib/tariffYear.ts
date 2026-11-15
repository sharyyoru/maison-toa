/** Tariff year (2026 / 2027) for a treatment date; client-safe (no fs). */
export const TARIFF_YEARS = ["2026", "2027"] as const;
export type TariffYear = (typeof TARIFF_YEARS)[number];
export type DateLike = string | Date | null | undefined;

export function tariffYearFor(date?: DateLike): TariffYear {
  let day: string;
  if (date instanceof Date) day = date.toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
  else if (typeof date === "string" && /^\d{4}$/.test(date.trim())) day = date.trim();
  else if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date.trim())) {
    const d = date.trim();
    day = d.length > 10 && /[zZ]|[+-]\d{2}:?\d{2}$/.test(d) ? new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }) : d.slice(0, 10);
  } else day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
  const year = day.slice(0, 4);
  return [...TARIFF_YEARS].reverse().find((y) => year >= y) ?? TARIFF_YEARS[0];
}
