import { Document, Page, Polygon, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { SafetyDataSheetData, SdsBlock, SdsSection } from "@/lib/sdsContent";

/**
 * A REACH Annex II safety data sheet, laid out to match the platform.
 *
 * Same contract as InvoiceDocument: a pure function of plain data. Every
 * word the sheet says lives in lib/sdsContent.ts; this file decides only
 * where it goes. Not a React DOM component; never import it into a client one.
 *
 * Built-in Helvetica only, so nothing has to be font-loaded on the server.
 * The cost is the WinAnsi character set — the content file keeps to it.
 *
 * A sheet with anything missing renders with a DRAFT watermark and a red
 * banner listing what is missing, so a draft can never pass for the real
 * thing if someone forwards it.
 */

const NAVY = "#0F172A";
const WHITE = "#FFFFFF";
const SURFACE = "#F8FAFC";
const MUTED = "#64748B";
const HAIRLINE = "#E2E8F0";
const BLUE = "#3B82F6";
const RED = "#EF4444";
const RED_TINT = "#FEF2F2";
// A multiplier of the style's OWN fontSize: react-pdf resolves it before
// inheritance, so every style that sets it also sets BODY explicitly —
// otherwise it multiplies the 18pt default and the text double-spaces.
const BODY = 8.5;
const LEADING = 1.4;

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 54,
    paddingHorizontal: 36,
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: NAVY,
    backgroundColor: WHITE,
    // No lineHeight here: on <Page> it stops react-pdf painting the fixed
    // footer at all. Body text styles carry LEADING instead.
  },

  // ── header ──
  hero: {
    backgroundColor: NAVY,
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 2.4, color: "#93C5FD" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 21, color: WHITE, letterSpacing: -0.4, marginTop: 6 },
  regulation: { fontSize: 7.5, color: "#CBD5E1", textAlign: "right", maxWidth: 200, lineHeight: 1.45 },

  metaGrid: {
    flexDirection: "row",
    marginTop: 10,
    borderWidth: 1,
    borderColor: HAIRLINE,
    borderRadius: 8,
    backgroundColor: SURFACE,
  },
  metaCell: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: HAIRLINE },
  metaCellLast: { flex: 1, paddingVertical: 8, paddingHorizontal: 10 },
  metaLabel: { fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.1, color: MUTED },
  metaValue: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginTop: 3 },

  hazardStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: RED_TINT,
  },
  hazardLeft: { flexDirection: "row", alignItems: "center" },
  signal: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1.4,
    color: WHITE,
    backgroundColor: RED,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    marginRight: 8,
  },
  hChip: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: RED,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginRight: 5,
    backgroundColor: WHITE,
  },
  transport: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: NAVY },

  draftBanner: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: RED },
  draftTitle: { fontFamily: "Helvetica-Bold", fontSize: 9, color: RED, letterSpacing: 0.6 },
  draftItem: { fontSize: 8, color: NAVY, marginTop: 2 },

  watermark: {
    position: "absolute",
    top: 330,
    left: 70,
    fontFamily: "Helvetica-Bold",
    fontSize: 120,
    color: RED,
    opacity: 0.07,
    transform: "rotate(-32deg)",
  },

  // ── sections ──
  section: { marginTop: 12, borderWidth: 1, borderColor: HAIRLINE, borderRadius: 8 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  sectionHeadHazard: { backgroundColor: RED_TINT, borderBottomColor: "#FECACA" },
  sectionNum: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: WHITE,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
    marginRight: 8,
  },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5, letterSpacing: -0.1 },
  sectionBody: { paddingHorizontal: 10, paddingTop: 2, paddingBottom: 8 },

  subTitle: { fontFamily: "Helvetica-Bold", fontSize: 8, marginTop: 7, marginBottom: 3 },
  subRef: { color: MUTED },

  fieldRow: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: HAIRLINE },
  fieldLabel: { width: "34%", paddingRight: 8, color: MUTED, fontSize: BODY, lineHeight: LEADING },
  fieldValue: { flex: 1, fontSize: BODY, lineHeight: LEADING },
  fieldMissing: { flex: 1, fontSize: BODY, lineHeight: LEADING, fontFamily: "Helvetica-Bold", color: RED },

  text: { marginTop: 2, fontSize: BODY, lineHeight: LEADING },
  listRow: { flexDirection: "row", marginTop: 2 },
  bullet: { width: 9, color: BLUE },
  listText: { flex: 1, fontSize: BODY, lineHeight: LEADING },

  table: { borderWidth: 0.5, borderColor: HAIRLINE, borderRadius: 4, marginTop: 2 },
  tableHead: { flexDirection: "row", backgroundColor: SURFACE, borderBottomWidth: 0.5, borderBottomColor: HAIRLINE },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: HAIRLINE },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7, color: MUTED, letterSpacing: 0.4, paddingVertical: 4, paddingHorizontal: 5 },
  td: { fontSize: 8, lineHeight: LEADING, paddingVertical: 4, paddingHorizontal: 5 },
  tdFirst: { fontSize: 8, lineHeight: LEADING, paddingVertical: 4, paddingHorizontal: 5, fontFamily: "Helvetica-Bold" },

  pictos: { flexDirection: "row", marginTop: 4, marginBottom: 4 },
  picto: { alignItems: "center", marginRight: 16, width: 54 },
  pictoCode: { position: "absolute", top: 20, width: 54, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 7, color: NAVY },
  pictoLabel: { fontSize: 6.5, color: MUTED, marginTop: 2 },

  // ── footer ──
  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: HAIRLINE,
    paddingTop: 6,
    fontSize: 7,
    color: MUTED,
  },
});

function Block({ block }: { block: SdsBlock }) {
  switch (block.kind) {
    case "fields":
      return (
        <View>
          {block.rows.map((row) => (
            <View key={row.label} style={styles.fieldRow} wrap={false}>
              <Text style={styles.fieldLabel}>{row.label}</Text>
              <Text style={row.missing ? styles.fieldMissing : styles.fieldValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      );
    case "text":
      return <Text style={styles.text}>{block.text}</Text>;
    case "list":
      return (
        <View>
          {block.items.map((item) => (
            <View key={item} style={styles.listRow} wrap={false}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case "table":
      // Kept whole: these tables are a few rows, and a header stranded at the
      // foot of a page reads as an empty classification.
      return (
        <View style={styles.table} wrap={false}>
          <View style={styles.tableHead}>
            {block.columns.map((col, i) => (
              <Text key={i} style={[styles.th, { width: col.width }]}>
                {col.label}
              </Text>
            ))}
          </View>
          {block.rows.map((row, r) => (
            <View key={r} style={[styles.tableRow, r === block.rows.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
              {row.map((cell, c) => (
                <Text key={c} style={[c === 0 ? styles.tdFirst : styles.td, { width: block.columns[c].width }]}>
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case "pictograms":
      // The GHS frame (red diamond) with the pictogram code inside. The
      // official symbols are artwork, not drawable shapes; the code is what
      // CLP section 2.2 requires the SDS to identify.
      return (
        <View style={styles.pictos}>
          {block.items.map((p) => (
            <View key={p.code} style={styles.picto}>
              <Svg width={46} height={46} viewBox="0 0 46 46">
                <Polygon points="23,2 44,23 23,44 2,23" fill={WHITE} stroke={RED} strokeWidth={3} />
              </Svg>
              <Text style={styles.pictoCode}>{p.code}</Text>
              <Text style={styles.pictoLabel}>{p.label}</Text>
            </View>
          ))}
        </View>
      );
  }
}

/** Splits each subsection's content into the part kept with its heading and the rest. */
function splitSubsections(section: SdsSection) {
  return section.subsections.map((sub) => {
    const [first, ...others] = sub.blocks;
    let lead: SdsBlock | undefined = first;
    let rest: SdsBlock[] = others;
    if (first?.kind === "fields" && first.rows.length > 1) {
      lead = { kind: "fields", rows: first.rows.slice(0, 1) };
      rest = [{ kind: "fields", rows: first.rows.slice(1) }, ...others];
    } else if (first?.kind === "list" && first.items.length > 1) {
      lead = { kind: "list", items: first.items.slice(0, 1) };
      rest = [{ kind: "list", items: first.items.slice(1) }, ...others];
    }
    return { ref: sub.ref, title: sub.title, lead, rest };
  });
}

function Section({ section }: { section: SdsSection }) {
  const hazard = section.tone === "hazard";
  return (
    <View style={styles.section}>
      {/* Header never strands at the bottom of a page without content. */}
      <View style={[styles.sectionHead, hazard ? styles.sectionHeadHazard : {}]} wrap={false} minPresenceAhead={60}>
        <Text style={[styles.sectionNum, { backgroundColor: hazard ? RED : BLUE }]}>
          {String(section.number).padStart(2, "0")}
        </Text>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
      <View style={styles.sectionBody}>
        {splitSubsections(section).map(({ ref, title, lead, rest }) => (
          <View key={ref}>
            {/* The heading travels with the first row of its content, so it
                can never sit alone at the foot of a page. Only the first ROW:
                holding a whole long block unbreakable near a page end makes
                react-pdf paint the next content over it. */}
            <View wrap={false}>
              <Text style={styles.subTitle}>
                <Text style={styles.subRef}>{ref}  </Text>
                {title}
              </Text>
              {lead && <Block block={lead} />}
            </View>
            {rest.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function SafetyDataSheet({ data }: { data: SafetyDataSheetData }) {
  const isDraft = data.draftReasons.length > 0;
  const meta = [
    { label: "PRODUCT", value: data.productName },
    { label: "SKU", value: data.sku },
    { label: "REVISION", value: data.revision },
    { label: isDraft ? "GENERATED" : "DATE OF ISSUE", value: data.issuedOn },
  ];

  return (
    <Document
      title={`Safety Data Sheet - ${data.productName}${isDraft ? " (DRAFT)" : ""}`}
      author={data.brand}
      subject={`${data.substance} - REACH Annex II safety data sheet`}
      language="en"
    >
      <Page size="A4" style={styles.page}>
        {/* Fixed elements go first: declared after content that wraps,
            react-pdf only paints them on the last page. */}
        {isDraft && (
          <Text style={styles.watermark} fixed>
            DRAFT
          </Text>
        )}
        <View style={styles.footer} fixed>
          <Text>
            {data.brand} · SDS {data.productName} · Revision {data.revision}
            {isDraft ? " · DRAFT" : ""}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

        <View style={styles.hero}>
          <View>
            <Text style={styles.brand}>{data.brand.toUpperCase()}</Text>
            <Text style={styles.title}>Safety Data Sheet</Text>
          </View>
          <Text style={styles.regulation}>
            According to Regulation (EC) No 1907/2006 (REACH), Annex II, as amended by Regulation (EU) 2020/878
          </Text>
        </View>

        <View style={styles.metaGrid}>
          {meta.map((m, i) => (
            <View key={m.label} style={i === meta.length - 1 ? styles.metaCellLast : styles.metaCell}>
              <Text style={styles.metaLabel}>{m.label}</Text>
              <Text style={styles.metaValue}>{m.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.hazardStrip}>
          <View style={styles.hazardLeft}>
            <Text style={styles.signal}>{data.signalWord}</Text>
            {data.hazardCodes.map((code) => (
              <Text key={code} style={styles.hChip}>
                {code}
              </Text>
            ))}
          </View>
          <Text style={styles.transport}>{data.transportLine}</Text>
        </View>

        {isDraft && (
          <View style={styles.draftBanner} wrap={false}>
            <Text style={styles.draftTitle}>DRAFT - NOT FOR DISTRIBUTION</Text>
            {data.draftReasons.map((reason) => (
              <Text key={reason} style={styles.draftItem}>
                Missing: {reason}
              </Text>
            ))}
          </View>
        )}

        {data.sections.map((section) => (
          <Section key={section.number} section={section} />
        ))}
      </Page>
    </Document>
  );
}
