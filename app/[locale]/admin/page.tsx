import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import prisma from "@/lib/prisma";
import AdminVault from "@/components/AdminVault";

export const metadata: Metadata = {
  title: "Admin — My Energy",
  description: "My Energy founder administration.",
};

interface AdminPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { locale } = await params;

  // Second wall behind the proxy.ts gate: even if the Edge layer were ever
  // misconfigured, a non-ADMIN session never renders this page.
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect({ href: "/", locale });
  }

  const [userCount, orderCount] = await Promise.all([prisma.user.count(), prisma.order.count()]);

  return (
    <AdminVault
      adminName={session!.user!.name ?? session!.user!.email ?? ""}
      adminEmail={session!.user!.email ?? ""}
      userCount={userCount}
      orderCount={orderCount}
    />
  );
}
