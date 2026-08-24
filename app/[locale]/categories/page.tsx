import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import CategoriesPage from "@/components/CategoriesPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Categories");
  return {
    title: `${t("title")} — My Energy`,
    description: t("subtitle"),
  };
}

export default async function CategoriesRoute() {
  // The cylinders card shows the real catalog size; the other categories
  // are not yet DB-backed and keep their designed copy.
  const cylinderCount = await prisma.product.count();

  return <CategoriesPage cylinderCount={cylinderCount} />;
}
