import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import AppChrome from "@/components/AppChrome";
import PageSkeleton from "@/components/PageSkeleton";
import SdsCompliance from "@/components/sds/SdsCompliance";
import { getBuyerCompliance, getSdsLibrary, sdsEmergencyLines } from "@/lib/sdsDirectory";
import { detectEmergencyCountry, EMERGENCY } from "@/lib/emergencyContacts";
import { countryName } from "@/lib/country";
import { sellerDetails } from "@/lib/seller";

interface SdsRouteProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: SdsRouteProps): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: generateMetadata runs as its own render.
  const t = await getTranslations({ locale, namespace: "SdsLibrary" });
  return { title: `${t("title")} — My Energy`, description: t("metaDescription") };
}

/**
 * /compliance/sds — safety data sheets, ADR/CLP quick specs and the F-Gas
 * standing, in the cart's 8 + 4 layout (components/sds).
 *
 * Rendered per request (it used to be ISR): the emergency card opens on the
 * visitor's country (profile → geo header → browser region → language), and
 * a signed-in buyer sees their purchased gases first and their certificate.
 * The rows themselves come from the cached catalog read in lib/sdsDirectory,
 * so a request costs the session lookups only. 0 model calls.
 */
export default function SdsRoute({ params }: SdsRouteProps) {
  return (
    <AppChrome>
      <Suspense fallback={<PageSkeleton rows={5} />}>
        <SdsContent params={params} />
      </Suspense>
    </AppChrome>
  );
}

async function SdsContent({ params }: SdsRouteProps) {
  const { locale } = await params;
  const [session, h, rows] = await Promise.all([auth(), headers(), getSdsLibrary()]);
  const userId = session?.user?.id ?? null;
  const buyer = userId ? await getBuyerCompliance(userId) : null;
  const detected = detectEmergencyCountry({
    stored: buyer?.countryCode,
    geo: h.get("x-vercel-ip-country"),
    acceptLanguage: h.get("accept-language"),
    locale,
  });

  const lines = sdsEmergencyLines();
  const codes = new Set([...EMERGENCY.map((e) => e.code), ...(lines.main?.country ? [lines.main.country] : [])]);
  // Named and sorted here, in the page locale: the browser's ICU can name or collate them differently, which would break hydration.
  const countryNames = Object.fromEntries([...codes].map((c) => [c, countryName(c, locale)] as const).sort((a, b) => a[1].localeCompare(b[1], locale)));

  return (
    <SdsCompliance
      rows={rows}
      purchased={buyer?.purchased ?? []}
      signedIn={userId !== null}
      lines={lines}
      countryNames={countryNames}
      detected={detected}
      requestEmail={sellerDetails().email ?? null}
    />
  );
}
