import type { Metadata } from "next";
import MobileCompanyLayout from "@/components/MobileCompanyLayout";

export const metadata: Metadata = {
  title: "Company & VAT — My Energy",
  description: "Company profile and VAT verification details for your My Energy account.",
};

export default function CompanyPage() {
  return (
    <div className="block md:hidden">
      <MobileCompanyLayout />
    </div>
  );
}
