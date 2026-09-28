import type { ReactElement } from "react";
import { Document, Page, Text, View, StyleSheet, type DocumentProps } from "@react-pdf/renderer";

/**
 * The F-Gas purchase record / CO2e report.
 *
 * Same contract as InvoiceDocument: a pure function of plain data — no Prisma
 * types, no Decimal, no Date. lib/complianceReport.ts does the fetching and
 * the arithmetic. Not a React DOM component; never import it into a client one.
 *
 * On what this document claims: it is a record of refrigerant SUPPLIED BY US,
 * with its CO2-equivalent. It is not a certificate of compliance, and the
 * sign-off block says so in as many words. We know what left our warehouse;
 * we do not know the customer's installed base, what they recovered, or what
 * is still sitting in a cylinder on a van — and an audit document that
 * implied otherwise would be worse than no document at all.
 */

export interface ComplianceReportLine {
  date: string;
  orderNumber: string;
  sku: string;
  refrigerant: string;
  quantity: number;
  /** Net kg of gas in the whole line (quantity × unit weight). */
  massKg: number;
  gwp: number | null;
  /** Kilograms of CO2e for the line. */
  co2eKg: number;
  /** Marked on the row when the GWP was reconstructed rather than recorded. */
  estimated: boolean;
}

export interface ComplianceReportTotal {
  refrigerant: string;
  gwp: number | null;
  massKg: number;
  co2eTonnes: number;
  share: number;
}

export interface ComplianceReportData {
  reference: string;
  generatedAt: string;
  periodLabel: string;

  seller: { name: string; addressLines: string[]; vatId?: string; email?: string };
  buyer: {
    name: string | null;
    company: string | null;
    email: string | null;
    vatId?: string | null;
    certificateId?: string | null;
  };

  lines: ComplianceReportLine[];
  totals: ComplianceReportTotal[];

  totalMassKg: number;
  totalCo2eTonnes: number;
  /** Portion in gases at or above the Art. 13 GWP 2500 limit. */
  highGwpTonnes: number;
  highGwpShare: number;

  /** Lines whose GWP we could not establish at all. Printed, never hidden. */
  unknownGwpLines: number;
  /** Lines costed from the current catalogue because the order predates the snapshot. */
  estimatedLines: number;
}

const INK = "#0f172a";
const MUTED = "#64748b";
const HAIRLINE = "#e2e8f0";
const ACCENT = "#1d4ed8";
const WARN = "#b45309";

function makeStyles(family?: string) {
  const REG = family ?? "Helvetica";
  const BOLD_FAMILY = family ?? "Helvetica-Bold";
  const BOLD = family
    ? { fontFamily: BOLD_FAMILY, fontWeight: 700 as const }
    : { fontFamily: BOLD_FAMILY };

  return StyleSheet.create({
    page: { paddingTop: 48, paddingBottom: 64, paddingHorizontal: 48, fontFamily: REG, fontSize: 9.5, color: INK },

    headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    brand: { fontSize: 15, ...BOLD, letterSpacing: -0.3 },
    sellerLine: { fontSize: 8.5, color: MUTED, marginTop: 2 },

    docTitle: { fontSize: 19, ...BOLD, letterSpacing: -0.5, textAlign: "right", maxWidth: 230 },
    docSub: { fontSize: 8.5, color: MUTED, textAlign: "right", marginTop: 3 },

    rule: { borderBottomWidth: 1, borderBottomColor: INK, marginTop: 18, marginBottom: 16 },
    hair: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },

    label: { fontSize: 7, letterSpacing: 1.1, color: MUTED, ...BOLD, marginBottom: 5 },

    parties: { flexDirection: "row", justifyContent: "space-between" },
    party: { maxWidth: 230 },
    partyName: { fontSize: 10.5, ...BOLD, marginBottom: 2 },
    partyLine: { fontSize: 9, color: MUTED },

    // Headline figures
    metrics: { flexDirection: "row", marginTop: 22 },
    metric: { flex: 1, paddingRight: 14 },
    metricValue: { fontSize: 17, ...BOLD, letterSpacing: -0.4 },
    metricUnit: { fontSize: 8.5, color: MUTED, marginTop: 2 },

    // Tables
    tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 5, marginTop: 8 },
    row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: HAIRLINE, paddingVertical: 5 },
    headCell: { fontSize: 7, letterSpacing: 1.1, color: MUTED, ...BOLD },
    cell: { fontSize: 8.5 },
    cellMuted: { fontSize: 8.5, color: MUTED },

    cDate: { width: "13%" },
    cOrder: { width: "16%" },
    cSku: { width: "17%" },
    cGas: { width: "16%" },
    cQty: { width: "8%", textAlign: "right" },
    cMass: { width: "12%", textAlign: "right" },
    cGwp: { width: "8%", textAlign: "right" },
    cCo2: { width: "10%", textAlign: "right" },

    bDot: { width: "4%" },
    bGas: { width: "30%" },
    bGwp: { width: "14%", textAlign: "right" },
    bMass: { width: "20%", textAlign: "right" },
    bCo2: { width: "20%", textAlign: "right" },
    bShare: { width: "12%", textAlign: "right" },

    totalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: INK, paddingTop: 6, marginTop: 2 },

    sectionTitle: { fontSize: 11, ...BOLD, marginTop: 26, marginBottom: 2 },
    sectionNote: { fontSize: 8, color: MUTED, marginBottom: 6, lineHeight: 1.45 },

    notice: {
      marginTop: 10,
      padding: 9,
      borderLeftWidth: 2,
      borderLeftColor: WARN,
      backgroundColor: "#fffbeb",
    },
    noticeText: { fontSize: 8, color: WARN, lineHeight: 1.45 },

    disclaimer: { marginTop: 26, paddingTop: 12, borderTopWidth: 1, borderTopColor: HAIRLINE },
    disclaimerText: { fontSize: 7.5, color: MUTED, lineHeight: 1.5 },

    signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 26 },
    signBox: { width: "45%" },
    signLine: { borderBottomWidth: 1, borderBottomColor: INK, height: 26 },
    signLabel: { fontSize: 7, letterSpacing: 1.1, color: MUTED, ...BOLD, marginTop: 5 },

    footer: {
      position: "absolute",
      bottom: 28,
      left: 48,
      right: 48,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    footerText: { fontSize: 7.5, color: MUTED },
    accent: { color: ACCENT },
  });
}

const nf = (v: number, dp = 2) =>
  v.toLocaleString("en-IE", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default function ComplianceReportPdf({
  data,
  fontFamily,
}: {
  data: ComplianceReportData;
  fontFamily?: string;
}): ReactElement<DocumentProps> {
  const s = makeStyles(fontFamily);
  const buyerName = data.buyer.company || data.buyer.name || data.buyer.email || "—";

  return (
    <Document
      title={`F-Gas purchase record ${data.reference}`}
      author={data.seller.name}
      subject={`Refrigerant supplied and CO2e — ${data.periodLabel}`}
    >
      <Page size="A4" style={s.page}>
        {/* Letterhead */}
        <View style={s.headRow}>
          <View>
            <Text style={s.brand}>{data.seller.name}</Text>
            {data.seller.addressLines.map((l, i) => (
              <Text key={i} style={s.sellerLine}>
                {l}
              </Text>
            ))}
            {data.seller.vatId ? <Text style={s.sellerLine}>VAT {data.seller.vatId}</Text> : null}
            {data.seller.email ? <Text style={s.sellerLine}>{data.seller.email}</Text> : null}
          </View>
          <View>
            <Text style={s.docTitle}>Refrigerant Supply &amp; CO2e Record</Text>
            <Text style={s.docSub}>{data.reference}</Text>
            <Text style={s.docSub}>Period: {data.periodLabel}</Text>
            <Text style={s.docSub}>Issued {data.generatedAt}</Text>
          </View>
        </View>

        <View style={s.rule} />

        {/* Parties */}
        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.label}>ACCOUNT</Text>
            <Text style={s.partyName}>{buyerName}</Text>
            {data.buyer.company && data.buyer.name ? (
              <Text style={s.partyLine}>{data.buyer.name}</Text>
            ) : null}
            {data.buyer.email ? <Text style={s.partyLine}>{data.buyer.email}</Text> : null}
            {data.buyer.vatId ? <Text style={s.partyLine}>VAT {data.buyer.vatId}</Text> : null}
          </View>
          <View style={s.party}>
            <Text style={s.label}>F-GAS CERTIFICATE</Text>
            <Text style={s.partyLine}>
              {data.buyer.certificateId
                ? `Verified — ${data.buyer.certificateId}`
                : "Not recorded on this account"}
            </Text>
          </View>
        </View>

        {/* Headline figures */}
        <View style={s.metrics}>
          <View style={s.metric}>
            <Text style={s.label}>TOTAL CO2e SUPPLIED</Text>
            <Text style={s.metricValue}>{nf(data.totalCo2eTonnes, 3)}</Text>
            <Text style={s.metricUnit}>tonnes CO2-equivalent</Text>
          </View>
          <View style={s.metric}>
            <Text style={s.label}>REFRIGERANT MASS</Text>
            <Text style={s.metricValue}>{nf(data.totalMassKg)}</Text>
            <Text style={s.metricUnit}>kg</Text>
          </View>
          <View style={s.metric}>
            <Text style={s.label}>GWP &gt;= 2500 SHARE</Text>
            <Text style={s.metricValue}>{nf(data.highGwpShare * 100, 1)}%</Text>
            <Text style={s.metricUnit}>{nf(data.highGwpTonnes, 3)} t CO2e</Text>
          </View>
        </View>

        {/* Breakdown by gas */}
        <Text style={s.sectionTitle}>Breakdown by refrigerant</Text>
        <Text style={s.sectionNote}>
          CO2e = net refrigerant mass x GWP. Shares are of the total supplied in this period.
        </Text>
        <View style={s.tableHead}>
          <Text style={[s.headCell, s.bDot]}> </Text>
          <Text style={[s.headCell, s.bGas]}>REFRIGERANT</Text>
          <Text style={[s.headCell, s.bGwp]}>GWP</Text>
          <Text style={[s.headCell, s.bMass]}>MASS (KG)</Text>
          <Text style={[s.headCell, s.bCo2]}>t CO2e</Text>
          <Text style={[s.headCell, s.bShare]}>SHARE</Text>
        </View>
        {data.totals.map((t) => (
          <View key={t.refrigerant} style={s.row} wrap={false}>
            <Text style={[s.cellMuted, s.bDot]}>
              {t.gwp !== null && t.gwp >= 2500 ? "*" : " "}
            </Text>
            <Text style={[s.cell, s.bGas]}>{t.refrigerant}</Text>
            <Text style={[s.cellMuted, s.bGwp]}>{t.gwp ?? "—"}</Text>
            <Text style={[s.cell, s.bMass]}>{nf(t.massKg)}</Text>
            <Text style={[s.cell, s.bCo2]}>{nf(t.co2eTonnes, 3)}</Text>
            <Text style={[s.cellMuted, s.bShare]}>{nf(t.share * 100, 1)}%</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[s.cell, s.bDot]}> </Text>
          <Text style={[s.cell, s.bGas]}>Total</Text>
          <Text style={[s.cell, s.bGwp]}> </Text>
          <Text style={[s.cell, s.bMass]}>{nf(data.totalMassKg)}</Text>
          <Text style={[s.cell, s.bCo2, s.accent]}>{nf(data.totalCo2eTonnes, 3)}</Text>
          <Text style={[s.cell, s.bShare]}>100.0%</Text>
        </View>
        <Text style={[s.sectionNote, { marginTop: 6 }]}>
          * Virgin HFCs with a GWP of 2500 or more may not be used to service refrigeration
          equipment with a charge of 40 tonnes CO2e or more (Regulation 517/2014, Art. 13, since
          1 January 2020). Reclaimed and recycled gas is exempt from that restriction.
        </Text>

        {/* Line-by-line ledger */}
        <Text style={s.sectionTitle}>Supply ledger</Text>
        <Text style={s.sectionNote}>
          Every refrigerant line supplied in this period, in date order.
        </Text>
        <View style={s.tableHead}>
          <Text style={[s.headCell, s.cDate]}>DATE</Text>
          <Text style={[s.headCell, s.cOrder]}>ORDER</Text>
          <Text style={[s.headCell, s.cSku]}>SKU</Text>
          <Text style={[s.headCell, s.cGas]}>REFRIGERANT</Text>
          <Text style={[s.headCell, s.cQty]}>QTY</Text>
          <Text style={[s.headCell, s.cMass]}>MASS (KG)</Text>
          <Text style={[s.headCell, s.cGwp]}>GWP</Text>
          <Text style={[s.headCell, s.cCo2]}>KG CO2e</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={`${l.orderNumber}-${l.sku}-${i}`} style={s.row} wrap={false}>
            <Text style={[s.cellMuted, s.cDate]}>{l.date}</Text>
            <Text style={[s.cellMuted, s.cOrder]}>{l.orderNumber}</Text>
            <Text style={[s.cell, s.cSku]}>{l.sku}</Text>
            <Text style={[s.cell, s.cGas]}>{l.refrigerant}</Text>
            <Text style={[s.cell, s.cQty]}>{l.quantity}</Text>
            <Text style={[s.cell, s.cMass]}>{nf(l.massKg)}</Text>
            <Text style={[s.cellMuted, s.cGwp]}>
              {l.gwp ?? "—"}
              {l.estimated ? " e" : ""}
            </Text>
            <Text style={[s.cell, s.cCo2]}>{nf(l.co2eKg)}</Text>
          </View>
        ))}

        {/* Data-quality notice — only when there is something to disclose */}
        {data.unknownGwpLines > 0 || data.estimatedLines > 0 ? (
          <View style={s.notice}>
            <Text style={s.noticeText}>
              {data.unknownGwpLines > 0
                ? `${data.unknownGwpLines} line(s) carry no GWP figure and contribute 0 to the totals above; the CO2e stated is therefore a lower bound. `
                : ""}
              {data.estimatedLines > 0
                ? `${data.estimatedLines} line(s) marked "e" were costed using the current catalogue GWP because the order predates purchase-time GWP recording.`
                : ""}
            </Text>
          </View>
        ) : null}

        {/* Scope and sign-off */}
        <View style={s.disclaimer} wrap={false}>
          <Text style={s.label}>SCOPE OF THIS DOCUMENT</Text>
          <Text style={s.disclaimerText}>
            This is a record of fluorinated greenhouse gas supplied to the account named above by{" "}
            {data.seller.name}, with the CO2-equivalent of each line calculated as net refrigerant
            mass multiplied by the GWP applicable at the time of supply. It is issued as supporting
            evidence for the record-keeping obligations in Article 6 of Regulation (EU) 517/2014.
            {"\n\n"}
            It is not a certificate of compliance and does not state the holder&apos;s regulatory
            position. It covers only gas purchased from {data.seller.name} and does not account for
            gas obtained elsewhere, refrigerant recovered, reclaimed or destroyed, or the charge of
            any installed system. Leak-check obligations under Article 4 are determined by the
            charge of each individual system, not by cumulative purchases, and cannot be derived
            from this document.
          </Text>
        </View>

        {/* wrap={false}: without it the rules stayed on one page and their
            captions broke to the next, leaving a signature line with no label
            under it and an orphan caption overleaf. Keeping the block atomic
            moves it whole to the next page when it does not fit. */}
        <View style={s.signRow} wrap={false}>
          <View style={s.signBox}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>ISSUED BY — {data.seller.name.toUpperCase()}</Text>
          </View>
          <View style={s.signBox}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>RECEIVED BY / DATE</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {data.reference} · {buyerName}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
