import type { Metadata } from "next";
import MobileAddressesLayout from "@/components/MobileAddressesLayout";
import { auth } from "@/auth";
import { getUserAddresses } from "@/lib/data";

export const metadata: Metadata = {
  title: "Saved Addresses — My Energy",
  description: "Manage your saved delivery addresses for My Energy cylinder shipments.",
};

export default async function AddressesPage() {
  const session = await auth();
  const addresses = session?.user?.id ? await getUserAddresses(session.user.id) : [];

  return (
    <div className="block md:hidden">
      <MobileAddressesLayout addresses={addresses} />
    </div>
  );
}
