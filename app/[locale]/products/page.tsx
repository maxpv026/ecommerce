import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getGasMarkCounts, getProducts } from "@/lib/data";
import { parseGasMarks } from "@/lib/gasMarks";
import { normalizeSearchTerm } from "@/lib/search";
import ProductBrowser from "@/components/ProductBrowser";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Products");
  return {
    title: `${t("title")} — My Energy`,
    description: t("subtitle"),
  };
}

interface ProductsRouteProps {
  searchParams: Promise<{ category?: string; gasType?: string | string[]; search?: string | string[] }>;
}

const VALID_CATEGORIES = new Set(["cylinders", "blends", "equipment", "recovery"]);

export default async function ProductsRoute({ searchParams }: ProductsRouteProps) {
  const { category, gasType, search } = await searchParams;
  // Unknown marks are dropped here, so nothing unvalidated reaches Prisma.
  const gasMarks = parseGasMarks(gasType);
  // Trimmed and length-capped before it reaches the query.
  const searchTerm = normalizeSearchTerm(search);

  // Server component owns the data fetch; the interactive browser is client.
  // Both filters run in the database so a shared `?gasType=` / `?search=`
  // link renders the right list on first paint, with no JavaScript required
  // — and `search` uses the very same clause as the header dropdown.
  const [products, gasMarkCounts] = await Promise.all([
    getProducts({ gasMarks, search: searchTerm }),
    getGasMarkCounts(),
  ]);
  const initialCategory = category && VALID_CATEGORIES.has(category) ? category : null;

  return (
    <ProductBrowser
      products={products}
      initialCategory={initialCategory}
      gasMarks={gasMarks}
      gasMarkCounts={gasMarkCounts}
      searchTerm={searchTerm}
    />
  );
}
