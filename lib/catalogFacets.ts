import { normalizeMark, productHasGasMark } from "@/lib/gasMarks";

/**
 * The catalog's filters, as pure functions over the products the page
 * already holds — every click filters in the browser, no request, no model.
 *
 * Counts are FACETED: the number next to an option is how many products
 * would match if that option were added to every other active filter. So a
 * group's counts always add up to the list it narrows (an option can't
 * promise products the other filters already hide), and "0" means exactly
 * that.
 *
 * Use cases and the human-readable application tag come from the gas:
 * engineering facts about where each refrigerant is used (EN 378 practice),
 * not from a catalog column — there is none.
 */

export interface FacetProduct {
  sku: string;
  name: string;
  category: string;
  gwpClass: string;
  gwp: number | null;
  weightKg: number;
  pricedPerKg: boolean;
  stockLevel: "in" | "low" | "order" | "out";
}

// ── Use cases ──

export const USE_CASES = ["ac", "auto", "refrigeration", "lowGwp", "equipment"] as const;
export type UseCase = (typeof USE_CASES)[number];

/** Gas → where it is used. A gas can serve several (R-134a: vehicles and chillers/medium-temp). */
const USE_BY_MARK: Record<string, UseCase[]> = {
  R32: ["ac"],
  R410A: ["ac"],
  R407C: ["ac"],
  R454B: ["ac"],
  R134a: ["auto", "refrigeration"],
  R1234yf: ["auto"],
  R404A: ["refrigeration"],
  R507: ["refrigeration"],
  R449A: ["refrigeration"],
  R452A: ["refrigeration"],
  R407F: ["refrigeration"],
  R422D: ["refrigeration"],
  R513A: ["refrigeration"],
  R290: ["refrigeration"],
};

/** Marks the parser and the quick chips know, most specific first ("R1234yf" before "R123…"). */
export const KNOWN_MARKS = ["R1234yf", "R410A", "R404A", "R407C", "R407F", "R422D", "R449A", "R452A", "R454B", "R513A", "R125A", "R134a", "R507", "R290", "R32"] as const;

/** The quick chips under the header, in order. */
export const QUICK_GASES = ["R32", "R134a", "R410A", "R404A", "R290", "R1234yf"] as const;

export const markOf = (p: Pick<FacetProduct, "name" | "sku">): string | null => KNOWN_MARKS.find((m) => productHasGasMark(p, m)) ?? null;

export const isEquipment = (p: Pick<FacetProduct, "category">) => p.category === "equipment" || p.category === "recovery";

export function applicationsOf(p: FacetProduct): UseCase[] {
  if (isEquipment(p)) return ["equipment"];
  const mark = markOf(p);
  const uses = [...(mark ? (USE_BY_MARK[mark] ?? []) : [])];
  if (p.gwpClass === "A2L" || p.gwpClass === "A3") uses.push("lowGwp");
  return uses;
}

/** Message key of the one-line "what is it for" tag on a card (Products.app_*). */
export function applicationKey(p: FacetProduct): string {
  if (isEquipment(p)) return "app_service";
  if (p.category === "blends") return "app_customBlend";
  const mark = markOf(p);
  switch (mark) {
    case "R32":
    case "R410A":
    case "R454B":
      return "app_split";
    case "R407C":
      return "app_acRetrofit";
    case "R134a":
      return "app_autoChiller";
    case "R1234yf":
      return "app_auto";
    case "R513A":
      return "app_chiller";
    case "R125A":
      return "app_blendComponent";
    case "R290":
      return "app_propane";
    case null:
      return "app_general";
    default:
      return "app_coldRoom";
  }
}

// ── Sidebar facets ──

/** Net kg per cylinder. Equipment (sold per unit) has no band. Bands are a partition: every cylinder is in exactly one. */
export const WEIGHT_BANDS = ["upTo10", "to15", "to30", "over30"] as const;
export type WeightBand = (typeof WEIGHT_BANDS)[number];
export const weightBandOf = (p: FacetProduct): WeightBand | null =>
  !p.pricedPerKg ? null : p.weightKg <= 10 ? "upTo10" : p.weightKg <= 15 ? "to15" : p.weightKg <= 30 ? "to30" : "over30";

export const SAFETY_CLASSES = ["A1", "A2L", "A3"] as const;
export const safetyOf = (p: FacetProduct) => ((SAFETY_CLASSES as readonly string[]).includes(p.gwpClass) ? p.gwpClass : null);

/** EU 2024/573 thresholds: GWP 150 and 750 are where its bans start. */
export const GWP_LEVELS = ["low", "medium", "high"] as const;
export type GwpLevel = (typeof GWP_LEVELS)[number];
export const gwpLevelOf = (p: FacetProduct): GwpLevel | null => (p.gwp === null || isEquipment(p) ? null : p.gwp < 150 ? "low" : p.gwp <= 750 ? "medium" : "high");

export const CATEGORIES = ["cylinders", "blends", "equipment", "recovery"] as const;
export const STOCK_LEVELS = ["in", "low", "order", "out"] as const;

export interface CatalogFilters {
  use: UseCase | null;
  marks: string[];
  cat: string[];
  weight: string[];
  safety: string[];
  gwp: string[];
  stock: string[];
}

export const EMPTY_FILTERS: CatalogFilters = { use: null, marks: [], cat: [], weight: [], safety: [], gwp: [], stock: [] };

export type FacetGroup = Exclude<keyof CatalogFilters, "use"> | "use";

const inList = (list: string[], value: string | null) => list.length === 0 || (value !== null && list.includes(value));

/** Does the product pass every filter, except (optionally) one group — the basis of faceted counts. */
export function passes(p: FacetProduct, f: CatalogFilters, skip?: FacetGroup): boolean {
  return (
    (skip === "use" || f.use === null || applicationsOf(p).includes(f.use)) &&
    (skip === "marks" || f.marks.length === 0 || f.marks.some((m) => productHasGasMark(p, m))) &&
    (skip === "cat" || inList(f.cat, p.category)) &&
    (skip === "weight" || inList(f.weight, weightBandOf(p))) &&
    (skip === "safety" || inList(f.safety, safetyOf(p))) &&
    (skip === "gwp" || inList(f.gwp, gwpLevelOf(p))) &&
    (skip === "stock" || inList(f.stock, p.stockLevel))
  );
}

/** How many products the option would show, given every OTHER active filter. */
export function facetCount<P extends FacetProduct>(products: P[], f: CatalogFilters, group: FacetGroup, value: string): number {
  const base = products.filter((p) => passes(p, f, group));
  switch (group) {
    case "use":
      return base.filter((p) => applicationsOf(p).includes(value as UseCase)).length;
    case "marks":
      return base.filter((p) => productHasGasMark(p, value)).length;
    case "cat":
      return base.filter((p) => p.category === value).length;
    case "weight":
      return base.filter((p) => weightBandOf(p) === value).length;
    case "safety":
      return base.filter((p) => safetyOf(p) === value).length;
    case "gwp":
      return base.filter((p) => gwpLevelOf(p) === value).length;
    case "stock":
      return base.filter((p) => p.stockLevel === value).length;
  }
}

export const activeFilterCount = (f: CatalogFilters) =>
  (f.use ? 1 : 0) + f.marks.length + f.cat.length + f.weight.length + f.safety.length + f.gwp.length + f.stock.length;

// ── URL (shareable, and how other pages deep-link: ?gasType=R32, ?category=equipment) ──

const LIST_PARAMS = { marks: "gasType", cat: "category", weight: "kg", safety: "safety", gwp: "gwp", stock: "stock" } as const;

export function filtersFromParams(params: URLSearchParams): CatalogFilters {
  const list = (key: string, allowed: readonly string[]) =>
    (params.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => allowed.includes(s));
  const marks = (params.get("gasType") ?? "")
    .split(",")
    .map((s) => KNOWN_MARKS.find((m) => normalizeMark(m) === normalizeMark(s)))
    .filter((m): m is (typeof KNOWN_MARKS)[number] => Boolean(m));
  const use = params.get("use");
  return {
    use: (USE_CASES as readonly string[]).includes(use ?? "") ? (use as UseCase) : null,
    marks: [...new Set(marks)],
    cat: list("category", CATEGORIES),
    weight: list("kg", WEIGHT_BANDS),
    safety: list("safety", SAFETY_CLASSES),
    gwp: list("gwp", GWP_LEVELS),
    stock: list("stock", STOCK_LEVELS),
  };
}

/** Writes the filters onto a copy of the current params (keeps ?search, ?view…). */
export function filtersToParams(f: CatalogFilters, base: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  if (f.use) params.set("use", f.use);
  else params.delete("use");
  for (const [key, param] of Object.entries(LIST_PARAMS) as Array<[keyof typeof LIST_PARAMS, string]>) {
    const values = f[key];
    if (values.length) params.set(param, values.join(","));
    else params.delete(param);
  }
  return params;
}

// ── Local matcher: a typed requirement → filters, without a model ──

const USE_WORDS: Array<[UseCase, RegExp]> = [
  ["auto", /авто|car\b|cars\b|vehicle|automotive|mobile a\/?c|kfz|fahrzeug|samochod|pojazd/iu],
  ["ac", /кондиц|спліт|сплит|split|air[\s-]?con|\ba\/?c\b|heat[\s-]?pump|тепл\p{L}*\s+насос|wärmepumpe|klima|klimatyz|pompa ciepła|vrf|vrv/iu],
  ["refrigeration", /холодил|морозил|камер|cold[\s-]?room|freez|refrigerat|супермаркет|supermarket|kühl|chłodni|mroźni|vitrine|вітрин/iu],
  ["equipment", /обладнан|інструмент|манометр|колектор|вакуум|manifold|vacuum|gauge|recovery|equipment|tool|werkzeug|narzędz/iu],
  ["lowGwp", /low[\s-]?gwp|низьк\p{L}*\s+gwp|низк\p{L}*\s+gwp|niedrig\p{L}*\s+gwp|nisk\p{L}*\s+gwp|\beco\b|екологічн/iu],
];

const MARK_RE = /(?<![\p{L}\p{N}])R[\s-]?(\d{2,4})(yf|ze|[a-c])?(?![\p{L}\p{N}])/giu;
const KG_RE = /(\d+(?:[.,]\d+)?)\s?(?:kg|кг)(?![\p{L}])/iu;
const SAFETY_RE = /(?<![\p{L}\p{N}])(A1|A2L|A3)(?![\p{L}\p{N}])/iu;

export interface LocalMatch {
  filters: CatalogFilters;
  /** What was recognised, for the result line ("R-32 · Air conditioning"). */
  matched: Array<{ group: FacetGroup; value: string }>;
}

/**
 * Reads gas codes, a use case, a cylinder size and a safety class out of free
 * text in the UI languages. Returns null when nothing is recognised — then,
 * and only then, the caller may ask the model.
 */
export function matchLocally(query: string): LocalMatch | null {
  const f: CatalogFilters = { ...EMPTY_FILTERS, marks: [], cat: [], weight: [], safety: [], gwp: [], stock: [] };
  const matched: LocalMatch["matched"] = [];
  for (const m of query.matchAll(MARK_RE)) {
    const key = normalizeMark(`R${m[1]}${m[2] ?? ""}`);
    const mark = KNOWN_MARKS.find((k) => normalizeMark(k) === key) ?? (m[1] === "134" ? "R134a" : m[1] === "410" ? "R410A" : m[1] === "404" ? "R404A" : null);
    if (mark && !f.marks.includes(mark)) {
      f.marks.push(mark);
      matched.push({ group: "marks", value: mark });
    }
  }
  const use = USE_WORDS.find(([, re]) => re.test(query))?.[0] ?? null;
  if (use) {
    f.use = use;
    matched.push({ group: "use", value: use });
  }
  const kg = query.match(KG_RE);
  if (kg) {
    const w = Number(kg[1].replace(",", "."));
    const band = weightBandOf({ pricedPerKg: true, weightKg: w } as FacetProduct)!;
    f.weight.push(band);
    matched.push({ group: "weight", value: band });
  }
  const safety = query.match(SAFETY_RE);
  if (safety) {
    const cls = safety[1].toUpperCase().replace("A2L", "A2L");
    f.safety.push(cls);
    matched.push({ group: "safety", value: cls });
  }
  return matched.length ? { filters: f, matched } : null;
}
