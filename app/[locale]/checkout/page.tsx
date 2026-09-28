import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import CheckoutPage from "@/components/CheckoutPage";
import prisma from "@/lib/prisma";
import { getProducts, getUserAddresses } from "@/lib/data";

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

  // Deep links and stale tabs land here too — an unverified buyer is sent
  // back to the cart, which owns the certificate-upload flow, rather than
  // being allowed to fill in an address only for placeOrder to refuse.
  const buyer = await prisma.user.findUnique({ where: { id: userId! }, select: { fGasStatus: true } });
  if (buyer?.fGasStatus !== "VERIFIED") {
    redirect({ href: "/cart", locale });
  }

  // The catalog supplies each cart line's cylinder deposit for the summary.
  const [addresses, products] = await Promise.all([getUserAddresses(userId!), getProducts()]);

  return <CheckoutPage addresses={addresses} products={products} />;
}
