import { markOf, weightBandOf, WEIGHT_BANDS, type WeightBand } from "@/lib/catalogFacets";
import { regulationStatus } from "@/lib/regulation";
import { GWP_REFERENCE, SAFETY, oilFor, pressureAt45, type CompareGas, type SystemKind } from "@/lib/systemCompat";
import { isPurchasable } from "@/lib/waitlist";
import type { StoreProduct } from "@/lib/data";

/**
 * /categories — the catalog seen by application ("sector") rather than by
 * database category, plus a deterministic order configurator. Pure: the page
 * hands it the listed catalog and everything runs in the browser, 0 tokens.
 *
 * Sector membership is a rule over real product fields (gas mark, net kg,
 * category). Gas sectors take cylinders up to 30 kg; everything above 30 kg
 * (the catalog's own `over30` weight band) and custom blends sit in the bulk
 * sector, so a product appears in one gas sector at most — the heat-pump
 * sector is the one deliberate overlap (R-32 serves both).
 *
 * Engineering facts per sector (pressure at +45 °C, oil family, safety
 * class, EU status) come from the same sources as the hub comparator
 * (lib/systemCompat, lib/refrigerantPT, lib/regulation). Gases the catalog
 * doesn't stock (R-290, R-1234yf) are listed as such, never priced.
 */

export const SECTORS = ["ac", "auto", "heatpump", "commercial", "bulk", "equipment"] as const;
export type Sector = (typeof SECTORS)[number];

/** Catalog mark ("R1234yf") → compare label ("R-1234yf"). */
export const gasLabel = (mark: string) => mark.replace(/^R(?=\d)/, "R-");

interface SectorDef {
  /** The sector's headline gases, in display order (marks) — the spec strip describes these. */
  gases: string[];
  /** Every gas whose cylinders belong in the sector (headline gases first). */
  marks: string[];
  /** The system kind used for the oil family. */
  kind: SystemKind | null;
  /** The catalog link for "all items in this sector". */
  href: Record<string, string>;
  /** Service-connection standard of the systems this sector serves (message key), if any. */
  portKey: string | null;
}

export const SECTOR_DEFS: Record<Sector, SectorDef> = {
  ac: { gases: ["R32", "R410A"], marks: ["R32", "R410A"], kind: "split", href: { gasType: "R32,R410A" }, portKey: "port_sae516" },
  auto: { gases: ["R134a", "R1234yf"], marks: ["R134a", "R1234yf"], kind: "car", href: { gasType: "R134a,R1234yf" }, portKey: "port_j639" },
  heatpump: { gases: ["R290", "R32"], marks: ["R290", "R32"], kind: "heatpump", href: { gasType: "R32,R290" }, portKey: "port_sae516" },
  // R-404A and its lower-GWP service alternatives, R-407C, and R-513A (the R-134a chiller route).
  commercial: {
    gases: ["R404A", "R407C"],
    marks: ["R404A", "R407C", "R449A", "R452A", "R407F", "R422D", "R507", "R513A", "R125A"],
    kind: "coldroom",
    href: { gasType: "R404A,R407C,R449A,R452A,R407F,R422D,R507,R513A" },
    portKey: "port_sae14",
  },
  bulk: { gases: [], marks: [], kind: null, href: { kg: "over30" }, portKey: null },
  equipment: { gases: [], marks: [], kind: null, href: { category: "equipment,recovery" }, portKey: null },
};

const GAS_SECTOR_MAX_KG = 30;

export function inSector(p: StoreProduct, sector: Sector): boolean {
  if (sector === "equipment") return p.category === "equipment" || p.category === "recovery";
  if (!p.pricedPerKg) return false;
  if (sector === "bulk") return p.weightKg > GAS_SECTOR_MAX_KG || p.category === "blends";
  if (p.category === "blends" || p.weightKg > GAS_SECTOR_MAX_KG) return false;
  const mark = markOf(p);
  return mark !== null && SECTOR_DEFS[sector].marks.includes(mark);
}

/** Purchasable first, then by gas order, then by size — what a buyer scans for. */
export function sectorProducts(products: StoreProduct[], sector: Sector): StoreProduct[] {
  const order = SECTOR_DEFS[sector].marks;
  const rank = (p: StoreProduct) => {
    const i = order.indexOf(markOf(p) ?? "");
    return i < 0 ? order.length : i;
  };
  return products
    .filter((p) => inSector(p, sector))
    .sort((a, b) => Number(isPurchasable(b)) - Number(isPurchasable(a)) || rank(a) - rank(b) || a.weightKg - b.weightKg || a.pricePerKg - b.pricePerKg);
}

/** "From X €/kg": the lowest per-kg rate of a purchasable gas size (else of any listed size); null for equipment. */
export function fromPerKg(list: StoreProduct[]): { perKg: number; available: boolean } | null {
  const gas = list.filter((p) => p.pricedPerKg && p.pricePerKg > 0);
  if (gas.length === 0) return null;
  const buyable = gas.filter(isPurchasable);
  const pool = buyable.length ? buyable : gas;
  return { perKg: Math.min(...pool.map((p) => p.pricePerKg)), available: buyable.length > 0 };
}

export interface GasFact {
  mark: string;
  label: string;
  stocked: boolean;
  safety: string | null;
  gwp: number | null;
  /** Saturation pressure at +45 °C, bar gauge. */
  p45: number | null;
  oilKey: string | null;
  eu: ReturnType<typeof regulationStatus>;
}

/** The spec strip: one entry per sector gas, from the catalog where stocked, else the reference data. */
export function gasFacts(products: StoreProduct[], sector: Sector): GasFact[] {
  const def = SECTOR_DEFS[sector];
  return def.gases.map((mark) => {
    const label = gasLabel(mark);
    const stocked = products.find((p) => p.pricedPerKg && markOf(p) === mark);
    const gwp = stocked?.gwp ?? GWP_REFERENCE[label as CompareGas] ?? null;
    return {
      mark,
      label,
      stocked: Boolean(stocked),
      safety: stocked?.gwpClass && stocked.gwpClass !== "n/a" ? stocked.gwpClass : (SAFETY[label as CompareGas] ?? null),
      gwp,
      p45: pressureAt45(label),
      oilKey: label in SAFETY ? oilFor(label as CompareGas, def.kind) : null,
      eu: regulationStatus(gwp),
    };
  });
}

// ── Supply formats: the catalog's own weight bands ──

export const FORMATS: readonly WeightBand[] = WEIGHT_BANDS;

export interface FormatSummary {
  band: WeightBand;
  products: number;
  /** Net kg of the smallest and largest size in the band. */
  minKg: number;
  maxKg: number;
  gases: string[];
  containers: string[];
  perKg: { min: number; max: number } | null;
  /** Deposit per cylinder, as charged (distinct values). */
  deposits: number[];
}

export function formatSummaries(products: StoreProduct[]): FormatSummary[] {
  return FORMATS.map((band) => {
    const list = products.filter((p) => weightBandOf(p) === band);
    const kg = list.map((p) => p.weightKg);
    const prices = list.filter((p) => p.pricePerKg > 0).map((p) => p.pricePerKg);
    return {
      band,
      products: list.length,
      minKg: kg.length ? Math.min(...kg) : 0,
      maxKg: kg.length ? Math.max(...kg) : 0,
      gases: [...new Set(list.map((p) => markOf(p)).filter((m): m is NonNullable<typeof m> => m !== null).map(gasLabel))],
      containers: [...new Set(list.map((p) => p.containerType))],
      perKg: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
      deposits: [...new Set(list.map((p) => p.cylinderDeposit).filter((d) => d > 0))].sort((a, b) => a - b),
    };
  });
}

// ── Configurator ──

export const OBJECTS = ["split", "auto", "heatpump", "coldroom", "service"] as const;
export type ObjectType = (typeof OBJECTS)[number];
export const PRIORITIES = ["lowGwp", "oem", "economy"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const SCALES = [1, 3, 6, 12] as const;

const OBJECT_GASES: Record<Exclude<ObjectType, "service">, { gases: string[]; oem: string }> = {
  split: { gases: ["R32", "R410A"], oem: "R32" },
  // Cars: R-134a is the factory gas of the older fleet; every new EU car since 2017 uses R-1234yf (not stocked).
  auto: { gases: ["R134a", "R1234yf"], oem: "R134a" },
  heatpump: { gases: ["R32", "R290"], oem: "R32" },
  coldroom: { gases: ["R404A", "R407C"], oem: "R404A" },
};

export interface BundleLine {
  product: StoreProduct;
  qty: number;
}

export type Bundle =
  | { ok: true; gas: string | null; lines: BundleLine[]; noteKey: string | null; netKg: number; co2eT: number; deposit: number; goods: number; gwp: number | null; shortBy: number }
  | { ok: false; gas: string | null; reason: "notStocked" | "outOfStock"; noteKey: string | null; candidates: StoreProduct[] };

const gwpOf = (mark: string, products: StoreProduct[]) => products.find((p) => markOf(p) === mark && p.gwp !== null)?.gwp ?? GWP_REFERENCE[gasLabel(mark) as CompareGas] ?? null;

/** The recommended bundle: deterministic, from the catalog the page holds. */
export function buildBundle(products: StoreProduct[], object: ObjectType, priority: Priority, scale: number): Bundle {
  const total = (lines: BundleLine[], gas: string | null, noteKey: string | null): Bundle => {
    const netKg = lines.reduce((s, l) => s + (l.product.pricedPerKg ? l.product.weightKg * l.qty : 0), 0);
    const co2eT = lines.reduce((s, l) => s + (l.product.pricedPerKg && l.product.gwp ? (l.product.weightKg * l.qty * l.product.gwp) / 1000 : 0), 0);
    const shortBy = Math.max(0, ...lines.map((l) => l.qty - l.product.stockQuantity));
    return {
      ok: true,
      gas,
      lines,
      noteKey,
      netKg: Math.round(netKg * 100) / 100,
      co2eT: Math.round(co2eT * 1000) / 1000,
      deposit: Math.round(lines.reduce((s, l) => s + l.product.cylinderDeposit * l.qty, 0) * 100) / 100,
      goods: Math.round(lines.reduce((s, l) => s + l.product.cylinderPrice * l.qty, 0) * 100) / 100,
      gwp: gas ? gwpOf(gas, products) : null,
      shortBy,
    };
  };

  if (object === "service") {
    // One recovery cylinder and one manifold set, whatever the scale says about gas.
    const tools = products.filter((p) => p.category === "recovery" || p.category === "equipment");
    const buyable = tools.filter(isPurchasable);
    if (buyable.length === 0) return { ok: false, gas: null, reason: "outOfStock", noteKey: "note_service", candidates: tools };
    return total(buyable.map((product) => ({ product, qty: 1 })), null, "note_service");
  }

  const def = OBJECT_GASES[object];
  const cylinders = (marks: string[]) => products.filter((p) => p.pricedPerKg && p.category !== "blends" && p.weightKg <= GAS_SECTOR_MAX_KG && marks.includes(markOf(p) ?? ""));
  let gas: string;
  if (priority === "economy") {
    const buyable = cylinders(def.gases).filter(isPurchasable);
    if (buyable.length === 0) return { ok: false, gas: null, reason: "outOfStock", noteKey: null, candidates: cylinders(def.gases) };
    const best = buyable.reduce((a, b) => (b.pricePerKg < a.pricePerKg ? b : a));
    return total([{ product: best, qty: scale }], markOf(best), "note_economy");
  }
  if (priority === "lowGwp") gas = [...def.gases].sort((a, b) => (gwpOf(a, products) ?? 1e9) - (gwpOf(b, products) ?? 1e9))[0]!;
  else gas = def.oem;

  const sizes = cylinders([gas]);
  const noteKey = object === "auto" && priority === "oem" ? "note_autoOem" : priority === "lowGwp" ? "note_lowGwp" : "note_oem";
  if (sizes.length === 0) return { ok: false, gas, reason: "notStocked", noteKey, candidates: [] };
  const buyable = sizes.filter(isPurchasable);
  if (buyable.length === 0) return { ok: false, gas, reason: "outOfStock", noteKey, candidates: sizes };
  // The service size: the smallest buyable cylinder (cheapest per kg among equals).
  const pick = buyable.reduce((a, b) => (b.weightKg < a.weightKg || (b.weightKg === a.weightKg && b.pricePerKg < a.pricePerKg) ? b : a));
  return total([{ product: pick, qty: scale }], gas, noteKey);
}
