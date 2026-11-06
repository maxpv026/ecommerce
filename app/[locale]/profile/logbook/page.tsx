import { redirect } from "@/i18n/navigation";

/**
 * /profile/logbook → /profile/compliance.
 *
 * The F-Gas Compliance Logbook lives at /profile/compliance (it predates the
 * name). This keeps the friendlier URL working without a second copy of the
 * page that could drift from the first or from the audit PDF.
 */
export default async function LogbookRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/profile/compliance", locale });
}
