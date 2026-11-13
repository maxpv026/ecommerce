import { redirect } from "@/i18n/navigation";

/**
 * Orders are paid by SEPA bank transfer — there are no saved cards. This route used to list two invented cards.
 */
export default async function Redirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: { pathname: "/profile" }, locale });
}
