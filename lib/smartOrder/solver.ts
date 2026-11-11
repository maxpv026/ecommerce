import { normalizeMark } from "@/lib/gasMarks";
import { KG_PER_LB } from "@/lib/pricing";
import { refrigerantTypeOf } from "@/lib/productFamily";
import { isPurchasable } from "@/lib/waitlist";

/**
 * Smart Bulk Order — Phase B, the deterministic half.
 *
 * The model (lib/smartOrder/extract) only says WHAT was asked for: a
 * refrigerant code and either a total weight or a number of cylinders, with
 * the units as written. Everything that decides what lands in the cart lives
 * here, as plain arithmetic over database rows:
 *
 *   - which products are that refrigerant (exact designation, never a substring:
 *     "R-40" must not become R-404A);
 *   - which are sellable (in stock, priced);
 *   - how many of each size (a bounded change-making optimisation, below);
 *   - every price, deposit and total.
 *
 * Pure: no Prisma, no model, no React — the verification suite drives it
 * directly against synthetic and real catalogues.
 */

// ── Inputs ───────────────────────────────────────────────────────────────

export type WeightUnit = "kg" | "g" | "lb" | "oz" | "t";

export interface Amount {
  value: number;
  unit: WeightUnit;
}

/** One requested line, after extraction and grounding, before solving. */
export interface LineRequest {
  /** The snippet it came from, for the review table. */
  rawText: string;
  kind: "REFRIGERANT" | "OTHER";
  /** As the model normalised it ("R-32"); validated here, never trusted. */
  refrigerantCode: string | null;
  /** Non-refrigerant items ("manifold"): a catalogue search string. */
  productQuery: string | null;
  requestMode: "BY_TOTAL_WEIGHT_KG" | "BY_CYLINDER_COUNT";
  targetWeightKg: number | null;
  cylinderCount: number | null;
  preferredCylinderSizeKg: number | null;
  /** Grade asked for; null = not stated, which means virgin. */
  grade: Grade | null;
}

/**
 * Virgin vs reclaimed refrigerant. In the EU they differ in regulation
 * (F-Gas service bans, labelling) and in price, so a line is NEVER solved
 * from a mix of the two: every line draws from one grade's pool only.
 */
export type Grade = "VIRGIN" | "RECLAIMED";

/** Words that mark reclaimed / recycled gas, in the languages buyers here write in. */
/**
 * Stems that mark reclaimed / recycled gas, covering the term our own UI uses
 * in every locale (so a buyer copying it is understood). Stems that ALSO mean
 * "recovery" are left out on purpose — Italian "recupero", Polish "odzysk",
 * French "récupération" name the recovery cylinder, which is equipment.
 */
const RECLAIMED_WORDS = new RegExp(
  [
    // en / de / nl / da / sv / fi / et
    "reclaim", "recycl", "regenerat", "reprocess", "aufbereit", "wiedergewonn", "regenerier", "recycelt", "geregenereer", "genvund", "återvunn", "kierrätet", "taastat",
    // fr / it / es / pt / ro / mt / ga
    "régénér", "recyclé", "récupéré", "rigenerat", "riciclat", "recuperat", "regenerad", "recuperad", "reciclad", "reclamad", "riklamat", "riċiklat", "athghinte", "athchúrsáil",
    // pl / cs / sk / hr / sl / hu / lt / lv / tr / el
    "recykl", "regenerowan", "odzyskan", "regenerovan", "regenerir", "recikli", "visszanyert", "atgaut", "atgūt", "geri kazanıl", "ανακτημέν",
    // uk / ru / bg / ko / zh
    "відновлен", "регенер", "рецикл", "восстановлен", "възстановен", "재생", "再生", "回收的", "回收制冷剂",
  ].join("|"),
  "i"
);

/** A row's grade, from its name, SKU or family key: unmarked rows are virgin. */
export function gradeOfRow(r: { name: string; sku: string; familyKey?: string | null }): Grade {
  return RECLAIMED_WORDS.test(`${r.name} ${r.sku} ${r.familyKey ?? ""}`) ? "RECLAIMED" : "VIRGIN";
}

/** True when the buyer's own words ask for reclaimed gas. */
export function mentionsReclaimed(text: string): boolean {
  return RECLAIMED_WORDS.test(text);
}

/** The catalogue columns the solver reads. */
export interface SolverRow {
  id: string;
  sku: string;
  name: string;
  weight: string;
  weightKg: number;
  pricePerKg: number;
  cylinderDeposit: unknown;
  inStock: boolean;
  stockQuantity: number;
  category: string;
  containerType: string;
  familyKey?: string | null;
}

// ── Outputs ──────────────────────────────────────────────────────────────

export type LineStatus =
  /** Exactly what was asked for: the weight to the gram, or the cylinders as named. */
  | "EXACT"
  /** Weight request rounded up to whole cylinders (excessKg says by how much). */
  | "BUFFER"
  /** The requested cylinder size isn't available; the same weight in other sizes. */
  | "SUBSTITUTED"
  /** A cylinder count with no size given: a size was chosen (cheapest per kg). */
  | "SIZE_ASSUMED"
  /** Not enough stock for all of it; shortfallKg / shortfallCount say how much is missing. */
  | "PARTIAL"
  /** We carry this refrigerant, but nothing of it can be sold right now. */
  | "OUT_OF_STOCK"
  /** A real refrigerant designation we don't carry. */
  | "NOT_CARRIED"
  /** Nothing orderable could be identified in the snippet. */
  | "UNRECOGNIZED"
  /** Extracted, but not trustworthy enough to price (ungrounded or out of bounds). */
  | "NEEDS_REVIEW";

export interface LinePick {
  productId: string;
  sku: string;
  name: string;
  variant: string;
  weightKg: number;
  pricePerKg: number;
  /** Gas price of one container, from the row. */
  unitPrice: number;
  /** Refundable deposit per container, from the row. */
  deposit: number;
  quantity: number;
  /** Units the solver may still add in the review table. */
  maxQuantity: number;
  grade: Grade;
}

export interface SolvedLine {
  id: string;
  request: LineRequest;
  /** Display form of the refrigerant, from the catalogue when we carry it. */
  refrigerantLabel: string | null;
  status: LineStatus;
  /** Why, when status alone doesn't say (a code; the UI words it). */
  note: "SIZE_UNAVAILABLE" | "OVERSIZED" | "AMBIGUOUS_PRODUCT" | "UNGROUNDED" | "TOO_LARGE" | null;
  picks: LinePick[];
  totalWeightKg: number;
  /** Weight requests: delivered − requested (≥ 0), in kg. */
  excessKg: number;
  /** PARTIAL: what stock couldn't cover. */
  shortfallKg: number;
  shortfallCount: number;
  gasTotal: number;
  depositTotal: number;
  lineTotal: number;
  /** Whether the review table ticks it by default. */
  selected: boolean;
  /** Refrigerant lines: the grade asked for (virgin unless they wrote otherwise). */
  requestedGrade: Grade | null;
  /** The one grade every pick in this line is (null when there are no picks). */
  grade: Grade | null;
  /** Requested grade had nothing sellable; solved from the other grade, unticked. */
  gradeSubstituted: boolean;
}

// ── Limits ───────────────────────────────────────────────────────────────

/** Per SKU, per order: the cart and checkout both cap a line at 99. */
export const MAX_UNITS_PER_SKU = 99;
/** One line's weight ceiling; beyond this it's a tender, not a basket. */
export const MAX_LINE_WEIGHT_KG = 2_000;
export const MAX_LINE_CYLINDERS = 200;

/** Solver resolution: 10 g. Every catalogue weight is a whole multiple. */
const UNITS_PER_KG = 100;

// ── Helpers ──────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

export function toKg(amount: Amount): number {
  const { value, unit } = amount;
  switch (unit) {
    case "kg":
      return value;
    case "g":
      return value / 1000;
    case "t":
      return value * 1000;
    case "lb":
      return value * KG_PER_LB;
    case "oz":
      return (value * KG_PER_LB) / 16;
  }
}

/** A refrigerant designation on the normalised form: R32, R410A, R1234YF, R600A. */
const DESIGNATION = /^R\d{2,4}[A-Z]{0,2}$/;

/** "r 410a", "410A", "R-1234yf" → "R410A" / "R1234YF"; null if it isn't a designation. */
export function canonicalCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let n = normalizeMark(raw);
  if (/^\d/.test(n)) n = `R${n}`;
  return DESIGNATION.test(n) ? n : null;
}

const GAS_CATEGORIES = new Set(["cylinders", "blends"]);

/** Rows of exactly this refrigerant: the leading token of the name IS the designation. */
export function rowsForRefrigerant(code: string, catalog: SolverRow[]): SolverRow[] {
  return catalog.filter((r) => GAS_CATEGORIES.has(r.category) && normalizeMark(refrigerantTypeOf(r.name)) === code);
}

const depositOf = (r: SolverRow) => (r.cylinderDeposit == null ? 0 : Number(r.cylinderDeposit) || 0);
const unitPriceOf = (r: SolverRow) => round2(r.pricePerKg * r.weightKg);
const sellable = (r: SolverRow) => isPurchasable(r) && r.pricePerKg > 0 && r.weightKg > 0;
const unitsAvailable = (r: SolverRow) => Math.max(0, Math.min(r.stockQuantity, MAX_UNITS_PER_SKU));

// ── The optimiser ────────────────────────────────────────────────────────

export interface Option {
  row: SolverRow;
  /** Most units of this row the solution may use. */
  limit: number;
}

/**
 * Fewest kilograms over the target, then lowest cost (gas + deposits), then
 * fewest containers — the bounded change-making problem, solved exactly.
 *
 * Weights are integers in 10 g units. Any solution exceeding the target by
 * the largest container or more can drop a container and still cover it, so
 * the optimum lies in [target, target + largest); the DP only spans that.
 * Bounded counts are binary-split (1, 2, 4, … units) into 0/1 items, with a
 * bit per (item, sum) to rebuild the choice.
 *
 * Returns null when the options together can't reach the target.
 */
export function solveWeight(targetKg: number, options: Option[]): Map<string, number> | null {
  const opts = [...options]
    .filter((o) => o.limit > 0 && o.row.weightKg > 0)
    .sort((a, b) => a.row.sku.localeCompare(b.row.sku)); // determinism
  if (opts.length === 0) return null;

  const T = Math.ceil(targetKg * UNITS_PER_KG - 1e-9);
  if (T <= 0) return new Map();
  const unitW = opts.map((o) => Math.max(1, Math.round(o.row.weightKg * UNITS_PER_KG)));
  const capacity = opts.reduce((n, o, i) => n + unitW[i]! * o.limit, 0);
  if (capacity < T) return null;

  const maxW = Math.max(...unitW);
  const S = T + maxW - 1;

  type Bundle = { opt: number; k: number; w: number; cost: number };
  const bundles: Bundle[] = [];
  opts.forEach((o, i) => {
    const cost = Math.round(unitPriceOf(o.row) * 100) + Math.round(depositOf(o.row) * 100);
    let left = o.limit;
    for (let k = 1; left > 0; k *= 2) {
      const take = Math.min(k, left);
      bundles.push({ opt: i, k: take, w: take * unitW[i]!, cost: take * cost });
      left -= take;
    }
  });

  const best = new Float64Array(S + 1).fill(Infinity);
  const count = new Int32Array(S + 1).fill(0);
  best[0] = 0;
  const words = Math.ceil((S + 1) / 32);
  const taken = bundles.map(() => new Uint32Array(words));

  bundles.forEach((b, bi) => {
    for (let s = S; s >= b.w; s--) {
      const prev = best[s - b.w]!;
      if (prev === Infinity) continue;
      const cost = prev + b.cost;
      const n = count[s - b.w]! + b.k;
      if (cost < best[s]! || (cost === best[s]! && n < count[s]!)) {
        best[s] = cost;
        count[s] = n;
        taken[bi]![s >> 5]! |= 1 << (s & 31);
      }
    }
  });

  // Smallest reachable sum ≥ target (least excess); the DP already holds the
  // cheapest, then fewest, way to make each sum.
  let end = -1;
  for (let s = T; s <= S; s++) {
    if (best[s] !== Infinity) {
      end = s;
      break;
    }
  }
  if (end < 0) return null;

  const units = new Map<string, number>();
  for (let bi = bundles.length - 1, s = end; bi >= 0 && s > 0; bi--) {
    if (taken[bi]![s >> 5]! & (1 << (s & 31))) {
      const b = bundles[bi]!;
      const id = opts[b.opt]!.row.id;
      units.set(id, (units.get(id) ?? 0) + b.k);
      s -= b.w;
    }
  }
  return units;
}

// ── Building a line ──────────────────────────────────────────────────────

function pickOf(row: SolverRow, quantity: number): LinePick {
  return {
    productId: row.id,
    sku: row.sku,
    name: row.name,
    variant: row.weight,
    weightKg: row.weightKg,
    pricePerKg: row.pricePerKg,
    unitPrice: unitPriceOf(row),
    deposit: depositOf(row),
    quantity,
    maxQuantity: unitsAvailable(row),
    grade: gradeOfRow(row),
  };
}

function finish(
  id: string,
  request: LineRequest,
  refrigerantLabel: string | null,
  status: LineStatus,
  picks: LinePick[],
  extra: Partial<Pick<SolvedLine, "note" | "excessKg" | "shortfallKg" | "shortfallCount" | "selected">> = {}
): SolvedLine {
  const ordered = picks.filter((p) => p.quantity > 0).sort((a, b) => b.weightKg - a.weightKg || a.sku.localeCompare(b.sku));
  const totalWeightKg = round2(ordered.reduce((n, p) => n + p.weightKg * p.quantity, 0));
  const gasTotal = round2(ordered.reduce((n, p) => n + p.unitPrice * p.quantity, 0));
  const depositTotal = round2(ordered.reduce((n, p) => n + p.deposit * p.quantity, 0));
  return {
    id,
    request,
    refrigerantLabel,
    status,
    note: extra.note ?? null,
    picks: ordered,
    totalWeightKg,
    excessKg: extra.excessKg ?? 0,
    shortfallKg: extra.shortfallKg ?? 0,
    shortfallCount: extra.shortfallCount ?? 0,
    gasTotal,
    depositTotal,
    lineTotal: round2(gasTotal + depositTotal),
    selected: extra.selected ?? ordered.length > 0,
    requestedGrade: request.kind === "REFRIGERANT" ? (request.grade ?? "VIRGIN") : null,
    grade: ordered[0]?.grade ?? null,
    gradeSubstituted: false,
  };
}

const picksFrom = (units: Map<string, number>, rows: SolverRow[]) =>
  rows.filter((r) => units.has(r.id)).map((r) => pickOf(r, units.get(r.id)!));

/** Weight-mode result for `targetKg` from these rows, with PARTIAL when stock falls short. */
function byWeight(rows: SolverRow[], targetKg: number, status: "EXACT_OR_BUFFER" | "SUBSTITUTED", reserved: Map<string, number> = new Map()) {
  const options = rows.map((row) => ({ row, limit: Math.max(0, unitsAvailable(row) - (reserved.get(row.id) ?? 0)) }));
  const units = solveWeight(targetKg, options);
  if (!units) {
    // Can't reach it: everything there is, and say what's missing.
    const all = new Map(options.filter((o) => o.limit > 0).map((o) => [o.row.id, o.limit]));
    const picks = picksFrom(all, rows);
    const got = picks.reduce((n, p) => n + p.weightKg * p.quantity, 0);
    return { picks, partial: true, shortfallKg: round2(targetKg - got), excessKg: 0, status: "PARTIAL" as const };
  }
  const picks = picksFrom(units, rows);
  const got = picks.reduce((n, p) => n + p.weightKg * p.quantity, 0);
  const excessKg = round2(Math.max(0, got - targetKg));
  return {
    picks,
    partial: false,
    shortfallKg: 0,
    excessKg,
    status: status === "SUBSTITUTED" ? ("SUBSTITUTED" as const) : excessKg === 0 ? ("EXACT" as const) : ("BUFFER" as const),
  };
}

/** Within ±0.3 kg or ±3 %, whichever is wider: "10 kg" names a 10 kg cylinder, not an 11.34 kg one. */
const sameSize = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.3, 0.03 * b);

/**
 * Solves one refrigerant line against the catalogue. Never throws: whatever
 * can't be fulfilled comes back as a status, so one bad line never sinks the
 * others.
 */
export function solveRefrigerantLine(id: string, request: LineRequest, catalog: SolverRow[]): SolvedLine {
  const code = canonicalCode(request.refrigerantCode);
  if (!code) return finish(id, request, null, "UNRECOGNIZED", []);

  const rows = rowsForRefrigerant(code, catalog);
  const label = rows[0] ? refrigerantTypeOf(rows[0].name) : request.refrigerantCode?.trim().slice(0, 16) ?? code;
  if (rows.length === 0) return finish(id, request, label, "NOT_CARRIED", []);

  // One grade per line, always. Virgin unless the buyer asked for reclaimed.
  const wanted: Grade = request.grade ?? "VIRGIN";
  const other: Grade = wanted === "VIRGIN" ? "RECLAIMED" : "VIRGIN";
  const live = rows.filter(sellable);
  const pool = (g: Grade) => live.filter((r) => gradeOfRow(r) === g);

  // The requested grade is sellable: solve from it alone. Short stock stays
  // PARTIAL — it is never topped up with the other grade.
  if (pool(wanted).length > 0) return solveWithin(id, request, label, pool(wanted));

  // Nothing of that grade can be sold. The other grade may be offered, but
  // as a visible grade substitution the buyer has to tick themselves.
  if (pool(other).length > 0) {
    const alt = solveWithin(id, request, label, pool(other));
    if (alt.picks.length > 0) return { ...alt, gradeSubstituted: true, selected: false };
  }
  return finish(id, request, label, "OUT_OF_STOCK", []);
}

/** Solves a line from one grade's sellable rows. */
function solveWithin(id: string, request: LineRequest, label: string, live: SolverRow[]): SolvedLine {
  if (request.requestMode === "BY_TOTAL_WEIGHT_KG") {
    const target = request.targetWeightKg ?? 0;
    if (!(target > 0)) return finish(id, request, label, "NEEDS_REVIEW", [], { note: "UNGROUNDED" });
    if (target > MAX_LINE_WEIGHT_KG) return finish(id, request, label, "NEEDS_REVIEW", [], { note: "TOO_LARGE" });
    const r = byWeight(live, target, "EXACT_OR_BUFFER");
    // A container far bigger than the need (a 1000 kg isotank for 35 kg) is
    // offered, but not ticked: that is a decision, not a rounding.
    const oversized = !r.partial && r.excessKg > target;
    return finish(id, request, label, r.status, r.picks, {
      excessKg: r.excessKg,
      shortfallKg: r.shortfallKg,
      note: oversized ? "OVERSIZED" : null,
      selected: r.picks.length > 0 && !oversized,
    });
  }

  // ── By cylinder count ──
  const count = request.cylinderCount ?? 0;
  if (!(count > 0) || !Number.isInteger(count)) return finish(id, request, label, "NEEDS_REVIEW", [], { note: "UNGROUNDED" });
  if (count > MAX_LINE_CYLINDERS) return finish(id, request, label, "NEEDS_REVIEW", [], { note: "TOO_LARGE" });

  // "Cylinders" means cylinders: a drum or isotank never answers a count.
  const cylinders = live.filter((r) => r.containerType.toLowerCase() === "cylinder");
  const size = request.preferredCylinderSizeKg;

  if (size && size > 0) {
    const sized = cylinders
      .filter((r) => sameSize(r.weightKg, size))
      .sort((a, b) => Math.abs(a.weightKg - size) - Math.abs(b.weightKg - size) || unitPriceOf(a) - unitPriceOf(b) || a.sku.localeCompare(b.sku));
    const exact = sized.find((r) => unitsAvailable(r) >= count);
    if (exact) return finish(id, request, label, "EXACT", [pickOf(exact, count)]);

    // The size is short or out: take what there is of it, then make up the
    // remaining weight from the other sizes of the same gas.
    const partialRow = sized[0];
    const have = partialRow ? Math.min(unitsAvailable(partialRow), count) : 0;
    const reserved = new Map(partialRow && have > 0 ? [[partialRow.id, have]] : []);
    const remainingKg = round2((count - have) * size);
    const pool = cylinders.length > 0 ? cylinders : live;
    const r = byWeight(pool, remainingKg, "SUBSTITUTED", reserved);
    const picks = [...(partialRow && have > 0 ? [pickOf(partialRow, have)] : []), ...r.picks];
    // Merge a row that appears in both halves.
    const merged = new Map<string, LinePick>();
    for (const p of picks) {
      const prev = merged.get(p.productId);
      merged.set(p.productId, prev ? { ...prev, quantity: prev.quantity + p.quantity } : p);
    }
    if (r.partial) {
      return finish(id, request, label, "PARTIAL", [...merged.values()], { note: "SIZE_UNAVAILABLE", shortfallKg: r.shortfallKg });
    }
    return finish(id, request, label, "SUBSTITUTED", [...merged.values()], { note: "SIZE_UNAVAILABLE", excessKg: r.excessKg });
  }

  // No size named: the cheapest per kg that can cover the count, else the
  // best-stocked one, short.
  const pool = (cylinders.length > 0 ? cylinders : live).sort(
    (a, b) => a.pricePerKg - b.pricePerKg || a.weightKg - b.weightKg || a.sku.localeCompare(b.sku)
  );
  const enough = pool.find((r) => unitsAvailable(r) >= count);
  if (enough) return finish(id, request, label, "SIZE_ASSUMED", [pickOf(enough, count)]);
  const most = [...pool].sort((a, b) => unitsAvailable(b) - unitsAvailable(a) || a.pricePerKg - b.pricePerKg)[0]!;
  const have = unitsAvailable(most);
  return finish(id, request, label, "PARTIAL", [pickOf(most, have)], { shortfallCount: count - have });
}

/** Lines that never reached the solver (no refrigerant, ungrounded…). */
export function unsolvedLine(id: string, request: LineRequest, status: LineStatus, note: SolvedLine["note"] = null): SolvedLine {
  return finish(id, request, request.refrigerantCode, status, [], { note });
}

/** A non-refrigerant line resolved elsewhere (lib/magicOrderResolve), packaged the same way. */
export function productLine(id: string, request: LineRequest, row: SolverRow | null, quantity: number, status: LineStatus, note: SolvedLine["note"] = null): SolvedLine {
  if (!row) return finish(id, request, null, status, [], { note });
  const q = Math.min(quantity, unitsAvailable(row));
  return finish(id, request, row.name, q < quantity ? "PARTIAL" : status, [pickOf(row, q)], { shortfallCount: quantity - q, note });
}
