import { redirect } from "@/i18n/navigation";

/**
 * There are no saved cards (payment is SEPA bank transfer); this route used to be an "add card" form that stored nothing.
 */
export default async function Redirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: { pathname: "/profile" }, locale });
}
