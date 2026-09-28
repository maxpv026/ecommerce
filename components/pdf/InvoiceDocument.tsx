import type { ReactElement } from "react";
import { Document, Page, Text, View, StyleSheet, type DocumentProps } from "@react-pdf/renderer";

/**
 * The invoice PDF.
 *
 * Deliberately a pure function of plain data — no Prisma types, no Decimal,
 * no Date objects. lib/pdf.ts does the fetching and the money maths and hands
 * this component numbers and strings, which keeps the document renderable
 * from a test, a script or a route handler without a database.
 *
 * Note this is NOT a React DOM component. `@react-pdf/renderer`'s Text/View
 * are its own primitives and its StyleSheet is a small subset of CSS —
 * flexbox and absolute positioning only, no grid, no cascade, no `gap` on
 * older versions. It must never be imported into a client component.
 */

export interface InvoiceLine {
  /** e.g. "R-410A Premium" */
  name: string;
  sku: string;
  /** Pack description as sold, e.g. "10 kg cylinder". */
  variant: string;
  quantity: number;
  /** Price of ONE unit at purchase time, in euros. */
  unitPrice: number;
  /** quantity × unitPrice. */
  lineTotal: number;
}

export interface InvoiceDocumentData {
  invoiceNumber: string;
  /** Already formatted for print — this component does no date maths. */
  issuedAt: string;
  dueDate: string | null;
  orderNumber: string;
  status: "PENDING" | "PAID" | "CANCELLED";

  seller: { name: string; addressLines: string[]; vatId?: string; email?: string };
  buyer: {
    name: string | null;
    company: string | null;
    email: string | null;
    /** Frozen shipping address snapshot, one line per entry. */
    addressLines: string[];
    /** Buyer's VAT number, where the account has one recorded. */
    vatId?: string | null;
  };

  lines: InvoiceLine[];
  /** Goods only, VAT-bearing. */
  subtotal: number;
  /** Refundable returnable-packaging deposit; outside the VAT base. */
  deposit: number;
  /** How many cylinders that deposit covers, for the deposit row's label. */
  depositUnits: number;
  shipping: number;
  vat: number;
  vatRatePercent: number;
  /** What the customer was actually charged. Everything above sums to this. */
  total: number;
  currency: string;
}

// Tech-Luxury on paper: monochrome, hairline rules, wide letter-spacing on
// the small caps, and one accent reserved for the amount due.
const INK = "#0f172a";
const MUTED = "#64748b";
const HAIRLINE = "#e2e8f0";
const ACCENT = "#1d4ed8";

/**
 * Styles depend on which family was registered.
 *
 * With Noto Sans available, bold is the same family at weight 700. Without it
 * we fall back to the built-in "Helvetica-Bold", which is a *separate family
 * name* in PDF's standard-14 set rather than a weight — the two cannot be
 * expressed the same way, which is why this is a factory rather than a
 * constant.
 */
function makeStyles(family?: string) {
  const REG = family ?? "Helvetica";
  const BOLD_FAMILY = family ?? "Helvetica-Bold";
  const BOLD = family
    ? { fontFamily: BOLD_FAMILY, fontWeight: 700 as const }
    : { fontFamily: BOLD_FAMILY };

  return StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingBottom: 56,
      paddingHorizontal: 48,
      fontSize: 9.5,
      fontFamily: REG,
      color: INK,
      lineHeight: 1.5,
    },

    // ── header ──
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    brand: { fontSize: 15, ...BOLD, letterSpacing: -0.3 },
    brandRule: { width: 26, height: 2, backgroundColor: INK, marginTop: 6, marginBottom: 8 },
    sellerLine: { fontSize: 8.5, color: MUTED },

    // lineHeight 1 overrides the page's 1.5: at 22pt the inherited leading
    // put the glyphs below their own box and the first meta row printed
    // through the title. The margin then supplies the gap explicitly.
    docTitle: {
      fontSize: 22,
      ...BOLD,
      letterSpacing: -0.6,
      textAlign: "right",
      lineHeight: 1,
      marginBottom: 12,
    },
    docMetaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 },
    docMetaLabel: { fontSize: 8.5, color: MUTED, marginRight: 8 },
    docMetaValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },

    // ── parties ──
    parties: { flexDirection: "row", marginTop: 34 },
    party: { flex: 1, paddingRight: 24 },
    caption: {
      fontSize: 7,
      color: MUTED,
      letterSpacing: 1.1,
      marginBottom: 6,
      ...BOLD,
    },
    partyName: { fontSize: 10.5, ...BOLD, marginBottom: 2 },
    partyLine: { fontSize: 9, color: MUTED },

    // ── items table ──
    table: { marginTop: 30 },
    headRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: INK,
      paddingBottom: 6,
    },
    row: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: HAIRLINE,
      paddingVertical: 9,
    },
    colItem: { flex: 1 },
    colQty: { width: 42, textAlign: "right" },
    colUnit: { width: 76, textAlign: "right" },
    colTotal: { width: 82, textAlign: "right" },
    headCell: { fontSize: 7, letterSpacing: 1.1, color: MUTED, fontFamily: "Helvetica-Bold" },
    itemName: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
    itemMeta: { fontSize: 8, color: MUTED, marginTop: 1.5 },
    num: { fontSize: 9.5 },

    // ── totals ──
    totals: { marginTop: 18, flexDirection: "row", justifyContent: "flex-end" },
    totalsInner: { width: 232 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5 },
    totalLabel: { fontSize: 9, color: MUTED },
    totalValue: { fontSize: 9 },
    grandRule: { height: 1, backgroundColor: INK, marginTop: 8, marginBottom: 8 },
    grandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    grandLabel: { fontSize: 10, ...BOLD, letterSpacing: 0.2 },
    grandValue: { fontSize: 16, ...BOLD, color: ACCENT, letterSpacing: -0.4 },

    // ── notes / footer ──
    note: {
      marginTop: 26,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: HAIRLINE,
      fontSize: 8,
      color: MUTED,
    },
    noteStrong: { ...BOLD, color: INK },
    paidStamp: {
      marginTop: 14,
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: ACCENT,
      color: ACCENT,
      fontSize: 8,
      ...BOLD,
      letterSpacing: 1.4,
      paddingVertical: 3,
      paddingHorizontal: 8,
    },
    footer: {
      position: "absolute",
      bottom: 28,
      left: 48,
      right: 48,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7.5,
      color: MUTED,
    },
  });
}

/** Fixed locale on purpose: an invoice is a record, not a localized view. */
function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

type Styles = ReturnType<typeof makeStyles>;

function MetaRow({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.docMetaRow}>
      <Text style={styles.docMetaLabel}>{label}</Text>
      <Text style={styles.docMetaValue}>{value}</Text>
    </View>
  );
}

function TotalRow({
  label,
  value,
  currency,
  styles,
}: {
  label: string;
  value: number;
  currency: string;
  styles: Styles;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{money(value, currency)}</Text>
    </View>
  );
}

export default function InvoiceDocument({
  data,
  fontFamily,
}: {
  data: InvoiceDocumentData;
  /** Registered Unicode family; undefined falls back to Latin-1 Helvetica. */
  fontFamily?: string;
}): ReactElement<DocumentProps> {
  const styles = makeStyles(fontFamily);
  const {
    invoiceNumber, issuedAt, dueDate, orderNumber, status,
    seller, buyer, lines, subtotal, deposit, depositUnits,
    shipping, vat, vatRatePercent, total, currency,
  } = data;

  return (
    <Document
      title={`Invoice ${invoiceNumber}`}
      author={seller.name}
      subject={`Invoice ${invoiceNumber} for order ${orderNumber}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{seller.name}</Text>
            <View style={styles.brandRule} />
            {seller.addressLines.map((line, i) => (
              <Text key={i} style={styles.sellerLine}>{line}</Text>
            ))}
            {seller.vatId ? <Text style={styles.sellerLine}>VAT {seller.vatId}</Text> : null}
            {seller.email ? <Text style={styles.sellerLine}>{seller.email}</Text> : null}
          </View>

          <View>
            <Text style={styles.docTitle}>INVOICE</Text>
            <MetaRow label="Invoice no." value={invoiceNumber} styles={styles} />
            <MetaRow label="Order" value={orderNumber} styles={styles} />
            <MetaRow label="Issued" value={issuedAt} styles={styles} />
            {dueDate ? <MetaRow label="Due" value={dueDate} styles={styles} /> : null}
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.caption}>BILL TO</Text>
            <Text style={styles.partyName}>{buyer.company || buyer.name || "—"}</Text>
            {buyer.company && buyer.name ? <Text style={styles.partyLine}>{buyer.name}</Text> : null}
            {buyer.addressLines.map((line, i) => (
              <Text key={i} style={styles.partyLine}>{line}</Text>
            ))}
            {buyer.email ? <Text style={styles.partyLine}>{buyer.email}</Text> : null}
            {buyer.vatId ? <Text style={styles.partyLine}>VAT {buyer.vatId}</Text> : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, styles.colItem]}>DESCRIPTION</Text>
            <Text style={[styles.headCell, styles.colQty]}>QTY</Text>
            <Text style={[styles.headCell, styles.colUnit]}>UNIT</Text>
            <Text style={[styles.headCell, styles.colTotal]}>AMOUNT</Text>
          </View>

          {lines.map((line, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <View style={styles.colItem}>
                <Text style={styles.itemName}>{line.name}</Text>
                <Text style={styles.itemMeta}>
                  {line.sku}
                  {line.variant ? ` · ${line.variant}` : ""}
                </Text>
              </View>
              <Text style={[styles.num, styles.colQty]}>{line.quantity}</Text>
              <Text style={[styles.num, styles.colUnit]}>{money(line.unitPrice, currency)}</Text>
              <Text style={[styles.num, styles.colTotal]}>{money(line.lineTotal, currency)}</Text>
            </View>
          ))}

          {/* The deposit is its own row, never folded into a product line:
              it is refundable on return and sits outside the VAT base, so a
              buyer reclaiming VAT must be able to see it separately. */}
          {deposit > 0 ? (
            <View style={styles.row} wrap={false}>
              <View style={styles.colItem}>
                <Text style={styles.itemName}>Cylinder deposit</Text>
                <Text style={styles.itemMeta}>
                  Refundable on return · {depositUnits} cylinder{depositUnits === 1 ? "" : "s"}
                </Text>
              </View>
              <Text style={[styles.num, styles.colQty]}>{depositUnits}</Text>
              <Text style={[styles.num, styles.colUnit]}>
                {money(depositUnits > 0 ? deposit / depositUnits : 0, currency)}
              </Text>
              <Text style={[styles.num, styles.colTotal]}>{money(deposit, currency)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsInner}>
            <TotalRow label="Subtotal (goods)" value={subtotal} currency={currency} styles={styles} />
            {deposit > 0 ? (
              <TotalRow label="Cylinder deposit" value={deposit} currency={currency} styles={styles} />
            ) : null}
            <TotalRow label="Shipping" value={shipping} currency={currency} styles={styles} />
            <TotalRow label={`VAT ${vatRatePercent}%`} value={vat} currency={currency} styles={styles} />

            <View style={styles.grandRule} />
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>TOTAL DUE</Text>
              <Text style={styles.grandValue}>{money(total, currency)}</Text>
            </View>
          </View>
        </View>

        {status === "PAID" ? <Text style={styles.paidStamp}>PAID</Text> : null}
        {status === "CANCELLED" ? <Text style={styles.paidStamp}>CANCELLED</Text> : null}

        <View style={styles.note}>
          <Text>
            <Text style={styles.noteStrong}>Cylinder deposit.</Text> Cylinders remain the property of{" "}
            {seller.name}. The deposit shown above is refundable in full when the cylinders are
            returned undamaged; it is not consideration for a supply of goods and carries no VAT.
          </Text>
          {dueDate ? (
            <Text style={{ marginTop: 5 }}>
              <Text style={styles.noteStrong}>Payment.</Text> Due by {dueDate}. Please quote invoice{" "}
              {invoiceNumber} with your transfer.
            </Text>
          ) : null}
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {invoiceNumber} · {orderNumber}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
