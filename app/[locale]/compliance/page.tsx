import { redirect } from "@/i18n/navigation";

/**
 * `/compliance` is the address people type and link to (the footer and the
 * header's nav both treat it as the section root), but the section's content
 * lives in its children. Send it to the SDS library, which is the page
 * buyers actually want.
 */
interface ComplianceRouteProps {
  params: Promise<{ locale: string }>;
}

export default async function ComplianceRoute({ params }: ComplianceRouteProps) {
  const { locale } = await params;
  redirect({ href: "/compliance/sds", locale });
}
