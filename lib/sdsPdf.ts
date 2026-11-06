import "server-only";

import { Font, renderToBuffer } from "@react-pdf/renderer";
import SafetyDataSheet from "@/components/pdf/SafetyDataSheet";
import { sellerDetails } from "@/lib/pdf";
import { gasMarkForProduct } from "@/lib/productMedia";
import { SDS_SHEETS, buildSheet, type SafetyDataSheetData, type SdsProductInput } from "@/lib/sdsContent";

/**
 * Generated safety data sheets.
 *
 * Only gases listed in SDS_SHEETS have one; every other gas keeps its static
 * PDF. `server-only` for the same reason as lib/pdf.ts: @react-pdf is
 * Node-only and several hundred kilobytes.
 */

/** Fixed locale, like the invoice: an SDS revision is an archival record. */
const DATE_FMT = new Intl.DateTimeFormat("en-IE", { day: "2-digit", month: "short", year: "numeric" });

/** The sheet's data for this product, or null if its gas has no generated sheet. */
export function buildSafetyDataSheet(product: SdsProductInput): SafetyDataSheetData | null {
  const mark = gasMarkForProduct(product);
  const gas = mark ? SDS_SHEETS[mark] : undefined;
  if (!gas) return null;

  const seller = sellerDetails();
  return buildSheet(
    gas,
    product,
    { ...seller, emergencyPhone: process.env.SDS_EMERGENCY_PHONE?.trim() || null },
    DATE_FMT.format(new Date())
  );
}

export function renderSafetyDataSheet(data: SafetyDataSheetData): Promise<Buffer> {
  // The default hyphenator splits words mid-token ("RE-FRIGERANT"), which
  // on a shipping name or CAS number reads as a different identifier.
  Font.registerHyphenationCallback((word) => [word]);
  // Called as a plain function, not via createElement — renderToBuffer wants
  // the <Document> element itself (same as the invoice).
  return renderToBuffer(SafetyDataSheet({ data }));
}
