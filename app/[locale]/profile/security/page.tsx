import type { Metadata } from "next";
import MobileSecurityLayout from "@/components/MobileSecurityLayout";
import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Security & 2FA — My Energy",
  description: "Manage two-factor authentication and active sessions for your My Energy account.",
};

export default function SecurityPage() {
  return (
    <AppChrome>
      <div className="mx-auto w-full md:max-w-[620px] md:py-10">
      <MobileSecurityLayout />
      </div>
    </AppChrome>
  );
}
