import type { SdsDocument } from "./types";

// The static SDS files we hold, one per gas — placeholders that say so on
// their face (scripts/generate-sds-assets.mjs), served until a gas's
// generated sheet is released (lib/sdsContent). Keep the two in step: adding
// a document here without regenerating leaves a download link on a 404.
// The "download all" archive is built per request from this list
// (app/api/documents/sds-archive), so it can't drift from the rows.
export const SDS_ASSET_DIR = "/sds";
export const SDS_DOCUMENTS: SdsDocument[] = [
  {
    id: 1,
    name: "R-410A Premium",
    cas: "Mixture (75-10-5 / 354-33-6)",
    category: "Blend",
    doc: "SDS v2.4 · Jan 2026",
    badges: ["F-Gas Certified", "A1 Non-flammable"],
    file: "R-410A-SDS.pdf",
    gas: "R-410A",
  },
  {
    id: 2,
    name: "R-32 Premium",
    cas: "75-10-5",
    category: "Single component",
    doc: "SDS v2.1 · Oct 2025",
    badges: ["F-Gas Certified", "A2L Mildly Flammable"],
    file: "R-32-SDS.pdf",
    gas: "R-32",
  },
  {
    id: 3,
    name: "R-134a Standard",
    cas: "811-97-2",
    category: "Single component",
    doc: "SDS v3.0 · Mar 2026",
    badges: ["F-Gas Certified", "A1 Non-flammable"],
    file: "R-134a-SDS.pdf",
    gas: "R-134a",
  },
  {
    id: 4,
    name: "R-404A Reclaimed",
    cas: "Mixture (AHRI-700)",
    category: "Reclaimed",
    doc: "SDS v1.8 · Aug 2025",
    badges: ["F-Gas Certified", "Reclaimed"],
    file: "R-404A-SDS.pdf",
    gas: "R-404A",
  },
  {
    id: 5,
    name: "R-407C Service",
    cas: "Mixture (354-33-6 / 811-97-2)",
    category: "Blend",
    doc: "SDS v2.2 · Dec 2025",
    badges: ["F-Gas Certified", "A1 Non-flammable"],
    file: "R-407C-SDS.pdf",
    gas: "R-407C",
  },
  {
    id: 7,
    name: "R-1234yf",
    cas: "754-12-1",
    category: "Single component",
    doc: "SDS v1.6 · Nov 2025",
    badges: ["A2L Mildly Flammable"],
    file: "R-1234yf-SDS.pdf",
    gas: "R-1234yf",
  },
];
