import { redirect } from "@/i18n/navigation";

/**
 * Documents are a tab of /profile (?tab=documents): real invoices, the F-Gas
 * certificate on file, the ledger exports and the SDS library — on desktop and
 * phone. The old ?tab=sds deep link opens that tab on the SDS group.
 */
export default async function DocsRedirect({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ locale }, { tab }] = await Promise.all([params, searchParams]);
  redirect({ href: { pathname: "/profile", query: tab === "sds" ? { tab: "documents", docs: "sds" } : { tab: "documents" } }, locale });
}
