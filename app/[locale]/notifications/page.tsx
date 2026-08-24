import type { Metadata } from "next";
import MobileNotificationsLayout from "@/components/MobileNotificationsLayout";

export const metadata: Metadata = {
  title: "Notifications — My Energy",
  description: "Shipment, compliance, and account notifications for your My Energy account.",
};

export default function NotificationsPage() {
  return (
    <div className="block md:hidden">
      <MobileNotificationsLayout />
    </div>
  );
}
