import { redirect } from "@/i18n/navigation";

/**
 * The sign-in email is shown on /profile. This route used to show a hardcoded third-party address and a form whose "save" changed nothing.
 */
export default async function Redirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: { pathname: "/profile" }, locale });
}
