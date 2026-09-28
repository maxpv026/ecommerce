import type { Metadata } from "next";
import MobileDocsLayout from "@/components/MobileDocsLayout";
import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Docs & Certs — My Energy",
  description: "View your F-Gas certification and download Safety Data Sheets.",
};

interface DocsPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function DocsPage({ searchParams }: DocsPageProps) {
  const { tab } = await searchParams;
  const initialTab = tab === "sds" ? "sds" : "certs";

  // The `block md:hidden` wrapper that used to be here was the white screen:
  // it was this page's ONLY child, so every desktop viewport rendered an empty
  // document with just the footer. The layout itself is a self-contained
  // phone design (own back button, title and tab switcher), so on desktop it
  // is centred in a readable column under the app header rather than stretched
  // across 1440px.
  return (
    <AppChrome>
      <div className="mx-auto w-full md:max-w-[620px] md:py-10">
        <MobileDocsLayout initialTab={initialTab} />
      </div>
    </AppChrome>
  );
}
