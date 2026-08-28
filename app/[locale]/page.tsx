import StorePage from "@/components/StorePage";
import { auth } from "@/auth";
import {
  getFeaturedProducts,
  getMarketAlerts,
  getProfileDashboardData,
  getRecommendedProducts,
  getUserOrders,
  getUserProfile,
  type ProfileDashboardData,
  type UserOrder,
  type UserProfileData,
} from "@/lib/data";

export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id;

  const [recommendedProducts, marketAlerts, dashboard, orders, profile] = await Promise.all([
    userId ? getRecommendedProducts(userId, 4) : getFeaturedProducts(4),
    getMarketAlerts(),
    userId ? getProfileDashboardData(userId) : Promise.resolve<ProfileDashboardData | null>(null),
    userId ? getUserOrders(userId) : Promise.resolve<UserOrder[]>([]),
    userId ? getUserProfile(userId) : Promise.resolve<UserProfileData | null>(null),
  ]);

  return (
    <StorePage
      recommendedProducts={recommendedProducts}
      marketAlerts={marketAlerts}
      dashboard={dashboard}
      latestOrder={orders[0] ?? null}
      orders={orders.slice(0, 4)}
      certificate={profile?.certificate ?? null}
      jobTitle={profile?.jobTitle ?? null}
    />
  );
}
