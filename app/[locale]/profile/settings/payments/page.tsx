import type { Metadata } from "next";
import MobilePaymentMethodsLayout from "@/components/MobilePaymentMethodsLayout";

export const metadata: Metadata = {
  title: "Payment Methods — My Energy",
  description: "Manage the payment methods on file for your My Energy account.",
};

export default function PaymentMethodsPage() {
  return (
    <div className="block md:hidden">
      <MobilePaymentMethodsLayout />
    </div>
  );
}
