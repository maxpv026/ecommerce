import type { Metadata } from "next";
import DesktopRedirect from "@/components/DesktopRedirect";
import MobileLanguageSwitcherLayout from "@/components/MobileLanguageSwitcherLayout";

export const metadata: Metadata = {
  title: "Language — My Energy",
  description: "Choose your preferred language for the My Energy app.",
};

export default function LanguageSettingsPage() {
  return (
    <>
      {/* Desktop changes the interface language in Settings. */}
      <DesktopRedirect to="/profile/settings" />
      <div className="block md:hidden">
        <MobileLanguageSwitcherLayout />
      </div>
    </>
  );
}
