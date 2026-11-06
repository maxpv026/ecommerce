import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import SdsPage from "@/components/SdsPage";
import { getSdsDirectory, sdsEmergencyPhone } from "@/lib/sdsDirectory";

export const metadata: Metadata = {
  title: "Safety Data Sheets (SDS) — My Energy",
  description:
    "Download official AHRI-700 and F-Gas compliant Safety Data Sheets for all My Energy refrigerants.",
};

/**
 * Incrementally regenerated, like /categories. The rows depend on the
 * catalogue (which SKU stands for each gas) and on whether a generated sheet
 * has been signed off — both change rarely, and neither is per-user, so 29
 * locales of this page are served from cache and rebuilt at most every five
 * minutes. setRequestLocale is still what keeps next-intl from forcing a
 * dynamic render — see the note in the locale layout.
 */
export const revalidate = 300;

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const documents = await getSdsDirectory();
  return <SdsPage documents={documents} emergencyPhone={sdsEmergencyPhone()} />;
}
