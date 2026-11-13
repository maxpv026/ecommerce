import { markOf } from "@/lib/catalogFacets";
import { isPurchasable } from "@/lib/waitlist";
import type { StoreProduct } from "@/lib/data";

/**
 * /categories — the catalog seen by application ("sector") rather than by
 * database category. Pure: the page hands it the listed catalog.
 *
 * Sector membership is a rule over real product fields (gas mark, net kg,
 * category). Gas sectors take cylinders up to 30 kg; everything above 30 kg
 * (the catalog's own `over30` weight band) and custom blends sit in the bulk
 * sector, so a product appears in one gas sector at most — the heat-pump
 * sector is the one deliberate overlap (R-32 serves both).
 *
 * Gases the catalog doesn't stock (R-290, R-1234yf) are shown as such, never
 * linked or priced.
 */

export const SECTORS = ["ac", "auto", "heatpump", "commercial", "bulk", "equipment"] as const;
export type Sector = (typeof SECTORS)[number];

/** Catalog mark ("R1234yf") → compare label ("R-1234yf"). */
export const gasLabel = (mark: string) => mark.replace(/^R(?=\d)/, "R-");

interface SectorDef {
  /** The sector's headline gases, in display order (marks) — the card's gas pills. */
  gases: string[];
  /** Every gas whose cylinders belong in the sector (headline gases first). */
  marks: string[];
  /** The catalog link for "all items in this sector". */
  href: Record<string, string>;
}

export const SECTOR_DEFS: Record<Sector, SectorDef> = {
  ac: { gases: ["R32", "R410A"], marks: ["R32", "R410A"], href: { gasType: "R32,R410A" } },
  auto: { gases: ["R134a", "R1234yf"], marks: ["R134a", "R1234yf"], href: { gasType: "R134a,R1234yf" } },
  heatpump: { gases: ["R290", "R32"], marks: ["R290", "R32"], href: { gasType: "R32,R290" } },
  // R-404A and its lower-GWP service alternatives, R-407C, and R-513A (the R-134a chiller route).
  commercial: {
    gases: ["R404A", "R407C"],
    marks: ["R404A", "R407C", "R449A", "R452A", "R407F", "R422D", "R507", "R513A", "R125A"],
    href: { gasType: "R404A,R407C,R449A,R452A,R407F,R422D,R507,R513A" },
  },
  bulk: { gases: [], marks: [], href: { kg: "over30" } },
  equipment: { gases: [], marks: [], href: { category: "equipment,recovery" } },
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
