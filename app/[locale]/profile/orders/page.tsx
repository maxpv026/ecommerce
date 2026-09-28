import type { Metadata } from "next";
import { Suspense } from "react";
import PageSkeleton from "@/components/PageSkeleton";
import MobileOrdersLayout from "@/components/MobileOrdersLayout";
import OrderHistoryPage from "@/components/OrderHistoryPage";
import { auth } from "@/auth";
import { getUserOrders } from "@/lib/data";

export const metadata: Metadata = {
  title: "Orders — My Energy",
  description: "Track active shipments and reorder from your My Energy order history.",
};

interface OrdersPageProps {
  searchParams: Promise<{ tab?: string }>;
}

/** Boundary kept inside the page — see app/[locale]/page.tsx. */
export default function OrdersPage({ searchParams }: OrdersPageProps) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <OrdersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OrdersContent({ searchParams }: OrdersPageProps) {
  const { tab } = await searchParams;
  const initialTab = tab === "completed" ? "completed" : "active";

  const session = await auth();
  // getUserOrders is the same `findMany({ where: { userId }, orderBy:
  // { createdAt: "desc" } })` the brief describes, plus the line items the
  // rows count — one definition shared with the dashboard and mobile.
  // proxy.ts already gates this route, so an unauthenticated visitor never
  // gets here; the fallback only guards against a session race.
  const orders = session?.user?.id ? await getUserOrders(session.user.id) : [];

  return (
    <>
      {/* Desktop had no layout at all — the route rendered blank above md. */}
      <div className="hidden md:block">
        <OrderHistoryPage orders={orders} />
      </div>

      <div className="block md:hidden">
        <MobileOrdersLayout initialTab={initialTab} orders={orders} recipientName={session?.user?.name ?? ""} />
      </div>
    </>
  );
}
