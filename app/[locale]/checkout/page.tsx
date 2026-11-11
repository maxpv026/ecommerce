import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import CheckoutPage from "@/components/CheckoutPage";
import { getFgasSummary } from "@/lib/fgasAccount";
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
    // redirect() throws, but return anyway: a userId that is undefined would
    // make every `where: { userId }` below match ANY row in Prisma.
    return null;
  }

  // Whether this buyer may check out depends on what's in the basket, which
  // only the browser knows: a tools-only or hydrocarbon basket needs no
  // certificate. So the effective status goes to the client, which sends an
  // F-Gas basket without a certificate in force back to the cart (it owns the
  // upload flow). prepareOrder enforces the same rule on the server anyway.
  const [addresses, products, fgas] = await Promise.all([getUserAddresses(userId), getProducts(), getFgasSummary(userId)]);

  return <CheckoutPage addresses={addresses} products={products} fgasCleared={fgas?.status === "VERIFIED"} />;
}
