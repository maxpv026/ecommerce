import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProducts } from "@/lib/data";
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
  searchParams: Promise<{ search?: string | string[] }>;
}

export default async function ProductsRoute({ searchParams }: ProductsRouteProps) {
  const { search } = await searchParams;
  // Trimmed and length-capped before it reaches the query.
  const searchTerm = normalizeSearchTerm(search);

  // The whole listed catalog (a few dozen rows, cached under PRODUCTS_TAG):
  // every filter — gas, use case, kg, safety class, GWP, stock — runs in the
  // browser over it with faceted counts (lib/catalogFacets), and reads its
  // initial state from the URL (?gasType=, ?category=, ?use=…). Only the
  // free-text `?search=` is applied here, with the header dropdown's clause.
  const products = await getProducts({ search: searchTerm });

  return <ProductBrowser products={products} searchTerm={searchTerm} />;
}
