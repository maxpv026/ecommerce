import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import CategoriesPage, { type CategoryCounts } from "@/components/CategoriesPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Categories");
  return {
    title: `${t("title")} — My Energy`,
    description: t("subtitle"),
  };
}

export default async function CategoriesRoute() {
  // Live catalog size per category — every card shows its real count.
  const grouped = await prisma.product.groupBy({ by: ["category"], _count: { _all: true } });
  const counts: CategoryCounts = { cylinders: 0, blends: 0, equipment: 0, recovery: 0 };
  for (const row of grouped) {
    if (row.category in counts) counts[row.category as keyof CategoryCounts] = row._count._all;
  }

  return <CategoriesPage counts={counts} />;
}
