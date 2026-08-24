import type { SdsCategory, SdsDocument } from "./types";

// Placeholder SDS catalog — swap for a real document store/API later.
export const SDS_DOCUMENTS: SdsDocument[] = [
  {
    id: 1,
    name: "R-410A Premium",
    cas: "Mixture (75-10-5 / 354-33-6)",
    category: "Blend",
    doc: "SDS v2.4 · Jan 2026",
    badges: ["F-Gas Certified", "A1 Non-flammable"],
  },
  {
    id: 2,
    name: "R-32 Premium",
    cas: "75-10-5",
    category: "Single component",
    doc: "SDS v2.1 · Oct 2025",
    badges: ["F-Gas Certified", "A2L Mildly Flammable"],
  },
  {
    id: 3,
    name: "R-134a Standard",
    cas: "811-97-2",
    category: "Single component",
    doc: "SDS v3.0 · Mar 2026",
    badges: ["F-Gas Certified", "A1 Non-flammable"],
  },
  {
    id: 4,
    name: "R-404A Reclaimed",
    cas: "Mixture (AHRI-700)",
    category: "Reclaimed",
    doc: "SDS v1.8 · Aug 2025",
    badges: ["F-Gas Certified", "Reclaimed"],
  },
  {
    id: 5,
    name: "R-407C Service",
    cas: "Mixture (354-33-6 / 811-97-2)",
    category: "Blend",
    doc: "SDS v2.2 · Dec 2025",
    badges: ["F-Gas Certified", "A1 Non-flammable"],
  },
  {
    id: 6,
    name: "R-454B Low GWP",
    cas: "Mixture (75-10-5 / 116-14-3)",
    category: "Blend",
    doc: "SDS v1.3 · Feb 2026",
    badges: ["F-Gas Certified", "A2L Mildly Flammable"],
  },
  {
    id: 7,
    name: "R-1234yf",
    cas: "754-12-1",
    category: "Single component",
    doc: "SDS v1.6 · Nov 2025",
    badges: ["A2L Mildly Flammable"],
  },
];

export const SDS_LANGUAGES = [
  { value: "en", label: "Language: English (US)" },
  { value: "es", label: "Language: Español" },
  { value: "fr", label: "Language: Français" },
];

export const SDS_CATEGORIES: { value: "all" | SdsCategory; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "Single component", label: "Single component" },
  { value: "Blend", label: "Blends" },
  { value: "Reclaimed", label: "Reclaimed" },
];
