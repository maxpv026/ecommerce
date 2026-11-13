import { redirect } from "@/i18n/navigation";

/**
 * The VAT id is edited in the profile editor and shown on /profile. This route used to render an invented VAT number with a "verified via EU VIES" status no check ever produced.
 */
export default async function Redirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: { pathname: "/profile", query: { tab: "company" } }, locale });
}
