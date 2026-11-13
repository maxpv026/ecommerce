import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import AppChrome from "@/components/AppChrome";
import PageSkeleton from "@/components/PageSkeleton";
import HubShell from "@/components/hub/market/HubShell";
import { getHubData } from "@/lib/hubData";
import { HUB_TABS, type HubTab } from "@/lib/hubTabs";

interface HubRouteProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; gas?: string; system?: string }>;
}

/** The locale is read explicitly: generateMetadata runs as its own render (same pattern as /categories). */
export async function generateMetadata({ params }: HubRouteProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "MarketHub" });
  return { title: `${t("title")} — My Energy`, description: t("metaDescription") };
}

/**
 * The market hub: price indices and the EU quota schedule, the gas comparator
 * and system matcher, the engineering challenge, and the industry digest.
 * One server read (lib/hubData) behind one boundary — every source it needs
 * is a database query except the RSS feed, which is cached for an hour.
 * No loading.tsx, for the soft-404 reason given in app/[locale]/page.tsx.
 */
export default function HubRoute({ searchParams }: HubRouteProps) {
  return (
    <AppChrome>
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <HubContent searchParams={searchParams} />
      </Suspense>
    </AppChrome>
  );
}

async function HubContent({ searchParams }: { searchParams: HubRouteProps["searchParams"] }) {
  const sp = await searchParams;
  const initialTab: HubTab = (HUB_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as HubTab) : "exchange";
  const session = await auth();
  const data = await getHubData(session?.user?.id ?? null);
  return <HubShell data={data} initialTab={initialTab} initialGas={sp.gas} initialSystem={sp.system?.slice(0, 160)} />;
}
