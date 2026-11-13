import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import AppChrome from "@/components/AppChrome";
import PageSkeleton from "@/components/PageSkeleton";
import CategoryExplorer from "@/components/categories/CategoryExplorer";
import { getProducts } from "@/lib/data";

interface CategoriesRouteProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: CategoriesRouteProps): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: generateMetadata runs as its own render.
  const t = await getTranslations({ locale, namespace: "CategoryExplorer" });
  return { title: `${t("title")} — My Energy`, description: t("lead") };
}

/**
 * /categories — six sector cards (components/categories). Rendered per
 * request because each card shows live counts and "from €/kg"; the products
 * come from the cached catalog read (getProducts, PRODUCTS_TAG), so a request
 * costs no extra query.
 */
export default function CategoriesRoute() {
  return (
    <AppChrome>
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <CategoriesContent />
      </Suspense>
    </AppChrome>
  );
}

async function CategoriesContent() {
  const products = await getProducts();
  return <CategoryExplorer products={products} />;
}
