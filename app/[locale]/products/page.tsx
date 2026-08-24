import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProducts } from "@/lib/data";
import ProductBrowser from "@/components/ProductBrowser";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Products");
  return {
    title: `${t("title")} — My Energy`,
    description: t("subtitle"),
  };
}

interface ProductsRouteProps {
  searchParams: Promise<{ category?: string }>;
}

const VALID_CATEGORIES = new Set(["cylinders", "blends", "equipment", "recovery"]);

export default async function ProductsRoute({ searchParams }: ProductsRouteProps) {
  const { category } = await searchParams;
  // Server component owns the data fetch; the interactive browser is client.
  const products = await getProducts();
  const initialCategory = category && VALID_CATEGORIES.has(category) ? category : null;

  return <ProductBrowser products={products} initialCategory={initialCategory} />;
}
