import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import CheckoutPage from "@/components/CheckoutPage";
import { getUserAddresses } from "@/lib/data";

export const metadata: Metadata = {
  title: "Checkout — My Energy",
  description: "Confirm your delivery details and place your refrigerant order.",
};

interface CheckoutRouteProps {
  params: Promise<{ locale: string }>;
}

export default async function CheckoutRoute({ params }: CheckoutRouteProps) {
  const { locale } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect({ href: { pathname: "/auth", query: { callbackUrl: "/checkout" } }, locale });
  }

  const addresses = await getUserAddresses(userId!);

  return <CheckoutPage addresses={addresses} />;
}
