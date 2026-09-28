import type { Metadata } from "next";
import CartPage from "@/components/CartPage";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getProducts } from "@/lib/data";
import type { FGasStatus } from "@/lib/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Your Cart — My Energy",
  description: "Review your refrigerant cylinders and proceed to checkout.",
};

/**
 * The buyer's F-Gas status, read from the row rather than the session.
 *
 * The JWT is only as fresh as the last sign-in, so a buyer whose certificate
 * was just approved (or who has just submitted one) would otherwise see a
 * stale gate. approve/reject revalidate this page, so the row is current.
 *
 * Returns null — meaning "unknown, fall back to the session claim" — rather
 * than throwing, in three cases that are all reachable in normal use:
 *
 *  - no id on the session (an OTP session has no backing row yet);
 *  - the row genuinely isn't there yet. Registration and email verification
 *    redirect here in the same breath as the row being written, and a read
 *    that lands first must not 500 the cart;
 *  - the query itself fails.
 *
 * Nothing is granted by this being unknown: the cart gate is UI only, and
 * prepareOrder re-reads the row on every order, so an unverified buyer is
 * still refused at checkout.
 */
async function readFGasStatus(userId: string | undefined): Promise<FGasStatus | null> {
  if (!userId) return null;

  try {
    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: { fGasStatus: true },
    });
    return buyer?.fGasStatus ?? null;
  } catch (error) {
    console.error("cart: could not read the F-Gas status; falling back to the session claim:", error);
    return null;
  }
}

export default async function Page() {
  const session = await auth();

  const [products, fGasStatus] = await Promise.all([
    // The live catalog enriches persisted cart lines (safety class, GWP,
    // category) and prices the AI audit's suggested additions.
    getProducts(),
    readFGasStatus(session?.user?.id),
  ]);

  return <CartPage products={products} fGasStatus={fGasStatus} />;
}
