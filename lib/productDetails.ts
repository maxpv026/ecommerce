import type { ProductDetail } from "./types";

// Placeholder catalog data, keyed by the same numeric id used in lib/products.ts.
// Swap this module for a database/CMS call later — every consumer only depends
// on the ProductDetail shape, not on how it's sourced.
const PRODUCT_DETAILS: Record<string, ProductDetail> = {
  "1": {
    id: 1,
    category: "MY ENERGY · VIRGIN REFRIGERANT",
    breadcrumbLabel: "R-410A",
    name: "R-410A Premium Cylinder",
    description:
      "Factory-sealed Puron blend for residential and light commercial split systems. Every cylinder ships with a batch purity certificate and DOT-39 documentation.",
    compareAtPrice: 214,
    discountLabel: "Save 12%",
    availability: "In stock · Ships from Dallas in 24h · Free freight over $600",
    certificationBadge: "AHRI-700 certified",
    keySpecs: [
      { label: "Purity", value: "99.9%" },
      { label: "GWP", value: "2,088" },
      { label: "Safety", value: "A1" },
    ],
    weights: [
      { id: "25", label: "25 lb", price: 189 },
      { id: "50", label: "50 lb", price: 342 },
      { id: "100", label: "100 lb", price: 618 },
      { id: "iso", label: "ISO Tank", price: 4280 },
    ],
    defaultWeightId: "25",
    baseSpecs: [
      { key: "Refrigerant", value: "R-410A (Puron)" },
      { key: "Composition", value: "R-32 / R-125, 50:50" },
      { key: "Purity", value: "99.9% · AHRI-700" },
      { key: "Cylinder", value: "DOT-39, non-refillable" },
    ],
    complianceNote:
      "F-Gas technician certification is verified at checkout. Sales to uncertified buyers are not permitted under F-Gas rules.",
  },
  "2": {
    id: 2,
    category: "MY ENERGY · VIRGIN REFRIGERANT",
    breadcrumbLabel: "R-134a",
    name: "R-134a Premium Cylinder",
    description:
      "Virgin automotive and chiller-grade refrigerant for mobile A/C and stationary chiller service. Includes a certificate of analysis with every batch.",
    compareAtPrice: 179,
    discountLabel: "Save 8%",
    availability: "In stock · Ships from Dallas in 24h · Free freight over $600",
    certificationBadge: "AHRI-700 certified",
    keySpecs: [
      { label: "Purity", value: "99.9%" },
      { label: "GWP", value: "1,430" },
      { label: "Safety", value: "A1" },
    ],
    weights: [
      { id: "25", label: "25 lb", price: 148 },
      { id: "30", label: "30 lb", price: 164 },
      { id: "50", label: "50 lb", price: 268 },
    ],
    defaultWeightId: "30",
    baseSpecs: [
      { key: "Refrigerant", value: "R-134a (HFC-134a)" },
      { key: "Composition", value: "Single-component HFC" },
      { key: "Purity", value: "99.9% · AHRI-700" },
      { key: "Cylinder", value: "DOT-39, non-refillable" },
    ],
    complianceNote:
      "F-Gas technician certification is verified at checkout. Sales to uncertified buyers are not permitted under F-Gas rules.",
    modelPath: "/Meshy_AI_R134a_Refrigerant_Cyl_0817214938_image-to-3d-texture.glb",
  },
  "3": {
    id: 3,
    category: "MY ENERGY · LOW-GWP REFRIGERANT",
    breadcrumbLabel: "R-32",
    name: "R-32 Premium Cylinder",
    description:
      "Single-component, low-GWP refrigerant engineered for next-generation split systems and heat pumps. A2L rated — ships with required placarding.",
    compareAtPrice: 236,
    discountLabel: "Save 10%",
    availability: "In stock · Ships from Dallas in 24h · Free freight over $600",
    certificationBadge: "AHRI-700 certified",
    keySpecs: [
      { label: "Purity", value: "99.9%" },
      { label: "GWP", value: "675" },
      { label: "Safety", value: "A2L" },
    ],
    weights: [
      { id: "25", label: "25 lb", price: 212 },
      { id: "50", label: "50 lb", price: 398 },
      { id: "100", label: "100 lb", price: 748 },
    ],
    defaultWeightId: "25",
    baseSpecs: [
      { key: "Refrigerant", value: "R-32 (HFC-32)" },
      { key: "Composition", value: "Single-component HFC" },
      { key: "Purity", value: "99.9% · AHRI-700" },
      { key: "Cylinder", value: "DOT-39, non-refillable, A2L placarded" },
    ],
    complianceNote:
      "F-Gas technician certification is verified at checkout. A2L cylinders require mildly-flammable refrigerant handling training under F-Gas rules.",
  },
  "4": {
    id: 4,
    category: "MY ENERGY · RECLAIMED REFRIGERANT",
    breadcrumbLabel: "R-404A",
    name: "R-404A Reclaimed Cylinder",
    description:
      "AHRI-700 certified reclaimed blend, reprocessed and lab-verified to meet virgin-equivalent purity. A sustainable choice for legacy low-temp systems.",
    compareAtPrice: 330,
    discountLabel: "Save 10%",
    availability: "In stock · Ships from Dallas in 24h · Free freight over $600",
    certificationBadge: "AHRI-700 Reclaimed certified",
    keySpecs: [
      { label: "Purity", value: "99.5%" },
      { label: "GWP", value: "3,922" },
      { label: "Safety", value: "A1" },
    ],
    weights: [
      { id: "24", label: "24 lb", price: 298 },
      { id: "50", label: "50 lb", price: 560 },
      { id: "100", label: "100 lb", price: 1040 },
    ],
    defaultWeightId: "24",
    baseSpecs: [
      { key: "Refrigerant", value: "R-404A (Reclaimed)" },
      { key: "Composition", value: "R-125 / R-143a / R-134a" },
      { key: "Purity", value: "99.5% · AHRI-700 Reclaimed" },
      { key: "Cylinder", value: "DOT-39, non-refillable" },
    ],
    complianceNote:
      "F-Gas technician certification is verified at checkout. Sales to uncertified buyers are not permitted under F-Gas rules.",
  },
  "5": {
    id: 5,
    category: "MY ENERGY · VIRGIN REFRIGERANT",
    breadcrumbLabel: "R-404A",
    name: "R-404A Virgin Cylinder",
    description:
      "Virgin R-404A blend for commercial refrigeration — walk-ins, reach-ins, and low-temp racks. Every cylinder ships with a batch purity certificate.",
    compareAtPrice: 560,
    discountLabel: "Save 9%",
    availability: "In stock · Ships from Dallas in 24h · Free freight over $600",
    certificationBadge: "AHRI-700 certified",
    keySpecs: [
      { label: "Purity", value: "99.9%" },
      { label: "GWP", value: "3,922" },
      { label: "Safety", value: "A1" },
    ],
    weights: [{ id: "50", label: "50 lb", price: 512 }],
    defaultWeightId: "50",
    baseSpecs: [
      { key: "Refrigerant", value: "R-404A" },
      { key: "Composition", value: "R-125 / R-143a / R-134a, 44/52/4" },
      { key: "Purity", value: "99.9% · AHRI-700" },
      { key: "Cylinder", value: "DOT-39, non-refillable" },
    ],
    complianceNote:
      "F-Gas technician certification is verified at checkout. Sales to uncertified buyers are not permitted under F-Gas rules.",
  },
  "6": {
    id: 6,
    category: "MY ENERGY · RETROFIT REFRIGERANT",
    breadcrumbLabel: "R-407C",
    name: "R-407C Retrofit Blend Cylinder",
    description:
      "Near-azeotropic R-22 retrofit blend for legacy split systems and packaged units. A drop-in service blend with full batch documentation.",
    compareAtPrice: 262,
    discountLabel: "Save 10%",
    availability: "In stock · Ships from Dallas in 24h · Free freight over $600",
    certificationBadge: "AHRI-700 certified",
    keySpecs: [
      { label: "Purity", value: "99.5%" },
      { label: "GWP", value: "1,774" },
      { label: "Safety", value: "A1" },
    ],
    weights: [
      { id: "25", label: "25 lb", price: 236 },
      { id: "100", label: "100 lb", price: 742 },
    ],
    defaultWeightId: "25",
    baseSpecs: [
      { key: "Refrigerant", value: "R-407C" },
      { key: "Composition", value: "R-32 / R-125 / R-134a, 23/25/52" },
      { key: "Purity", value: "99.5% · AHRI-700" },
      { key: "Cylinder", value: "DOT-39, non-refillable" },
    ],
    complianceNote:
      "F-Gas technician certification is verified at checkout. Sales to uncertified buyers are not permitted under F-Gas rules.",
  },
};

export function getProductDetail(id: string): ProductDetail | undefined {
  return PRODUCT_DETAILS[id];
}

export function getAllProductDetailIds(): string[] {
  return Object.keys(PRODUCT_DETAILS);
}
