import type { Metadata } from "next";
import MobilePasswordLayout from "@/components/MobilePasswordLayout";

export const metadata: Metadata = {
  title: "Change Password — My Energy",
  description: "Update the password on your My Energy account.",
};

export default function PasswordSettingsPage() {
  return (
    <div className="block md:hidden">
      <MobilePasswordLayout />
    </div>
  );
}
