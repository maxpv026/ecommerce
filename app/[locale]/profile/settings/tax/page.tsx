import type { Metadata } from "next";
import MobileTaxLayout from "@/components/MobileTaxLayout";

export const metadata: Metadata = {
  title: "VAT / Tax ID — My Energy",
  description: "VAT verification status for your My Energy account.",
};

export default function TaxSettingsPage() {
  return (
    <div className="block md:hidden">
      <MobileTaxLayout />
    </div>
  );
}
