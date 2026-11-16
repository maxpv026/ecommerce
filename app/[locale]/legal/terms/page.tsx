import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import MobileTermsLayout from "@/components/MobileTermsLayout";
import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Terms of Service — My Energy",
  description: "My Energy's Terms of Service.",
};

// Static across all 29 locales: this page has no user-specific content and no
// data fetch, so it should be built once rather than rendered per request.
// setRequestLocale is what makes that possible — see the note in the locale
// layout for why next-intl otherwise forces a dynamic render.
export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // One layout for every width — it used to be phone-only, so the footer's
  // Terms link opened a blank page on desktop. Desktop header only: phones
  // keep the layout's own sub-page bar.
  return (
    <AppChrome>
      <MobileTermsLayout />
    </AppChrome>
  );
}
