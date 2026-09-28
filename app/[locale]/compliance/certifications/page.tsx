import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import CertificationsPage from "@/components/CertificationsPage";

export const metadata: Metadata = {
  title: "Quality & Certifications — My Energy",
  description:
    "AHRI-700 purity, DOT-39 transport safety, and ISO 9001 quality management behind every My Energy cylinder.",
};

// Static across all 29 locales: this page has no user-specific content and no
// data fetch, so it should be built once rather than rendered per request.
// setRequestLocale is what makes that possible — see the note in the locale
// layout for why next-intl otherwise forces a dynamic render.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CertificationsPage />;
}
