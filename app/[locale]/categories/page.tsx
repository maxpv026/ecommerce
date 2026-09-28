import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getTranslations, setRequestLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import CategoriesPage, { type CategoryCounts } from "@/components/CategoriesPage";
import { CATALOG_COUNTS_TAG } from "@/lib/cacheTags";

/**
 * Incrementally regenerated rather than rendered per request. The only data
 * here is four category counts, which change when the catalogue gains or
 * retires a product — not something a buyer needs to the second, and well
 * worth serving 29 locales of this page from cache.
 *
 * Note this is the count of products in a category, not their stock: nothing
 * on this page can go stale in a way that misleads someone about what they
 * can buy. Anywhere stock is shown stays dynamic, deliberately.
 */
export const revalidate = 300;

interface CategoriesRouteProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: CategoriesRouteProps): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: generateMetadata runs as its own render, so it does not
  // inherit the setRequestLocale call in the page body below.
  const t = await getTranslations({ locale, namespace: "Categories" });
  return {
    title: `${t("title")} — My Energy`,
    description: t("subtitle"),
  };
}

/**
 * Catalog size per category — every card shows its real count.
 *
 * Cached because the answer is the same for all 29 locales: uncached, building
 * or revalidating this page runs the identical GROUP BY 29 times to produce
 * one set of four numbers. (It is not theoretical — prerendering all 29 in
 * parallel exhausted the connection pool outright.) One entry, shared by
 * every locale, invalidated by tag when inventory changes.
 */
const getCategoryCounts = unstable_cache(
  async (): Promise<CategoryCounts> => {
    const grouped = await prisma.product.groupBy({ by: ["category"], _count: { _all: true } });
    const counts: CategoryCounts = { cylinders: 0, blends: 0, equipment: 0, recovery: 0 };
    for (const row of grouped) {
      if (row.category in counts) counts[row.category as keyof CategoryCounts] = row._count._all;
    }
    return counts;
  },
  ["category-counts"],
  { revalidate, tags: [CATALOG_COUNTS_TAG] }
);

export default async function CategoriesRoute({ params }: CategoriesRouteProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const counts = await getCategoryCounts();

  return <CategoriesPage counts={counts} />;
}
