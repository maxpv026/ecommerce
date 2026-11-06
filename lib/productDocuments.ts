import { normalizeMark } from "./gasMarks";
import { gasMarkForProduct, type ProductIdentity } from "./productMedia";
import { SDS_ASSET_DIR, SDS_DOCUMENTS } from "./sds";

/**
 * Which compliance document a product has, and where the file lives.
 *
 * Shared by the PDP buttons (to decide whether a row is a download or an
 * "on request" note) and by /api/documents/[type]/[sku] (to resolve a SKU to
 * a file). Keeping one resolver means the button can never offer a document
 * the route would then 404 on.
 *
 * Documents are per refrigerant, not per SKU: "R-410A Premium 11.3 kg" and
 * "R-410A Bulk 50 kg" share one safety data sheet. So a product is reduced
 * to its gas mark first (the same matcher the catalog filters and artwork
 * use) and the document is looked up by mark.
 *
 * Every file is a static asset under /public, served from the CDN. Nothing
 * here is generated: a safety data sheet is the manufacturer's document
 * (REACH Art. 31), and one we wrote ourselves would read as authoritative
 * while carrying hazard and first-aid text nobody qualified signed off on.
 */

export const PRODUCT_DOCUMENT_TYPES = ["sds", "adr", "coa", "ahri"] as const;
export type ProductDocumentType = (typeof PRODUCT_DOCUMENT_TYPES)[number];

export function isProductDocumentType(value: string): value is ProductDocumentType {
  return (PRODUCT_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export interface ProductDocumentFile {
  /** Public path of the file itself, e.g. "/sds/R-410A-SDS.pdf". */
  path: string;
  /** Suggested save-as name for the browser. */
  filename: string;
  /** Revision line as the SDS library shows it, e.g. "SDS v2.4 · Jan 2026". */
  revision: string;
}

/** The file for this document type and product, or null when we hold none. */
export function productDocument(type: ProductDocumentType, product: ProductIdentity): ProductDocumentFile | null {
  const mark = gasMarkForProduct(product);
  if (!mark) return null;

  switch (type) {
    case "sds": {
      // Same catalog the /compliance/sds library lists, so the PDP and the
      // library always hand out the same file and revision.
      const sds = SDS_DOCUMENTS.find((doc) => normalizeMark(doc.gas) === normalizeMark(mark));
      return sds ? { path: `${SDS_ASSET_DIR}/${sds.file}`, filename: sds.file, revision: sds.doc } : null;
    }
    case "adr":
      // No ADR document exists for any product yet. ADR paperwork is the
      // per-shipment transport document (UN number, class 2.2, quantity,
      // consignor/consignee) plus the cylinder's TPED marking, so the real
      // source is the order/shipment record, not a file per gas. Until one of
      // those is wired up, the PDP shows this row as "on request".
      return null;
    case "coa":
      // Per lot, by definition: it certifies the cylinder actually shipped.
      // Needs a lot number on the order item and the supplier's certificate
      // stored against it; neither exists in the schema yet.
      return null;
    case "ahri":
      // AHRI-700 purity conformance is issued by the reclaimer/supplier per
      // batch. Same missing input as the certificate of analysis.
      return null;
  }
}
