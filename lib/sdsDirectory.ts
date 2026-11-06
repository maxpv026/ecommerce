import "server-only";

import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { CATALOG_COUNTS_TAG } from "@/lib/cacheTags";
import { normalizeMark } from "@/lib/gasMarks";
import { gasMarkForProduct } from "@/lib/productMedia";
import { SDS_ASSET_DIR, SDS_DOCUMENTS } from "@/lib/sds";
import { buildSafetyDataSheet } from "@/lib/sdsPdf";
import type { SdsDocument } from "@/lib/types";
import { LISTED } from "@/lib/productFamily";

/**
 * The /compliance/sds directory rows: the SDS catalog joined to the product
 * catalog, so each row links to the same endpoint the PDP uses and shows the
 * revision of the file that endpoint will actually serve.
 *
 * That last part is the reason this runs on the server. Whether a gas gets
 * the generated sheet or its static file depends on the sign-off and on
 * environment (supplier address, emergency phone), and a directory that
 * printed "Rev 1.0" while the link served the old placeholder would be a
 * revision-control error on a compliance page.
 */

export interface SdsDirectoryEntry extends SdsDocument {
  /** Where the download button points. */
  href: string;
  /** Revision line for the file `href` serves. */
  revision: string;
  /** Date of issue, only when the generated sheet is what's served. */
  updatedOn: string | null;
  /** Every sheet is English today; the column exists so that is stated, not implied. */
  language: "EN";
}

const DATE_FMT = new Intl.DateTimeFormat("en-IE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The catalog fields a sheet needs. Cached like the category counts: the
 * same for every locale, and it only changes when the catalogue does.
 */
const getSdsProducts = unstable_cache(
  async () => {
    const rows = await prisma.product.findMany({
      where: LISTED,
      select: { sku: true, name: true, purity: true, gwp: true },
      orderBy: { createdAt: "asc" },
    });
    // Decimal does not survive the cache's JSON round-trip; number does.
    return rows.map((r) => ({ ...r, purity: r.purity !== null ? Number(r.purity) : null }));
  },
  ["sds-directory-products"],
  { revalidate: 300, tags: [CATALOG_COUNTS_TAG] }
);

export async function getSdsDirectory(): Promise<SdsDirectoryEntry[]> {
  const products = await getSdsProducts();

  return SDS_DOCUMENTS.map((doc) => {
    const key = normalizeMark(doc.gas);
    const forGas = products.filter((p) => {
      const mark = gasMarkForProduct(p);
      return mark !== null && normalizeMark(mark) === key;
    });
    // One row per gas, so one product stands for it: the one whose SKU is the
    // bare mark ("R32") when there is one, else the oldest listing.
    const product = forGas.find((p) => normalizeMark(p.sku) === key) ?? forGas[0];

    if (!product) {
      // A gas we hold a sheet for but don't list (R-454B, R-1234yf): the
      // endpoint is keyed by SKU, so the file is linked directly.
      return { ...doc, href: `${SDS_ASSET_DIR}/${doc.file}`, revision: doc.doc, updatedOn: null, language: "EN" };
    }

    const href = `/api/documents/sds/${encodeURIComponent(product.sku)}`;
    const sheet = buildSafetyDataSheet(product);
    if (sheet && sheet.draftReasons.length === 0) {
      return {
        ...doc,
        href,
        revision: `Rev ${sheet.revision}`,
        updatedOn: DATE_FMT.format(new Date(`${sheet.issuedOn}T00:00:00Z`)),
        language: "EN",
      };
    }
    // Draft or no generated sheet: the endpoint serves the static file, so
    // the row shows that file's revision.
    return { ...doc, href, revision: doc.doc, updatedOn: null, language: "EN" };
  });
}

/** The 24-hour number printed on every generated sheet (SDS §1.4). */
export function sdsEmergencyPhone(): string | null {
  return process.env.SDS_EMERGENCY_PHONE?.trim() || null;
}
