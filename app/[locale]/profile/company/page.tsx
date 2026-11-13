import { redirect } from "@/i18n/navigation";

/**
 * Company & VAT live on /profile: the overview (desktop) and the Company tab (phone) show the real account row. This route used to render a phone-only card with an invented company, VAT number and "VIES verified" status.
 */
export default async function Redirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: { pathname: "/profile", query: { tab: "company" } }, locale });
}
