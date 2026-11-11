import type { Metadata } from "next";
import CartPage from "@/components/CartPage";
import { auth } from "@/auth";
import { getProducts } from "@/lib/data";
import { getFgasSummary } from "@/lib/fgasAccount";

export const metadata: Metadata = {
  title: "Your Cart — My Energy",
  description: "Review your refrigerant cylinders and proceed to checkout.",
};

// The buyer's F-Gas standing comes from the row (lib/fgasAccount), not the
// session: the JWT is only as fresh as the last sign-in. UI only — prepareOrder
// re-reads it on every order.
export default async function Page() {
  const session = await auth();

  const [products, fgas] = await Promise.all([
    // The live catalog enriches persisted cart lines (safety class, GWP,
    // category) and prices the AI audit's suggested additions.
    getProducts(),
    getFgasSummary(session?.user?.id),
  ]);

  return <CartPage products={products} fgas={fgas} />;
}
