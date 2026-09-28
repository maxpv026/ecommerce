import type { Metadata } from "next";
import MobileNotificationsLayout from "@/components/MobileNotificationsLayout";
import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Notifications — My Energy",
  description: "Shipment, compliance, and account notifications for your My Energy account.",
};

export default function NotificationsPage() {
  return (
    <AppChrome>
      <div className="mx-auto w-full md:max-w-[620px] md:py-10">
      <MobileNotificationsLayout />
      </div>
    </AppChrome>
  );
}
