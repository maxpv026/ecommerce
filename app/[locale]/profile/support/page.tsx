import type { Metadata } from "next";
import MobileSupportLayout from "@/components/MobileSupportLayout";

export const metadata: Metadata = {
  title: "Help Center — My Energy",
  description: "FAQs and contact support for your My Energy account.",
};

export default function SupportPage() {
  return (
    <div className="block md:hidden">
      <MobileSupportLayout />
    </div>
  );
}
