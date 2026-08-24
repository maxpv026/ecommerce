import type { Metadata } from "next";
import MobileAddCardLayout from "@/components/MobileAddCardLayout";

export const metadata: Metadata = {
  title: "Add Card — My Energy",
  description: "Add a new payment method to your My Energy account.",
};

export default function AddCardPage() {
  return (
    <div className="block md:hidden">
      <MobileAddCardLayout />
    </div>
  );
}
