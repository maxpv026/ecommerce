import type { Metadata } from "next";
import { auth } from "@/auth";
import AccountLayoutClient from "@/components/AccountLayoutClient";
import { getProfileDashboardData, getUserOrders, getUserProfile } from "@/lib/data";

export const metadata: Metadata = {
  title: "Your Account — My Energy",
  description: "Manage your My Energy profile, order history, and account security.",
};

export default async function ProfilePage() {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user);
  const userId = session?.user?.id;

  const [dashboardData, profile, orders] = userId
    ? await Promise.all([
        getProfileDashboardData(userId),
        getUserProfile(userId),
        getUserOrders(userId),
      ])
    : [null, null, null];

  return (
    <AccountLayoutClient
      isAuthenticated={isAuthenticated}
      dashboardData={dashboardData}
      profile={profile}
      orders={orders}
    />
  );
}
