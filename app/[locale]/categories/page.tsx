import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import AppChrome from "@/components/AppChrome";
import PageSkeleton from "@/components/PageSkeleton";
import CategoryExplorer from "@/components/categories/CategoryExplorer";
import { getProducts } from "@/lib/data";
import { SECTORS, type Sector } from "@/lib/categorySectors";

interface CategoriesRouteProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sector?: string }>;
}

export async function generateMetadata({ params }: CategoriesRouteProps): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: generateMetadata runs as its own render.
  const t = await getTranslations({ locale, namespace: "CategoryExplorer" });
  return { title: `${t("title")} — My Energy`, description: t("metaDescription") };
}

/**
 * /categories — the catalog by application with inline buying and an order
 * configurator (components/categories). Rendered per request rather than
 * from ISR, because it now shows stock and prices: the products themselves
 * come from the cached catalog read (getProducts, PRODUCTS_TAG), so a request
 * costs no extra query, and nothing on screen can be older than that cache.
 */
export default function CategoriesRoute({ searchParams }: CategoriesRouteProps) {
  return (
    <AppChrome>
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <CategoriesContent searchParams={searchParams} />
      </Suspense>
    </AppChrome>
  );
}

async function CategoriesContent({ searchParams }: { searchParams: CategoriesRouteProps["searchParams"] }) {
  const { sector } = await searchParams;
  const initialSector = (SECTORS as readonly string[]).includes(sector ?? "") ? (sector as Sector) : "all";
  const products = await getProducts();
  return <CategoryExplorer products={products} initialSector={initialSector} />;
}
