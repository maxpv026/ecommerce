import StorePage from "@/components/StorePage";
import { auth } from "@/auth";
import {
  getFeaturedProducts,
  getMarketAlerts,
  getProfileDashboardData,
  getRecommendedProducts,
  getUserOrders,
  type ProfileDashboardData,
  type UserOrder,
} from "@/lib/data";

export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id;

  const [recommendedProducts, marketAlerts, dashboard, orders] = await Promise.all([
    userId ? getRecommendedProducts(userId) : getFeaturedProducts(4),
    getMarketAlerts(),
    userId ? getProfileDashboardData(userId) : Promise.resolve<ProfileDashboardData | null>(null),
    userId ? getUserOrders(userId) : Promise.resolve<UserOrder[]>([]),
  ]);

  return (
    <StorePage
      recommendedProducts={recommendedProducts}
      marketAlerts={marketAlerts}
      dashboard={dashboard}
      latestOrder={orders[0] ?? null}
    />
  );
}
