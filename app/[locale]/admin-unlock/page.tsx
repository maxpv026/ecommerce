import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { isStaffRole } from "@/lib/rbac";
import { strongSession } from "@/lib/authStrength";
import { callbackPath } from "@/lib/callbackPath";
import AdminUnlock from "@/components/admin/AdminUnlock";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ callbackUrl?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AdminUnlock" });
  return { title: `${t("title")} — My Energy`, robots: { index: false } };
}

/**
 * Staff whose session signed in with a weak second factor land here on the
 * way into /admin (proxy.ts, lib/authStrength). The page re-checks on the
 * server: signed in, staff, and not already strong — otherwise straight on.
 */
export default async function AdminUnlockPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { callbackUrl } = await searchParams;
  // Only an /admin path is a sensible destination; anything else → the dashboard.
  const target = callbackPath(callbackUrl);
  const destination = target === "/admin" || target.startsWith("/admin/") || target.startsWith("/admin?") ? target : "/admin";

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth?callbackUrl=${encodeURIComponent(`/admin-unlock?callbackUrl=${destination}`)}`);
  if (!isStaffRole(session.user.role)) redirect(`/${locale}`);
  if (strongSession(session.user)) redirect(`/${locale}${destination}`);

  return <AdminUnlock destination={destination} />;
}
