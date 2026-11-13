/**
 * The "engineering compliance note" on /profile/compliance — deterministic
 * arithmetic over the buyer's own breakdown, replacing the old AI summary.
 * 0 model calls: what it says follows from the ledger and this table.
 *
 * ALTERNATIVES is the usual lower-GWP route for each gas in new or retrofit
 * work (GWP as Annex I / lib/sdsLibrary). It is a direction, not advice for a
 * specific system — the page says so beside the figure, and links to the
 * compatibility table on /hub for the system-level answer.
 */

export const ALTERNATIVES: Record<string, { gas: string; gwp: number }> = {
  "R-134a": { gas: "R-1234yf", gwp: 4 },
  "R-410A": { gas: "R-32", gwp: 675 },
  "R-407C": { gas: "R-32", gwp: 675 },
  "R-32": { gas: "R-290", gwp: 3 },
  "R-404A": { gas: "R-449A", gwp: 1397 },
  "R-507": { gas: "R-449A", gwp: 1397 },
  "R-422D": { gas: "R-449A", gwp: 1397 },
  "R-407F": { gas: "R-449A", gwp: 1397 },
  "R-452A": { gas: "R-449A", gwp: 1397 },
};

/** The share of volume the note models moving (and 100 %, stated beside it). */
export const SHIFT_SHARE = 0.25;

export interface InsightInput {
  refrigerant: string;
  massKg: number;
  co2eKg: number;
  /** Mass-weighted GWP actually applied (co2eKg / massKg). */
  avgGwp: number | null;
  share: number;
}

export interface ComplianceInsight {
  top: { gas: string; gwp: number | null; share: number };
  /** Null when no lower-GWP route is listed, or it would not lower anything. */
  shift: { alt: string; altGwp: number; savedPartT: number; savedAllT: number } | null;
}

export function complianceInsight(rows: readonly InsightInput[]): ComplianceInsight | null {
  const top = [...rows].sort((a, b) => b.co2eKg - a.co2eKg)[0];
  if (!top || top.co2eKg <= 0) return null;
  const gwp = top.avgGwp ?? (top.massKg > 0 ? top.co2eKg / top.massKg : null);
  const alt = ALTERNATIVES[top.refrigerant];
  const shift =
    alt && gwp !== null && gwp > alt.gwp
      ? {
          alt: alt.gas,
          altGwp: alt.gwp,
          savedPartT: (SHIFT_SHARE * top.massKg * (gwp - alt.gwp)) / 1000,
          savedAllT: (top.massKg * (gwp - alt.gwp)) / 1000,
        }
      : null;
  return { top: { gas: top.refrigerant, gwp, share: top.share }, shift };
}
