import type { CertificationStandard, CertificationStat } from "./types";

export const CERTIFICATION_STATS: CertificationStat[] = [
  { value: "99.9%", label: "Minimum assayed purity" },
  { value: "100%", label: "Cylinders with a CoA" },
  { value: "3", label: "Independent audit programs" },
];

export const CERTIFICATION_STANDARDS: CertificationStandard[] = [
  {
    id: "ahri-700",
    icon: "shield-check",
    title: "AHRI-700 Certified",
    tag: "PURITY STANDARD",
    body: "Every lot is assayed against the Air-Conditioning, Heating, and Refrigeration Institute standard for fluorocarbon purity — composition, moisture, high-boiling residue, and non-condensables all meet or exceed the published limits.",
    audit: "Third-party lab assay per lot",
  },
  {
    id: "dot-39",
    icon: "package-check",
    title: "DOT-39 Compliant Cylinders",
    tag: "TRANSPORT SAFETY",
    body: "Non-refillable cylinders are built and tested to Department of Transportation 39 specification, with burst-pressure verification, pressure-relief devices, and tamper-evident valve seals on every unit shipped.",
    audit: "Burst and leak tested before fill",
  },
  {
    id: "iso-9001",
    icon: "award",
    title: "ISO 9001 Quality Management",
    tag: "PROCESS CONTROL",
    body: "Fill lines, analytical instruments, and batch records run under an ISO 9001 quality management system. Each cylinder is traceable to its source lot, fill station, operator, and calibration record.",
    audit: "Annual surveillance audit",
  },
];

export const COA_FACTS: string[] = [
  "Lot number matched to cylinder stamp",
  "Composition and moisture results",
  "Residue and non-condensable gas",
  "Analyst signature and test date",
];
