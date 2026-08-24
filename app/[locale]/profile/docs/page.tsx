import type { Metadata } from "next";
import MobileDocsLayout from "@/components/MobileDocsLayout";

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

  return (
    <div className="block md:hidden">
      <MobileDocsLayout initialTab={initialTab} />
    </div>
  );
}
