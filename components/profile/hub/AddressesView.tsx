"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, HardHat, MapPin, Pencil, Plus, Trash2, Warehouse } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { ICON_TILE, MicroBadge, ROW_ACTION_GHOST, ROW_ACTION_PRIMARY, SURFACE } from "@/components/home/ui";
import { deleteAddress, setDefaultAddress } from "@/lib/actions/address";
import type { UserAddress } from "@/lib/data";
import { EmptyRow, SurfaceHead } from "./parts";

const SITE_ICON = { WAREHOUSE: Warehouse, SITE: HardHat, OFFICE: Building2 } as const;

/** The one address manager on the page: add, edit, set default, delete (with a confirm step). */
export default function AddressesView({ addresses, onEdit }: { addresses: UserAddress[]; onEdit: (address: UserAddress | null) => void }) {
  const t = useTranslations("ProfileHub");
  const tDash = useTranslations("ProfileDashboard");
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean }>, done: string) =>
    start(async () => {
      const result = await fn().catch(() => null);
      if (!result?.ok) {
        toast.error(tDash("adrToastError"));
        return;
      }
      setConfirming(null);
      toast.success(done);
      router.refresh();
    });

  return (
    <div className={SURFACE} data-profile-addresses>
      <SurfaceHead title={t("addressesTitle")} meta={[t("addressesCount", { count: addresses.length }), t("addressesMeta")]} id="addresses">
        <button type="button" onClick={() => onEdit(null)} className={ROW_ACTION_PRIMARY} data-address-add>
          <Plus size={14} strokeWidth={2.4} />
          {t("addressAdd")}
        </button>
      </SurfaceHead>
      {addresses.length === 0 ? (
        <EmptyRow>{t("addressesEmpty")}</EmptyRow>
      ) : (
        addresses.map((a) => {
          const Icon = a.siteType ? SITE_ICON[a.siteType] : MapPin;
          const lines = a.street ? [a.street, [a.postalCode, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ") : a.fullAddress;
          return (
            <div key={a.id} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b sm:grid-cols-[40px_minmax(0,1fr)_auto] border-slate-900/[.06] px-5 py-4 last:border-b-0 dark:border-white/[.06]" data-address-row={a.id}>
              <span className={ICON_TILE}>
                <Icon size={17} strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[14px] font-semibold tracking-[-.02em]">{a.title}</span>
                  {a.isDefault && <MicroBadge tone="info" data-address-default="">{t("addressDefault")}</MicroBadge>}
                  {a.siteType && <MicroBadge data-address-site={a.siteType}>{tDash(`adrSite_${a.siteType}`)}</MicroBadge>}
                  {a.kind === "BILLING" && <MicroBadge>{tDash("adrBadgeBilling")}</MicroBadge>}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-slate-600 dark:text-slate-300">
                  {a.recipientName} · {lines}
                </div>
                {a.phone && <div className="mt-0.5 text-[12px] text-slate-500 tabular-nums dark:text-ink-muted">{a.phone}</div>}
              </div>
              {confirming === a.id ? (
                <div className="col-span-2 flex items-center justify-end gap-1.5 sm:col-span-1" data-address-confirm>
                  <span className="text-[12px] text-slate-600 dark:text-slate-300">{t("addressDeleteConfirm")}</span>
                  <button type="button" onClick={() => setConfirming(null)} className={ROW_ACTION_GHOST}>
                    {t("cancel")}
                  </button>
                  <button type="button" disabled={pending} onClick={() => run(() => deleteAddress(a.id), t("addressDeleted"))} className={`${ROW_ACTION_PRIMARY} !bg-red-600 hover:!bg-red-700`} data-address-delete-yes>
                    {t("delete")}
                  </button>
                </div>
              ) : (
                <div className="col-span-2 flex items-center justify-end gap-1.5 sm:col-span-1">
                  {!a.isDefault && (
                    <button type="button" disabled={pending} onClick={() => run(() => setDefaultAddress(a.id), t("addressDefaultSet"))} className={ROW_ACTION_GHOST} data-address-set-default>
                      {t("addressMakeDefault")}
                    </button>
                  )}
                  <button type="button" onClick={() => onEdit(a)} aria-label={tDash("adrEditAria")} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-900/[.05] dark:text-slate-300 dark:hover:bg-white/[.08]" data-address-edit>
                    <Pencil size={15} strokeWidth={1.9} />
                  </button>
                  <button type="button" onClick={() => setConfirming(a.id)} aria-label={tDash("adrDeleteAria")} className="flex h-9 w-9 items-center justify-center rounded-full text-red-500 hover:bg-red-500/[.1] dark:text-red-400" data-address-delete>
                    <Trash2 size={15} strokeWidth={1.9} />
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
