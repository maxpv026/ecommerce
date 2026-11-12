import { redirect } from "@/i18n/navigation";

/** The analytics screen moved to /admin/analytics; old links keep working. */
export default async function AdminDashboardRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/admin/analytics", locale });
}
