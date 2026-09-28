import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import MobileTermsLayout from "@/components/MobileTermsLayout";

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
  return (
    <div className="block md:hidden">
      <MobileTermsLayout />
    </div>
  );
}
