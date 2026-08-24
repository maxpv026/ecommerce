import type { Metadata } from "next";
import MobileTermsLayout from "@/components/MobileTermsLayout";

export const metadata: Metadata = {
  title: "Terms of Service — My Energy",
  description: "My Energy's Terms of Service.",
};

export default function TermsPage() {
  return (
    <div className="block md:hidden">
      <MobileTermsLayout />
    </div>
  );
}
