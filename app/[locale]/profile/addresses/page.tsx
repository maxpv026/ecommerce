import type { Metadata } from "next";
import DesktopRedirect from "@/components/DesktopRedirect";
import MobileAddresses from "@/components/profile/hub/MobileAddresses";
import { auth } from "@/auth";
import { getUserAddresses } from "@/lib/data";

export const metadata: Metadata = {
  title: "Addresses — My Energy",
  description: "Delivery and site addresses for My Energy cylinder shipments.",
};

export default async function AddressesPage() {
  const session = await auth();
  const addresses = session?.user?.id ? await getUserAddresses(session.user.id) : [];

  return (
    <>
      {/* Desktop manages addresses in the profile's Addresses tab. */}
      <DesktopRedirect to="/profile?tab=addresses" />
      <div className="md:hidden">
        <MobileAddresses addresses={addresses} />
      </div>
    </>
  );
}
