import "server-only";

import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { CATALOG_COUNTS_TAG } from "@/lib/cacheTags";
import { normalizeMark } from "@/lib/gasMarks";
import { gasMarkForProduct } from "@/lib/productMedia";
import { SDS_ASSET_DIR, SDS_DOCUMENTS } from "@/lib/sds";
import { buildSafetyDataSheet } from "@/lib/sdsPdf";
import { LISTED } from "@/lib/productFamily";
import { regulationStatus } from "@/lib/regulation";
import { countryFromPhone } from "@/lib/country";
import { getFgasSummary } from "@/lib/fgasAccount";
import { getCustomerComplianceSummary } from "@/lib/compliance";
import { parseLocalLines, type EmergencyLines } from "@/lib/emergencyContacts";
import { GAS_SAFETY, type SdsRow } from "@/lib/sdsLibrary";
import type { FgasSummary } from "@/lib/fgas";

/**
 * The /compliance/sds rows: the quick-spec table (lib/sdsLibrary) joined to
 * the product catalog and to the sheet each row's button actually serves.
 *
 * That last part is why this runs on the server. Whether a gas gets the
 * generated sheet or its static file depends on the sign-off and on
 * environment (supplier details, REACH numbers), and a directory that said
 * "controlled, Rev 1.0" while the link served the placeholder would be a
 * revision-control error on a compliance page. The static files under
 * /public/sds state on their face that they are placeholders, so a row
 * serving one is labelled that way too.
 */

/** The catalog fields a sheet needs; same for every locale and viewer. */
const getSdsProducts = unstable_cache(
  async () => {
    const rows = await prisma.product.findMany({
      where: LISTED,
      select: { sku: true, name: true, purity: true, gwp: true, category: true },
      orderBy: { createdAt: "asc" },
    });
    // Decimal does not survive the cache's JSON round-trip; number does.
    return rows.map((r) => ({ ...r, purity: r.purity !== null ? Number(r.purity) : null }));
  },
  ["sds-directory-products-v2"],
  { revalidate: 300, tags: [CATALOG_COUNTS_TAG] }
);

type SdsProduct = Awaited<ReturnType<typeof getSdsProducts>>[number];

/** One product stands for its gas: the one whose SKU is the bare mark ("R32"), else the oldest listing. */
function representative(products: SdsProduct[], key: string): SdsProduct | null {
  const forGas = products.filter((p) => {
    const mark = gasMarkForProduct(p);
    return mark !== null && normalizeMark(mark) === key;
  });
  return forGas.find((p) => normalizeMark(p.sku) === key) ?? forGas[0] ?? null;
}

export async function getSdsLibrary(): Promise<SdsRow[]> {
  const products = await getSdsProducts();
  return GAS_SAFETY.map((gas) => {
    const key = normalizeMark(gas.key);
    const product = representative(products, key);
    const file = SDS_DOCUMENTS.find((d) => normalizeMark(d.gas) === key) ?? null;
    const gwpShown = product?.gwp ?? gas.gwp;

    let doc: SdsRow["doc"] = { status: "none", href: null, revision: null, issuedOn: null };
    const sheet = product ? buildSafetyDataSheet(product) : null;
    if (product && sheet && sheet.draftReasons.length === 0) {
      doc = { status: "released", href: `/api/documents/sds/${encodeURIComponent(product.sku)}`, revision: sheet.revision, issuedOn: sheet.issuedOn };
    } else if (file) {
      // Draft or no generated sheet: the endpoint (or the file itself, for a
      // gas we don't list) serves the static placeholder.
      doc = { status: "placeholder", href: product ? `/api/documents/sds/${encodeURIComponent(product.sku)}` : `${SDS_ASSET_DIR}/${file.file}`, revision: file.doc, issuedOn: null };
    }

    return { ...gas, inCatalog: product !== null, gwpShown, eu: regulationStatus(gwpShown), doc };
  });
}

/** What the ZIP holds: exactly the file each row's button serves. */
export async function sdsArchiveEntries(): Promise<Array<{ label: string; filename: string; revision: string; status: "released" | "placeholder"; source: { kind: "generated"; product: SdsProduct } | { kind: "static"; path: string } }>> {
  const products = await getSdsProducts();
  const out: Awaited<ReturnType<typeof sdsArchiveEntries>> = [];
  for (const gas of GAS_SAFETY) {
    const key = normalizeMark(gas.key);
    const product = representative(products, key);
    const sheet = product ? buildSafetyDataSheet(product) : null;
    const file = SDS_DOCUMENTS.find((d) => normalizeMark(d.gas) === key);
    if (product && sheet && sheet.draftReasons.length === 0) {
      out.push({ label: gas.label, filename: `${gas.label}-SDS.pdf`, revision: `Rev ${sheet.revision} · ${sheet.issuedOn}`, status: "released", source: { kind: "generated", product } });
    } else if (file) {
      out.push({ label: gas.label, filename: file.file, revision: file.doc, status: "placeholder", source: { kind: "static", path: `${SDS_ASSET_DIR}/${file.file}` } });
    }
  }
  return out;
}

/** The 24-hour number printed on every generated sheet (SDS §1.4). */
export function sdsEmergencyPhone(): string | null {
  return process.env.SDS_EMERGENCY_PHONE?.trim() || null;
}

/** Our emergency lines: the main one (SDS §1.4) and any local numbers configured. */
export function sdsEmergencyLines(): EmergencyLines {
  const phone = sdsEmergencyPhone();
  return { main: phone ? { phone, country: countryFromPhone(phone) } : null, local: parseLocalLines(process.env.SDS_EMERGENCY_PHONES) };
}

// ── The signed-in buyer ──

export interface BuyerCompliance {
  /** normalizeMark keys of every gas this buyer has ordered. */
  purchased: string[];
  fgas: FgasSummary | null;
  ytd: { year: number; massKg: number; co2eTonnes: number } | null;
  /** lib/userCountry's stored resolution. */
  countryCode: string | null;
}

export async function getBuyerCompliance(userId: string): Promise<BuyerCompliance> {
  const [items, fgas, compliance, user] = await Promise.all([
    prisma.orderItem.findMany({ where: { order: { userId } }, select: { product: { select: { name: true, sku: true } } } }),
    getFgasSummary(userId),
    getCustomerComplianceSummary(userId).catch((error) => {
      console.error("[sds] compliance summary failed:", error);
      return null;
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { countryCode: true } }),
  ]);
  const purchased = [...new Set(items.map((i) => gasMarkForProduct(i.product)).filter((m): m is NonNullable<typeof m> => m !== null).map((m) => normalizeMark(m)))];
  return {
    purchased,
    fgas,
    ytd: compliance ? { year: compliance.generatedAt.getUTCFullYear(), massKg: compliance.yearToDate.massKg, co2eTonnes: compliance.yearToDate.co2eKg / 1000 } : null,
    countryCode: user?.countryCode ?? null,
  };
}
