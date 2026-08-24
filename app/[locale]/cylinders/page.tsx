import type { Metadata } from "next";
import CatalogPage from "@/components/CatalogPage";
import { getProducts } from "@/lib/data";

export const metadata: Metadata = {
  title: "Premium Cylinders — My Energy",
  description:
    "Factory-sealed, AHRI-700 certified refrigerants for commercial and residential HVAC.",
};

export default async function Page() {
  const products = await getProducts();
  return <CatalogPage products={products} />;
}
