"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import AddressModal from "@/components/AddressModal";
import MobileSubPageHeader from "@/components/MobileSubPageHeader";
import type { UserAddress } from "@/lib/data";
import AddressesView from "./AddressesView";

/**
 * /profile/addresses on a phone: the same address manager as the desktop
 * Addresses tab — every add, edit, default and delete goes to the database.
 * (It replaced a screen whose delete only removed the row from the screen.)
 */
export default function MobileAddresses({ addresses }: { addresses: UserAddress[] }) {
  const t = useTranslations("ProfileHub");
  const router = useRouter();
  const [modal, setModal] = useState<{ address: UserAddress | null } | null>(null);
  return (
    <div className="min-h-screen bg-canvas pb-[calc(110px+env(safe-area-inset-bottom))]" data-mobile-addresses>
      <MobileSubPageHeader title={t("tab_addresses")} />
      <div className="px-4 pt-2">
        <AddressesView addresses={addresses} onEdit={(address) => setModal({ address })} />
      </div>
      <AddressModal
        key={modal ? (modal.address?.id ?? "new") : "closed"}
        open={modal !== null}
        address={modal?.address ?? null}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          toast.success(t("savedToast"));
          router.refresh();
        }}
      />
    </div>
  );
}
