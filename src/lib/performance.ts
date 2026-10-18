/**
 * Flags campaigns and ads that are wasting money or doing best, the core
 * daily question of the product ("which client campaigns need attention?").
 *
 * Rules, relative to the group being compared (one table on the dashboard):
 *  - waste: spent a meaningful amount with zero leads, or cost per lead at
 *    least 2x the group's average
 *  - best:  at least 3 leads and cost per lead at most 0.6x the average
 * "Meaningful" = 10% of the group's spend, but never less than ₹500, so tiny
 * test ads don't light up red.
 */

export type PerfRow = { spend: number; results: number };
export type Flag = "waste" | "best" | null;

export function groupAverageCpl(rows: PerfRow[]): number | null {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const results = rows.reduce((s, r) => s + r.results, 0);
  return results > 0 ? spend / results : null;
}

export function flagRow(row: PerfRow, rows: PerfRow[]): Flag {
  const total = rows.reduce((s, r) => s + r.spend, 0);
  const avg = groupAverageCpl(rows);
  const meaningful = Math.max(500, total * 0.1);

  if (row.results === 0) return row.spend >= meaningful ? "waste" : null;
  const cpl = row.spend / row.results;
  if (avg !== null && cpl >= avg * 2 && row.spend >= meaningful / 2) return "waste";
  if (avg !== null && row.results >= 3 && cpl <= avg * 0.6) return "best";
  return null;
}

/** Spend that produced no leads at all, across the group. */
export function wastedSpend(rows: PerfRow[]): number {
  return rows.filter((r) => r.results === 0).reduce((s, r) => s + r.spend, 0);
}
