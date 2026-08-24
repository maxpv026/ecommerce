import type { Metadata } from "next";
import MobileSecurityLayout from "@/components/MobileSecurityLayout";

export const metadata: Metadata = {
  title: "Security & 2FA — My Energy",
  description: "Manage two-factor authentication and active sessions for your My Energy account.",
};

export default function SecurityPage() {
  return (
    <div className="block md:hidden">
      <MobileSecurityLayout />
    </div>
  );
}
