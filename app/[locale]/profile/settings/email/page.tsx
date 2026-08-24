import type { Metadata } from "next";
import MobileEmailLayout from "@/components/MobileEmailLayout";

export const metadata: Metadata = {
  title: "Email Address — My Energy",
  description: "Update the email address on your My Energy account.",
};

export default function EmailSettingsPage() {
  return (
    <div className="block md:hidden">
      <MobileEmailLayout />
    </div>
  );
}
