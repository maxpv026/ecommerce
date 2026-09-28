import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import SdsPage from "@/components/SdsPage";

export const metadata: Metadata = {
  title: "Safety Data Sheets (SDS) — My Energy",
  description:
    "Download official AHRI-700 and F-Gas compliant Safety Data Sheets for all My Energy refrigerants.",
};

// Static across all 29 locales: this page has no user-specific content and no
// data fetch, so it should be built once rather than rendered per request.
// setRequestLocale is what makes that possible — see the note in the locale
// layout for why next-intl otherwise forces a dynamic render.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SdsPage />;
}
