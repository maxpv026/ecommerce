import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import PageSkeleton from "@/components/PageSkeleton";
import CompliancePage from "@/components/CompliancePage";
import AppChrome from "@/components/AppChrome";
import { getComplianceDashboardData, type SummaryPeriod } from "@/lib/compliance";

interface ComplianceRouteProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}

/**
 * Explicit locale: generateMetadata runs as its own render and does not
 * inherit a setRequestLocale from the page body. Same pattern as /hub.
 */
export async function generateMetadata({ params }: ComplianceRouteProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Compliance" });
  return {
    title: `${t("metaTitle")} — My Energy`,
    description: t("metaDescription"),
  };
}

/**
 * Boundary kept inside the page, not in a `loading.tsx` — a segment-level
 * loader here would wrap every sibling route under /profile and force their
 * `notFound()` responses to 200. See app/[locale]/page.tsx.
 */
export default function ComplianceRoute({ params, searchParams }: ComplianceRouteProps) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <ComplianceContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ComplianceContent({ searchParams }: ComplianceRouteProps) {
  const { period: raw } = await searchParams;
  const period: SummaryPeriod = raw === "all" ? "all" : "ytd";

  const session = await auth();
  const userId = session?.user?.id;

  // proxy.ts gates this route by name — PROTECTED_SEGMENTS matches explicit
  // prefixes, not all of /profile, so a new sub-route is unguarded until it is
  // added there. This one was, initially. The null fallback stays as the inner
  // wall: it renders the empty state rather than anyone else's figures.
  const data = userId ? await getComplianceDashboardData(userId, period) : null;

  return (
    <AppChrome>
      <CompliancePage data={data} period={period} />
    </AppChrome>
  );
}
