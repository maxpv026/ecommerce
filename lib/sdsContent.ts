import type { GasMark } from "./gasMarks";

/**
 * Content for the generated safety data sheets, as plain data.
 *
 * components/pdf/SafetyDataSheet.tsx only lays this out; every claim the
 * document makes is in this file, so a reviewer can check the wording in one
 * place without reading layout code.
 *
 * What is NOT here, by design, and why the document renders as a DRAFT until
 * it is supplied:
 *
 *   - Supplier identity (REACH Annex II §1.3). Taken from the same
 *     INVOICE_SELLER_* environment the invoices use, so the legal entity on
 *     the SDS can never disagree with the one on the invoice.
 *   - Emergency telephone (§1.4). SDS_EMERGENCY_PHONE. An emergency number
 *     on a flammable-gas SDS that nobody answers is worse than none.
 *   - The manufacturer's REACH registration numbers (§1.1 for a substance,
 *     one per component in §3.2 for a blend) and chemical safety assessment
 *     statement (§15.2). Transcribed from the manufacturer's own SDS — we are
 *     a distributor, not the registrant.
 *   - Sign-off (`release`). REACH Art. 31 requires an SDS to be compiled by a
 *     competent person. Until someone qualified has checked this file against
 *     the manufacturer's SDS and signed it, nothing here reaches a customer:
 *     the route keeps serving the static file and only admins see the draft.
 *
 * Text is restricted to the WinAnsi character set (no ≥, →, subscripts): the
 * document uses the built-in Helvetica, which cannot draw anything else.
 */

// ── types ──────────────────────────────────────────────────────────────────

export type SdsBlock =
  | { kind: "fields"; rows: SdsField[] }
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; columns: { label: string; width: string }[]; rows: string[][] }
  | { kind: "pictograms"; items: { code: string; label: string }[] };

export interface SdsField {
  label: string;
  value: string;
  /** Rendered as a red gap in the draft rather than as a plausible value. */
  missing?: boolean;
}

export interface SdsSubsection {
  ref: string;
  title: string;
  blocks: SdsBlock[];
}

export interface SdsSection {
  number: number;
  title: string;
  /** Hazard sections get the red accent instead of the blue one. */
  tone?: "hazard";
  subsections: SdsSubsection[];
}

export interface SafetyDataSheetData {
  brand: string;
  productName: string;
  sku: string;
  substance: string;
  revision: string;
  issuedOn: string;
  signalWord: string;
  hazardCodes: string[];
  transportLine: string;
  sections: SdsSection[];
  /** Everything still missing. Empty means the sheet may be released. */
  draftReasons: string[];
}

/** Product facts that differ between pack sizes of the same gas. */
export interface SdsProductInput {
  name: string;
  sku: string;
  /** Percent, from Product.purity. Differs per product (99.9 vs 99.95). */
  purity: number | null;
  /** From Product.gwp — the same figure the catalog and CO2e report use. */
  gwp: number | null;
}

export interface SdsSupplierInput {
  name: string;
  addressLines: string[];
  vatId?: string;
  email?: string;
  emergencyPhone: string | null;
}

/** Filled in by the competent person who reviewed the sheet. */
export interface SdsRelease {
  revision: string;
  /** ISO date, e.g. "2026-10-20". */
  issuedOn: string;
  /** Name and qualification, e.g. "Jana Novak, SDS author (competent person)". */
  approvedBy: string;
}


// ── per-gas profiles ───────────────────────────────────────────────────────

/** One substance in the product: the gas itself, or one part of a blend. */
interface SdsComponent {
  name: string;
  cas: string;
  ec: string;
  /** Share by weight for a mixture; null for a substance (purity comes from the product row). */
  share: string | null;
  classification: string;
}

/**
 * Everything that differs between refrigerants. One builder (buildSheet)
 * turns any profile into the 16 sections, so adding a gas is a data change:
 * write its profile, add it to SDS_SHEETS, and have it reviewed.
 */
export interface SdsGasProfile {
  /** "Difluoromethane (R-32)", used in the PDF metadata. */
  headline: string;
  /** Shown as "Substance name" (substance) or "Product type" (mixture). */
  identity: string;
  /** A mixture has no REACH number of its own: its components do (§3.2). */
  kind: "substance" | "mixture";
  formula?: string;
  components: SdsComponent[];
  /** Drives the fire, release, handling and reactivity wording. */
  flammable: boolean;
  safetyGroup: "A1" | "A2L";
  classification: { category: string; code: HCode }[];
  pictograms: { code: string; label: string }[];
  signalWord: "Danger" | "Warning";
  precautionary: string[];
  physical: SdsField[];
  exposureLimit: string;
  acuteToxicity: string;
  persistence: string;
  transport: {
    un: string;
    adrName: string;
    iataName: string;
    hazardClass: string;
    adrCode: string;
    tunnel: string;
    ems: string;
    iata: string;
  };
  /** Seveso III category, for flammable gases only. */
  seveso: string | null;
  release: SdsRelease | null;
  manufacturer: {
    /** One per component, in the same order. A substance has exactly one. */
    registrationNumbers: (string | null)[];
    /** §15.2 — whether the registrant carried out a chemical safety assessment. */
    chemicalSafetyAssessment: string | null;
  };
}

type HCode = keyof typeof H_TEXT;

const H_TEXT = {
  H220: "Extremely flammable gas.",
  H280: "Contains gas under pressure; may explode if heated.",
} as const;

const P_FLAMMABLE = [
  "P210 Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking.",
  "P377 Leaking gas fire: Do not extinguish, unless leak can be stopped safely.",
  "P381 In case of leakage, eliminate all ignition sources.",
  "P410+P403 Protect from sunlight. Store in a well-ventilated place.",
];
const P_PRESSURE_ONLY = ["P410+P403 Protect from sunlight. Store in a well-ventilated place."];

const PICTO_FLAME = { code: "GHS02", label: "Flame" };
const PICTO_CYLINDER = { code: "GHS04", label: "Gas cylinder" };

const CLASS_FLAMMABLE = { category: "Flammable gas, Category 1 (Flam. Gas 1)", code: "H220" as const };
const CLASS_PRESSURE = { category: "Gas under pressure, Liquefied gas (Press. Gas (Liq.))", code: "H280" as const };

const CLP_FLAMMABLE_GAS = "Flam. Gas 1, H220; Press. Gas (Liq.), H280";
const CLP_PRESSURE_ONLY = "Press. Gas (Liq.), H280";

const COMMON_PHYSICAL: SdsField[] = [
  { label: "Physical state", value: "Liquefied gas" },
  { label: "Colour", value: "Colourless" },
  { label: "Odour", value: "Slight, ether-like" },
];

const TRANSPORT_NON_FLAMMABLE = {
  hazardClass: "2.2",
  adrCode: "2A",
  tunnel: "Tunnel code (C/E)",
  ems: "EmS F-C, S-V",
  iata: "Passenger and cargo aircraft",
};

// ── release state ──────────────────────────────────────────────────────────
//
// `release` is the competent person's sign-off for that gas's sheet. It is
// a statement that someone qualified checked the profile above it against
// the manufacturer's SDS — set it per gas, only after that review.
//
// The manufacturer facts below are PLACEHOLDERS for local end-to-end testing
// only — not any manufacturer's data. Gated to development so a deploy can
// never publish them: a production build sees null, keeps every sheet a
// draft, and customers keep getting the static files. Replace with §1.1 /
// §3.2 and §15.2 of each manufacturer's SDS and drop the gate.

const IS_DEV = process.env.NODE_ENV === "development";
const devOnly = <T,>(value: T): T | null => (IS_DEV ? value : null);
const TEST_REGISTRATION = "01-2119471312-47-0000";
const TEST_CSA = "A chemical safety assessment has been carried out for this substance.";

const TEST_RELEASE: SdsRelease = {
  revision: "1.0",
  issuedOn: "2026-10-20",
  approvedBy: "Maksym Pyvovarov, CTO",
};

// ── R-32 ───────────────────────────────────────────────────────────────────

const R32: SdsGasProfile = {
  headline: "Difluoromethane (R-32)",
  identity: "Difluoromethane (HFC-32, R-32)",
  kind: "substance",
  formula: "CH2F2",
  components: [{ name: "Difluoromethane", cas: "75-10-5", ec: "200-839-4", share: null, classification: CLP_FLAMMABLE_GAS }],
  flammable: true,
  safetyGroup: "A2L",
  classification: [CLASS_FLAMMABLE, CLASS_PRESSURE],
  pictograms: [PICTO_FLAME, PICTO_CYLINDER],
  signalWord: "Danger",
  precautionary: P_FLAMMABLE,
  physical: [
    ...COMMON_PHYSICAL,
    { label: "Molar mass", value: "52.02 g/mol" },
    { label: "Boiling point (1.013 bar)", value: "-51.7 °C" },
    { label: "Critical temperature", value: "78.1 °C" },
    { label: "Vapour pressure (25 °C)", value: "16.9 bar" },
    { label: "Relative vapour density (air = 1)", value: "1.8" },
    { label: "Flammability limits in air", value: "14.4 - 29.3 vol %" },
    { label: "Auto-ignition temperature", value: "648 °C" },
  ],
  exposureLimit: "1000 ppm, 8-hour time-weighted average.",
  acuteToxicity: "LC50, rat, 4 h: > 520,000 ppm. Not classified.",
  persistence: "Degrades in the atmosphere; atmospheric lifetime approx. 5 years.",
  transport: {
    un: "3252",
    adrName: "DIFLUOROMETHANE (REFRIGERANT GAS R 32)",
    iataName: "Difluoromethane",
    hazardClass: "2.1",
    adrCode: "2F",
    tunnel: "Tunnel code (B/D)",
    ems: "EmS F-D, S-U",
    iata: "Cargo aircraft only",
  },
  seveso: "Directive 2012/18/EU (Seveso III): Annex I, Part 1, category P2 (flammable gases).",
  release: TEST_RELEASE,
  manufacturer: {
    registrationNumbers: [devOnly(TEST_REGISTRATION)],
    chemicalSafetyAssessment: devOnly(TEST_CSA),
  },
};

// ── R-134a ─────────────────────────────────────────────────────────────────

const R134A: SdsGasProfile = {
  headline: "1,1,1,2-Tetrafluoroethane (R-134a)",
  identity: "1,1,1,2-Tetrafluoroethane (HFC-134a, R-134a)",
  kind: "substance",
  formula: "CH2FCF3",
  components: [{ name: "1,1,1,2-Tetrafluoroethane", cas: "811-97-2", ec: "212-377-0", share: null, classification: CLP_PRESSURE_ONLY }],
  flammable: false,
  safetyGroup: "A1",
  classification: [CLASS_PRESSURE],
  pictograms: [PICTO_CYLINDER],
  signalWord: "Warning",
  precautionary: P_PRESSURE_ONLY,
  physical: [
    ...COMMON_PHYSICAL,
    { label: "Molar mass", value: "102.03 g/mol" },
    { label: "Boiling point (1.013 bar)", value: "-26.1 °C" },
    { label: "Critical temperature", value: "101.1 °C" },
    { label: "Vapour pressure (25 °C)", value: "6.7 bar" },
    { label: "Relative vapour density (air = 1)", value: "3.5" },
    { label: "Flammability", value: "Not flammable" },
  ],
  exposureLimit: "1000 ppm, 8-hour time-weighted average.",
  acuteToxicity: "LC50, rat, 4 h: > 500,000 ppm. Not classified.",
  persistence: "Degrades in the atmosphere; atmospheric lifetime approx. 14 years.",
  transport: {
    un: "3159",
    adrName: "1,1,1,2-TETRAFLUOROETHANE (REFRIGERANT GAS R 134a)",
    iataName: "1,1,1,2-Tetrafluoroethane",
    ...TRANSPORT_NON_FLAMMABLE,
  },
  seveso: null,
  release: TEST_RELEASE,
  manufacturer: {
    registrationNumbers: [devOnly(TEST_REGISTRATION)],
    chemicalSafetyAssessment: devOnly(TEST_CSA),
  },
};

// ── R-410A ─────────────────────────────────────────────────────────────────

const R410A: SdsGasProfile = {
  headline: "Refrigerant blend R-410A",
  identity: "Mixture: difluoromethane / pentafluoroethane (R-410A)",
  kind: "mixture",
  components: [
    { name: "Difluoromethane (R-32)", cas: "75-10-5", ec: "200-839-4", share: "50 %", classification: CLP_FLAMMABLE_GAS },
    { name: "Pentafluoroethane (R-125)", cas: "354-33-6", ec: "206-557-8", share: "50 %", classification: CLP_PRESSURE_ONLY },
  ],
  flammable: false,
  safetyGroup: "A1",
  classification: [CLASS_PRESSURE],
  pictograms: [PICTO_CYLINDER],
  signalWord: "Warning",
  precautionary: P_PRESSURE_ONLY,
  physical: [
    ...COMMON_PHYSICAL,
    { label: "Molar mass (average)", value: "72.6 g/mol" },
    { label: "Boiling point (1.013 bar)", value: "approx. -51.5 °C" },
    { label: "Relative vapour density (air = 1)", value: "2.5" },
    { label: "Flammability", value: "Not flammable" },
  ],
  exposureLimit: "1000 ppm, 8-hour time-weighted average, for each component.",
  acuteToxicity: "Not classified. Based on the components, acute inhalation toxicity is low.",
  persistence: "The components degrade slowly in the atmosphere.",
  transport: {
    un: "3163",
    adrName: "LIQUEFIED GAS, N.O.S. (Difluoromethane, Pentafluoroethane)",
    iataName: "Liquefied gas, n.o.s. (Difluoromethane, Pentafluoroethane)",
    ...TRANSPORT_NON_FLAMMABLE,
  },
  seveso: null,
  release: TEST_RELEASE,
  manufacturer: {
    registrationNumbers: [devOnly(TEST_REGISTRATION), devOnly(TEST_REGISTRATION)],
    chemicalSafetyAssessment: devOnly(TEST_CSA),
  },
};

// ── R-404A ─────────────────────────────────────────────────────────────────

const R404A: SdsGasProfile = {
  headline: "Refrigerant blend R-404A",
  identity: "Mixture: pentafluoroethane / 1,1,1-trifluoroethane / 1,1,1,2-tetrafluoroethane (R-404A)",
  kind: "mixture",
  components: [
    { name: "Pentafluoroethane (R-125)", cas: "354-33-6", ec: "206-557-8", share: "44 %", classification: CLP_PRESSURE_ONLY },
    { name: "1,1,1-Trifluoroethane (R-143a)", cas: "420-46-2", ec: "206-996-5", share: "52 %", classification: CLP_FLAMMABLE_GAS },
    { name: "1,1,1,2-Tetrafluoroethane (R-134a)", cas: "811-97-2", ec: "212-377-0", share: "4 %", classification: CLP_PRESSURE_ONLY },
  ],
  flammable: false,
  safetyGroup: "A1",
  classification: [CLASS_PRESSURE],
  pictograms: [PICTO_CYLINDER],
  signalWord: "Warning",
  precautionary: P_PRESSURE_ONLY,
  physical: [
    ...COMMON_PHYSICAL,
    { label: "Molar mass (average)", value: "97.6 g/mol" },
    { label: "Boiling point (1.013 bar)", value: "approx. -46.5 °C" },
    { label: "Relative vapour density (air = 1)", value: "3.4" },
    { label: "Flammability", value: "Not flammable" },
  ],
  exposureLimit: "1000 ppm, 8-hour time-weighted average, for each component.",
  acuteToxicity: "Not classified. Based on the components, acute inhalation toxicity is low.",
  persistence: "The components degrade slowly in the atmosphere.",
  transport: {
    un: "3337",
    adrName: "REFRIGERANT GAS R 404A",
    iataName: "Refrigerant gas R 404A",
    ...TRANSPORT_NON_FLAMMABLE,
  },
  seveso: null,
  release: TEST_RELEASE,
  manufacturer: {
    registrationNumbers: [devOnly(TEST_REGISTRATION), devOnly(TEST_REGISTRATION), devOnly(TEST_REGISTRATION)],
    chemicalSafetyAssessment: devOnly(TEST_CSA),
  },
};

/**
 * Gases with a generated sheet. Every other gas uses its static PDF, so a
 * missing entry here is a fallback, never a broken download.
 */
export const SDS_SHEETS: Partial<Record<GasMark, SdsGasProfile>> = {
  R32: R32,
  R134a: R134A,
  R410A: R410A,
  R404A: R404A,
};

// ── builder ────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** e.g. 01-2119471312-47-0000: type, base number, check digits, registrant. */
const REACH_REGISTRATION = /^01-\d{10}-\d{2}-\d{4}$/;

export function buildSheet(
  gas: SdsGasProfile,
  product: SdsProductInput,
  supplier: SdsSupplierInput,
  today: string
): SafetyDataSheetData {
  const draftReasons: string[] = [];
  // Records a missing input and returns a field that renders as a visible
  // gap. Never a stand-in value: a draft that looks finished gets forwarded.
  const need = (label: string, value: string | null | undefined, reason: string): SdsField => {
    if (value?.trim()) return { label, value };
    draftReasons.push(reason);
    return { label, value: "Not yet supplied", missing: true };
  };

  // A release object is not a sign-off until every field is really filled
  // in: a template pasted with blanks must not lift the watermark.
  const signedOff =
    gas.release !== null &&
    gas.release.revision.trim() !== "" &&
    gas.release.approvedBy.trim() !== "" &&
    ISO_DATE.test(gas.release.issuedOn);
  const release = signedOff ? gas.release : null;
  if (!release) draftReasons.push("Competent-person review and sign-off (release in lib/sdsContent.ts)");

  // Registration numbers, one per component. A typo would print a number
  // that belongs to nobody, so the format is checked, not just presence.
  const registrations = gas.components.map((_, i) => gas.manufacturer.registrationNumbers[i]?.trim() || null);
  if (registrations.some((r) => r === null)) {
    draftReasons.push(
      gas.kind === "substance"
        ? "REACH registration number, transcribed from the manufacturer's SDS"
        : "REACH registration numbers of the components (section 3), from the manufacturer's SDS"
    );
  }
  for (const r of registrations) {
    if (r && !REACH_REGISTRATION.test(r)) {
      draftReasons.push(`REACH registration number "${r}" is not in the 01-XXXXXXXXXX-XX-XXXX format`);
    }
  }

  const purity = product.purity !== null ? `min. ${product.purity} %` : null;
  const gwp = product.gwp !== null ? String(product.gwp) : null;
  const address = supplier.addressLines.length ? supplier.addressLines.join(", ") : null;
  const hCodes = gas.classification.map((c) => c.code);
  const hText = hCodes.map((code) => `${code} ${H_TEXT[code]}`).join("\n");
  const fl = gas.flammable;

  const identityRows: SdsField[] =
    gas.kind === "substance"
      ? [
          { label: "Substance name", value: gas.identity },
          { label: "CAS number", value: gas.components[0].cas },
          { label: "EC number", value: gas.components[0].ec },
          ...(gas.formula ? [{ label: "Chemical formula", value: gas.formula }] : []),
          registrations[0]
            ? { label: "REACH registration number", value: registrations[0] }
            : { label: "REACH registration number", value: "Not yet supplied", missing: true },
        ]
      : [
          { label: "Product type", value: gas.identity },
          { label: "REACH registration", value: "Registered components, see section 3.2." },
        ];

  const compositionBlock: SdsBlock =
    gas.kind === "substance"
      ? {
          kind: "table",
          columns: [
            { label: "Component", width: "24%" },
            { label: "CAS", width: "14%" },
            { label: "EC", width: "14%" },
            { label: "Content", width: "16%" },
            { label: "Classification (CLP)", width: "32%" },
          ],
          rows: [[gas.components[0].name, gas.components[0].cas, gas.components[0].ec, purity ?? "Not yet supplied", gas.components[0].classification]],
        }
      : {
          kind: "table",
          columns: [
            { label: "Component", width: "22%" },
            { label: "CAS / EC", width: "15%" },
            { label: "REACH registration", width: "22%" },
            { label: "Weight", width: "9%" },
            { label: "Classification (CLP)", width: "32%" },
          ],
          rows: gas.components.map((c, i) => [
            c.name,
            `${c.cas}\n${c.ec}`,
            registrations[i] ?? "Not yet supplied",
            c.share ?? "",
            c.classification,
          ]),
        };

  const sections: SdsSection[] = [
    {
      number: 1,
      title: `Identification of the ${gas.kind} and of the company`,
      subsections: [
        {
          ref: "1.1",
          title: "Product identifier",
          blocks: [
            {
              kind: "fields",
              rows: [
                { label: "Trade name", value: product.name },
                { label: "Article number (SKU)", value: product.sku },
                ...identityRows,
              ],
            },
          ],
        },
        {
          ref: "1.2",
          title: "Relevant identified uses and uses advised against",
          blocks: [
            {
              kind: "fields",
              rows: [
                { label: "Identified uses", value: "Refrigerant for air-conditioning, heat-pump and refrigeration equipment. Industrial and professional use only." },
                { label: "Uses advised against", value: "Consumer use. Any use other than those identified." },
              ],
            },
          ],
        },
        {
          ref: "1.3",
          title: "Details of the supplier of the safety data sheet",
          blocks: [
            {
              kind: "fields",
              rows: [
                { label: "Company", value: supplier.name },
                need("Address", address, "Supplier registered address (INVOICE_SELLER_ADDRESS)"),
                ...(supplier.vatId ? [{ label: "VAT ID", value: supplier.vatId }] : []),
                ...(supplier.email ? [{ label: "E-mail (competent person)", value: supplier.email }] : []),
              ],
            },
          ],
        },
        {
          ref: "1.4",
          title: "Emergency telephone number",
          blocks: [
            { kind: "fields", rows: [need("Emergency telephone", supplier.emergencyPhone, "24-hour emergency telephone (SDS_EMERGENCY_PHONE)")] },
          ],
        },
      ],
    },
    {
      number: 2,
      title: "Hazards identification",
      tone: "hazard",
      subsections: [
        {
          ref: "2.1",
          title: "Classification according to Regulation (EC) No 1272/2008 (CLP)",
          blocks: [
            {
              kind: "table",
              columns: [
                { label: "Hazard class and category", width: "50%" },
                { label: "Hazard statement", width: "50%" },
              ],
              rows: gas.classification.map((c) => [c.category, c.code]),
            },
          ],
        },
        {
          ref: "2.2",
          title: "Label elements",
          blocks: [
            { kind: "pictograms", items: gas.pictograms },
            {
              kind: "fields",
              rows: [
                { label: "Signal word", value: gas.signalWord },
                { label: "Hazard statements", value: hText },
                { label: "Precautionary statements", value: gas.precautionary.join("\n") },
              ],
            },
          ],
        },
        {
          ref: "2.3",
          title: "Other hazards",
          blocks: [
            {
              kind: "list",
              items: [
                "Rapid evaporation of the liquid may cause frostbite.",
                "In high concentrations displaces oxygen and may cause asphyxiation. The vapour is heavier than air and collects in low-lying and enclosed spaces.",
                `Refrigerant safety group ${gas.safetyGroup} under ISO 817 (${fl ? "lower toxicity, lower flammability" : "lower toxicity, no flame propagation"}). This is a refrigerant classification, not a CLP classification, and does not replace section 2.1.`,
                gas.kind === "substance" ? "Not a PBT or vPvB substance." : "The components are not PBT or vPvB substances.",
              ],
            },
          ],
        },
      ],
    },
    {
      number: 3,
      title: "Composition / information on ingredients",
      subsections: [
        {
          ref: gas.kind === "substance" ? "3.1" : "3.2",
          title: gas.kind === "substance" ? "Substance" : "Mixture",
          blocks: [
            compositionBlock,
            ...(gas.kind === "substance" && !purity
              ? [{ kind: "text" as const, text: "Purity missing for this SKU (Product.purity)." }]
              : []),
          ],
        },
      ],
    },
    {
      number: 4,
      title: "First-aid measures",
      subsections: [
        {
          ref: "4.1",
          title: "Description of first-aid measures",
          blocks: [
            {
              kind: "fields",
              rows: [
                { label: "Inhalation", value: "Move to fresh air. Keep warm and at rest. If breathing is difficult, give oxygen; if breathing has stopped, give artificial respiration. Get medical attention." },
                { label: "Skin contact", value: "Liquid contact: treat as frostbite. Thaw affected area with lukewarm water. Do not rub. Remove contaminated clothing carefully, it may adhere to the skin. Get medical attention." },
                { label: "Eye contact", value: "Rinse immediately with plenty of water for at least 15 minutes, holding the eyelids open. Get medical attention." },
                { label: "Ingestion", value: "Not considered a likely route of exposure for a gas." },
              ],
            },
          ],
        },
        {
          ref: "4.2",
          title: "Most important symptoms and effects",
          blocks: [{ kind: "text", text: "High concentrations: dizziness, drowsiness, loss of coordination, unconsciousness, cardiac arrhythmia. Liquid contact: frostbite." }],
        },
        {
          ref: "4.3",
          title: "Immediate medical attention and special treatment",
          blocks: [{ kind: "text", text: "Do not give adrenaline or similar sympathomimetic drugs: exposure may sensitise the heart and cause arrhythmia. Treat symptomatically." }],
        },
      ],
    },
    {
      number: 5,
      title: "Firefighting measures",
      tone: "hazard",
      subsections: [
        {
          ref: "5.1",
          title: "Extinguishing media",
          blocks: [
            {
              kind: "fields",
              rows: fl
                ? [
                    { label: "Suitable", value: "Water spray, dry chemical powder, carbon dioxide." },
                    { label: "Unsuitable", value: "Water jet." },
                  ]
                : [{ label: "Suitable", value: "The product does not burn. Use extinguishing media appropriate to the surrounding fire." }],
            },
          ],
        },
        {
          ref: "5.2",
          title: `Special hazards arising from the ${gas.kind}`,
          blocks: [{ kind: "text", text: "Heat raises the pressure in the cylinder and may cause it to burst. Thermal decomposition produces hydrogen fluoride, carbonyl fluoride and carbon monoxide." }],
        },
        {
          ref: "5.3",
          title: "Advice for firefighters",
          blocks: [
            {
              kind: "text",
              text: `Wear self-contained breathing apparatus and full protective clothing. Cool exposed cylinders with water spray from a protected position.${fl ? " Do not extinguish a leaking gas flame unless the leak can be stopped safely." : ""}`,
            },
          ],
        },
      ],
    },
    {
      number: 6,
      title: "Accidental release measures",
      subsections: [
        {
          ref: "6.1",
          title: "Personal precautions and emergency procedures",
          blocks: [
            {
              kind: "text",
              text: `Evacuate the area.${fl ? " Eliminate all ignition sources." : ""} Ventilate. Do not enter confined spaces unless the atmosphere has been tested and found safe; otherwise use self-contained breathing apparatus.`,
            },
          ],
        },
        {
          ref: "6.2",
          title: "Environmental precautions",
          blocks: [{ kind: "text", text: "Prevent entry into sewers, basements, pits and other low areas where the gas may accumulate." }],
        },
        {
          ref: "6.3",
          title: "Methods for containment and cleaning up",
          blocks: [{ kind: "text", text: "Stop the leak if it is safe to do so. Ventilate the area until the gas has dispersed. Recover the refrigerant where possible (see section 13)." }],
        },
      ],
    },
    {
      number: 7,
      title: "Handling and storage",
      subsections: [
        {
          ref: "7.1",
          title: "Precautions for safe handling",
          blocks: [
            {
              kind: "list",
              items: [
                "To be handled only by personnel certified under Commission Implementing Regulation (EU) 2015/2067.",
                fl
                  ? `Use only equipment and tools rated for ${gas.safetyGroup} refrigerants and for the cylinder pressure. Use non-sparking tools and earth equipment.`
                  : "Use only equipment and tools rated for this refrigerant and for the cylinder pressure.",
                "Keep the cylinder valve closed when not in use. Prevent backflow into the cylinder.",
                "Do not drag, roll, slide or drop cylinders. Use a suitable trolley.",
              ],
            },
          ],
        },
        {
          ref: "7.2",
          title: "Conditions for safe storage",
          blocks: [
            {
              kind: "list",
              items: [
                "Store upright and secured against falling, in a well-ventilated area, with valve protection fitted.",
                "Keep below 50 °C and out of direct sunlight.",
                fl
                  ? "Store away from ignition sources and separate from oxidising gases and materials."
                  : "Store away from heat sources.",
                fl
                  ? "Comply with national rules on the storage of flammable gases. Transport (ADR) requirements are in section 14."
                  : "Comply with national rules on the storage of gases under pressure. Transport (ADR) requirements are in section 14.",
              ],
            },
          ],
        },
        {
          ref: "7.3",
          title: "Specific end uses",
          blocks: [{ kind: "text", text: "Refrigerant. See section 1.2." }],
        },
      ],
    },
    {
      number: 8,
      title: "Exposure controls / personal protection",
      subsections: [
        {
          ref: "8.1",
          title: "Control parameters",
          blocks: [
            {
              kind: "fields",
              rows: [
                { label: "EU occupational exposure limit", value: "None established." },
                { label: "Manufacturer recommended limit", value: gas.exposureLimit },
              ],
            },
          ],
        },
        {
          ref: "8.2",
          title: "Exposure controls",
          blocks: [
            {
              kind: "fields",
              rows: [
                {
                  label: "Engineering controls",
                  value: fl
                    ? `Adequate ventilation, particularly in low and enclosed areas. Refrigerant gas detection where required for ${gas.safetyGroup} installations.`
                    : "Adequate ventilation, particularly in low and enclosed areas.",
                },
                { label: "Eye protection", value: "Safety glasses with side shields (EN 166)." },
                { label: "Hand protection", value: "Cold-insulating gloves (EN 511) when handling the liquid." },
                { label: "Body protection", value: fl ? "Flame-retardant, antistatic work clothing and safety footwear." : "Work clothing and safety footwear." },
                { label: "Respiratory protection", value: "Self-contained breathing apparatus in oxygen-deficient atmospheres. Filter respirators are not suitable." },
              ],
            },
          ],
        },
      ],
    },
    {
      number: 9,
      title: "Physical and chemical properties",
      subsections: [
        {
          ref: "9.1",
          title: "Basic physical and chemical properties",
          blocks: [
            {
              kind: "fields",
              rows: [...gas.physical, { label: "Refrigerant safety group (ISO 817)", value: gas.safetyGroup }],
            },
          ],
        },
      ],
    },
    {
      number: 10,
      title: "Stability and reactivity",
      subsections: [
        {
          ref: "10.1",
          title: "Reactivity, stability and conditions to avoid",
          blocks: [
            {
              kind: "fields",
              rows: [
                { label: "Reactivity", value: "No hazardous reactions under normal conditions of storage and use." },
                { label: "Chemical stability", value: "Stable under recommended storage conditions." },
                { label: "Hazardous reactions", value: fl ? "Forms flammable mixtures with air." : "None known under normal conditions." },
                { label: "Conditions to avoid", value: fl ? "Heat, sparks, open flames and other ignition sources." : "Heat, open flames and hot surfaces." },
                { label: "Incompatible materials", value: "Alkali and alkaline-earth metals, finely divided aluminium, zinc and magnesium, strong oxidising agents." },
                { label: "Hazardous decomposition", value: "Hydrogen fluoride, carbonyl fluoride, carbon monoxide." },
              ],
            },
          ],
        },
      ],
    },
    {
      number: 11,
      title: "Toxicological information",
      subsections: [
        {
          ref: "11.1",
          title: "Information on hazard classes",
          blocks: [
            {
              kind: "fields",
              rows: [
                { label: "Acute toxicity (inhalation)", value: gas.acuteToxicity },
                { label: "Skin and eye", value: "Liquid contact causes frostbite. Not classified as irritant." },
                { label: "Sensitisation", value: "Not classified. High concentrations may cause cardiac sensitisation." },
                { label: "CMR effects", value: "Not classified as mutagenic, carcinogenic or toxic to reproduction." },
                { label: "STOT / aspiration", value: "Not classified." },
              ],
            },
          ],
        },
      ],
    },
    {
      number: 12,
      title: "Ecological information",
      subsections: [
        {
          ref: "12.1",
          title: "Toxicity, persistence and other effects",
          blocks: [
            {
              kind: "fields",
              rows: [
                { label: "Aquatic toxicity", value: "Not classified as hazardous to the aquatic environment." },
                { label: "Persistence", value: gas.persistence },
                { label: "Bioaccumulation", value: "Not expected to bioaccumulate." },
                { label: "PBT / vPvB", value: "Not PBT, not vPvB." },
                { label: "Ozone depletion potential", value: "0" },
                need("Global warming potential (100 yr)", gwp, "GWP for this SKU (Product.gwp)"),
              ],
            },
            { kind: "text", text: "Fluorinated greenhouse gas covered by Regulation (EU) 2024/573." },
          ],
        },
      ],
    },
    {
      number: 13,
      title: "Disposal considerations",
      subsections: [
        {
          ref: "13.1",
          title: "Waste treatment methods",
          blocks: [
            {
              kind: "list",
              items: [
                "Do not vent to atmosphere. Recovery by certified personnel is mandatory under Regulation (EU) 2024/573.",
                "Return recovered refrigerant to the supplier for reclamation or destruction.",
                "Return empty cylinders to the supplier. Cylinders retain residual pressure.",
              ],
            },
            {
              kind: "fields",
              rows: [
                { label: "EWC code (refrigerant)", value: "14 06 01* chlorofluorocarbons, HCFC, HFC" },
                { label: "EWC code (cylinder)", value: "16 05 04* gases in pressure containers containing hazardous substances" },
              ],
            },
          ],
        },
      ],
    },
    {
      number: 14,
      title: "Transport information",
      tone: "hazard",
      subsections: [
        {
          ref: "14.1-14.7",
          title: "ADR / RID, IMDG, IATA",
          blocks: [
            {
              kind: "table",
              columns: [
                { label: "", width: "28%" },
                { label: "ADR / RID", width: "24%" },
                { label: "IMDG", width: "24%" },
                { label: "IATA", width: "24%" },
              ],
              rows: [
                ["UN number", `UN ${gas.transport.un}`, `UN ${gas.transport.un}`, `UN ${gas.transport.un}`],
                ["Proper shipping name", gas.transport.adrName, gas.transport.adrName, gas.transport.iataName],
                ["Class / label", `${gas.transport.hazardClass} (code ${gas.transport.adrCode})`, gas.transport.hazardClass, gas.transport.hazardClass],
                ["Packing group", "Not applicable", "Not applicable", "Not applicable"],
                ["Environmental hazard", "No", "Marine pollutant: No", "No"],
                ["Special provisions", gas.transport.tunnel, gas.transport.ems, gas.transport.iata],
              ],
            },
            {
              kind: "list",
              items: [
                "Transport cylinders upright and secured, valves closed and protected.",
                "Ensure adequate ventilation of the load compartment. Avoid transport in vehicles where the load space is not separated from the driver.",
                "The driver must know the hazards of the load and what to do in an emergency.",
              ],
            },
          ],
        },
      ],
    },
    {
      number: 15,
      title: "Regulatory information",
      subsections: [
        {
          ref: "15.1",
          title: "Safety, health and environmental regulations",
          blocks: [
            {
              kind: "list",
              items: [
                gas.kind === "substance"
                  ? "Regulation (EU) 2024/573 on fluorinated greenhouse gases: listed in Annex I."
                  : "Regulation (EU) 2024/573 on fluorinated greenhouse gases: contains HFCs listed in Annex I.",
                "Commission Implementing Regulation (EU) 2015/2067: certification of personnel.",
                ...(gas.seveso ? [gas.seveso] : []),
                "Regulation (EC) No 1907/2006 (REACH) and Regulation (EC) No 1272/2008 (CLP).",
              ],
            },
          ],
        },
        {
          ref: "15.2",
          title: "Chemical safety assessment",
          blocks: [
            {
              kind: "fields",
              rows: [
                need(
                  "Assessment",
                  gas.manufacturer.chemicalSafetyAssessment,
                  "Chemical safety assessment statement, from the manufacturer's SDS"
                ),
              ],
            },
          ],
        },
      ],
    },
    {
      number: 16,
      title: "Other information",
      subsections: [
        {
          ref: "16.1",
          title: "Revision, abbreviations and sign-off",
          blocks: [
            {
              kind: "fields",
              rows: [
                { label: "Revision", value: release?.revision ?? "Draft" },
                { label: "Date of issue", value: release?.issuedOn ?? `Draft generated ${today}` },
                { label: "Approved by", value: release?.approvedBy ?? "Not yet approved", missing: !release },
                { label: "Full text of H statements", value: hText },
                {
                  label: "Abbreviations",
                  value:
                    "ADR: European Agreement concerning the International Carriage of Dangerous Goods by Road. CLP: Regulation (EC) No 1272/2008. EWC: European Waste Catalogue. GWP: global warming potential. PBT: persistent, bioaccumulative, toxic. vPvB: very persistent, very bioaccumulative.",
                },
              ],
            },
            {
              kind: "text",
              text: "The information in this safety data sheet is based on our present knowledge and the manufacturer's data. It describes the product with regard to safety requirements and does not constitute a guarantee of product properties.",
            },
          ],
        },
      ],
    },
  ];

  return {
    brand: "My Energy",
    productName: product.name,
    sku: product.sku,
    substance: gas.headline,
    revision: release?.revision ?? "Draft",
    issuedOn: release?.issuedOn ?? today,
    signalWord: gas.signalWord.toUpperCase(),
    hazardCodes: hCodes,
    transportLine: `UN ${gas.transport.un} · Class ${gas.transport.hazardClass}`,
    sections,
    draftReasons,
  };
}
