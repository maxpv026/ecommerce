import type { Metadata } from "next";
import MobileAddressesLayout from "@/components/MobileAddressesLayout";
import { auth } from "@/auth";
import { getUserAddresses } from "@/lib/data";
import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Saved Addresses — My Energy",
  description: "Manage your saved delivery addresses for My Energy cylinder shipments.",
};

export default async function AddressesPage() {
  const session = await auth();
  const addresses = session?.user?.id ? await getUserAddresses(session.user.id) : [];

  return (
    <AppChrome>
      <div className="mx-auto w-full md:max-w-[620px] md:py-10">
      <MobileAddressesLayout addresses={addresses} />
      </div>
    </AppChrome>
  );
}
