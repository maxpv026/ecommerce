import type { Metadata } from "next";
import CartPage from "@/components/CartPage";

export const metadata: Metadata = {
  title: "Your Cart — My Energy",
  description: "Review your refrigerant cylinders and proceed to checkout.",
};

export default function Page() {
  return <CartPage />;
}
