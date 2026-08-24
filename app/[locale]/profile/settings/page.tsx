import type { Metadata } from "next";
import MobileSettingsLayout from "@/components/MobileSettingsLayout";

export const metadata: Metadata = {
  title: "Settings — My Energy",
  description: "Manage your My Energy account, security, and notification preferences.",
};

export default function SettingsPage() {
  return (
    <div className="block md:hidden">
      <MobileSettingsLayout />
    </div>
  );
}
