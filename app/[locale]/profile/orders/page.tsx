import type { Metadata } from "next";
import MobileOrdersLayout from "@/components/MobileOrdersLayout";
import { auth } from "@/auth";
import { getUserOrders } from "@/lib/data";

export const metadata: Metadata = {
  title: "Orders — My Energy",
  description: "Track active shipments and reorder from your My Energy order history.",
};

interface OrdersPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const { tab } = await searchParams;
  const initialTab = tab === "completed" ? "completed" : "active";

  const session = await auth();
  const orders = session?.user?.id ? await getUserOrders(session.user.id) : [];

  return (
    <div className="block md:hidden">
      <MobileOrdersLayout initialTab={initialTab} orders={orders} recipientName={session?.user?.name ?? ""} />
    </div>
  );
}
