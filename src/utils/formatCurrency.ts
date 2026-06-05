/**
 * Swiss currency formatting utility.
 *
 * Centralises the repeated `amount.toFixed(2)` + "CHF" pattern used across
 * invoice, financial, and billing components.
 */

/**
 * Format a number as a Swiss franc amount, e.g. `"1'234.50"`.
 *
 * Uses the `fr-CH` locale so thousands are separated with an apostrophe and
 * decimals with a period — the standard Swiss convention.
 */
export function formatCHF(amount: number): string {
  return amount.toLocaleString("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
