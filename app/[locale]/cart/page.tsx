import type { Metadata } from "next";
import CartPage from "@/components/CartPage";
import { getProducts } from "@/lib/data";

export const metadata: Metadata = {
  title: "Your Cart — My Energy",
  description: "Review your refrigerant cylinders and proceed to checkout.",
};

export default async function Page() {
  // The live catalog enriches persisted cart lines (safety class, GWP,
  // category) and prices the AI audit's suggested additions.
  const products = await getProducts();
  return <CartPage products={products} />;
}
