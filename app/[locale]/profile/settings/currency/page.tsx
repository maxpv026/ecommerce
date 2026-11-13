import { redirect } from "@/i18n/navigation";

/**
 * Prices are in EUR only; this route used to offer USD/GBP/UAH/PLN choices that changed nothing.
 */
export default async function Redirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: { pathname: "/profile" }, locale });
}
