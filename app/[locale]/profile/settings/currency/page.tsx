import type { Metadata } from "next";
import MobileOptionListLayout from "@/components/MobileOptionListLayout";
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY_ID } from "@/lib/mobilePreferences";

export const metadata: Metadata = {
  title: "Currency — My Energy",
  description: "Choose your preferred currency for the My Energy app.",
};

export default function CurrencySettingsPage() {
  return (
    <div className="block md:hidden">
      <MobileOptionListLayout title="Currency" options={CURRENCY_OPTIONS} defaultId={DEFAULT_CURRENCY_ID} />
    </div>
  );
}
