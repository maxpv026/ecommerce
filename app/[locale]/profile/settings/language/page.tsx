import type { Metadata } from "next";
import MobileLanguageSwitcherLayout from "@/components/MobileLanguageSwitcherLayout";

export const metadata: Metadata = {
  title: "Language — My Energy",
  description: "Choose your preferred language for the My Energy app.",
};

export default function LanguageSettingsPage() {
  return (
    <div className="block md:hidden">
      <MobileLanguageSwitcherLayout />
    </div>
  );
}
