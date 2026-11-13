import { redirect } from "@/i18n/navigation";

/**
 * Password changes happen on /profile/security (desktop and phone), through the real emailed-code flow. This route used to be a form whose "save" only navigated back.
 */
export default async function Redirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: { pathname: "/profile/security" }, locale });
}
