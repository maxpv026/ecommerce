import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import SearchView from "@/components/SearchView";
import AppChrome from "@/components/AppChrome";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SearchPage" });
  return { title: `${t("title")} — My Energy`, description: t("lead") };
}

/** Catalog, the buyer's own orders and the SDS library (components/SearchView). */
export default function SearchPage() {
  return (
    <AppChrome mobileTopBar>
      <SearchView />
    </AppChrome>
  );
}
