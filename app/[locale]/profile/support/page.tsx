import type { Metadata } from "next";
import DesktopRedirect from "@/components/DesktopRedirect";
import MobileSupportLayout from "@/components/MobileSupportLayout";

export const metadata: Metadata = {
  title: "Help Center — My Energy",
  description: "FAQs and contact support for your My Energy account.",
};

export default function SupportPage() {
  return (
    <>
      {/* Desktop has no help screen of its own: the profile, with the chat launcher on the storefront pages. */}
      <DesktopRedirect to="/profile" />
      <div className="block md:hidden">
        <MobileSupportLayout />
      </div>
    </>
  );
}
