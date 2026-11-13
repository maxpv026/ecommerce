/**
 * The EU rules the market hub quotes — transcribed from the regulation text,
 * not paraphrased from memory. Source: Regulation (EU) 2024/573 (EUR-Lex,
 * CELEX 32024R0573) — Annex VII (HFC quota), Article 13 (servicing bans),
 * Annex IV (placing-on-the-market bans); and Directive 2006/40/EC (vehicle
 * air-conditioning, GWP < 150 for new vehicles from 1 January 2017).
 *
 * Only what those texts say is here. A rule with an exception (safety
 * requirements, reclaimed/recycled gas, chillers) carries it in its message.
 */

export const REGULATION_SOURCE = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R0573";

/** Annex VII — maximum quantity of HFCs placed on the EU market, t CO₂e per year. The table starts in 2025. */
export const HFC_QUOTA: ReadonlyArray<{ from: number; to: number; tonnes: number }> = [
  { from: 2025, to: 2026, tonnes: 42_874_410 },
  { from: 2027, to: 2029, tonnes: 21_665_691 },
  { from: 2030, to: 2032, tonnes: 9_132_097 },
  { from: 2033, to: 2035, tonnes: 8_445_713 },
  { from: 2036, to: 2038, tonnes: 6_782_265 },
  { from: 2039, to: 2041, tonnes: 6_136_732 },
  { from: 2042, to: 2044, tonnes: 5_491_199 },
  { from: 2045, to: 2047, tonnes: 4_845_666 },
  { from: 2048, to: 2049, tonnes: 4_200_133 },
  { from: 2050, to: 2050, tonnes: 0 },
];

/** The quota in force in a year (null before the table starts). */
export const quotaFor = (year: number) => HFC_QUOTA.find((q) => year >= q.from && year <= q.to)?.tonnes ?? null;

/**
 * Which GWP-based rules touch a refrigerant, as message keys (MarketHub.reg_*).
 * The key names the rule; the message carries its date and exceptions.
 */
export function regulationKeys(gwp: number | null): string[] {
  if (gwp === null) return [];
  const keys: string[] = [];
  if (gwp >= 2500) keys.push("reg_service2500"); // Art. 13(3)/(4)
  if (gwp >= 750) keys.push("reg_split750", "reg_service750"); // Annex IV single split < 3 kg (2025); Art. 13(5) (2032)
  if (gwp >= 150) keys.push("reg_new150"); // Annex IV monobloc ≤ 12 kW 2027, split air-to-air ≤ 12 kW 2029
  if (gwp < 150) keys.push("reg_ok150");
  return keys;
}

/** One-word status for a table cell: the strictest rule that applies. */
export const regulationStatus = (gwp: number | null): "banned2025" | "restricted" | "phaseout" | "ok" | "unknown" =>
  gwp === null ? "unknown" : gwp >= 2500 ? "banned2025" : gwp >= 750 ? "restricted" : gwp >= 150 ? "phaseout" : "ok";
