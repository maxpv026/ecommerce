import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import AdminVault from "@/components/AdminVault";

export const metadata: Metadata = {
  title: "Admin — My Energy",
  description: "My Energy founder administration.",
};

interface AdminPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminPage({ params }: AdminPageProps) {
  // One shared gate for every admin route — role, ADMIN_EMAIL and an enrolled
  // second factor, all re-read from the database. See lib/admin/guardAdmin.
  const admin = await guardAdmin(params);

  const [userCount, orderCount] = await Promise.all([prisma.user.count(), prisma.order.count()]);

  return (
    <AdminVault
      adminName={admin.name}
      adminEmail={admin.email}
      userCount={userCount}
      orderCount={orderCount}
    />
  );
}
