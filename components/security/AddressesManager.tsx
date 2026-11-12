"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, MapPin, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import AddressModal from "@/components/AddressModal";
import { deleteAddress, setDefaultAddress } from "@/lib/actions/address";
import type { UserAddress } from "@/lib/data";

/**
 * Delivery addresses, managed from Settings without leaving it: view, add,
 * edit (the same AddressModal as the dashboard), set default, delete.
 * The list comes from the server page's props; every change refreshes them.
 */

const BTN =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-slate-900/[.12] bg-white/70 px-3 text-[12.5px] font-semibold text-slate-800 transition-colors hover:bg-slate-900/[.04] disabled:opacity-50 dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 dark:hover:bg-white/[.09]";

export default function AddressesManager({ addresses, onClose }: { addresses: UserAddress[]; onClose: () => void }) {
  const t = useTranslations("ProfileDashboard");
  const tS = useTranslations("SecurityCenter");
  const router = useRouter();
  const [editing, setEditing] = useState<{ address: UserAddress | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !editing && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  const act = async (id: string, kind: "default" | "delete") => {
    setBusy(`${kind}:${id}`);
    const result = await (kind === "default" ? setDefaultAddress(id) : deleteAddress(id)).catch(() => null);
    setBusy(null);
    setConfirmDelete(null);
    if (!result?.ok) return void toast.error(tS("errGeneric"));
    toast.success(kind === "default" ? tS("addressDefaultSet") : tS("addressDeleted"));
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="addresses-title"
        data-addresses-modal
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-[22px] border border-slate-900/[.1] bg-white shadow-2xl dark:border-white/[.1] dark:bg-[#0E1116]"
      >
        <div className="flex items-start gap-3 border-b border-slate-900/[.08] px-5 py-4 dark:border-white/[.08]">
          <div className="min-w-0 flex-1">
            <h2 id="addresses-title" className="m-0 text-[16px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">
              {t("adrHeading")}
            </h2>
            <p className="m-0 mt-0.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{t("adrCount", { count: addresses.length })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tS("close")} className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/[.06] dark:hover:text-white">
            <X size={16} />
          </button>
        </div>

        <ul className="m-0 min-h-0 flex-1 list-none divide-y divide-slate-900/[.06] overflow-y-auto p-0 dark:divide-white/[.06]">
          {addresses.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-slate-500 dark:text-ink-muted">{tS("addressesEmpty")}</li>}
          {addresses.map((a) => (
            <li key={a.id} data-address-row={a.id} data-default={a.isDefault ? "1" : "0"} className="flex items-start gap-3 px-5 py-3">
              <span className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl border ${a.isDefault ? "border-blue-600/20 bg-blue-600/[.07] text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/[.1] dark:text-blue-300" : "border-slate-900/[.08] bg-slate-50 text-slate-400 dark:border-white/[.08] dark:bg-white/[.03]"}`}>
                <MapPin size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold tracking-[-.015em] text-slate-900 dark:text-white">{a.title}</span>
                  {a.isDefault && <span className="rounded-full border border-blue-600/25 bg-blue-600/[.08] px-2 py-px text-[10.5px] font-semibold text-blue-700 dark:border-blue-400/30 dark:text-blue-300" data-address-default-badge>{tS("addressDefault")}</span>}
                  <span className="rounded-full border border-slate-900/[.07] bg-slate-100 px-2 py-px text-[10.5px] font-semibold text-slate-600 dark:border-white/[.08] dark:bg-white/[.05] dark:text-ink-muted">
                    {a.kind === "BILLING" ? t("adrBadgeBilling") : t("adrBadgeShipping")}
                  </span>
                </div>
                <p className="m-0 mt-0.5 text-[12px] leading-[1.5] text-slate-500 dark:text-ink-muted">
                  {a.recipientName} · {a.fullAddress}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" className={BTN} onClick={() => setEditing({ address: a })} data-address-edit={a.id}>
                    <Pencil size={12} /> {tS("addressEdit")}
                  </button>
                  {!a.isDefault && (
                    <button type="button" className={BTN} onClick={() => act(a.id, "default")} disabled={busy !== null} data-address-make-default={a.id}>
                      {busy === `default:${a.id}` ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />} {t("adrSetDefault")}
                    </button>
                  )}
                  {confirmDelete === a.id ? (
                    <>
                      <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-red-600 px-3 text-[12.5px] font-semibold text-white hover:bg-red-500 disabled:opacity-50" onClick={() => act(a.id, "delete")} disabled={busy !== null} data-address-delete-confirm={a.id}>
                        {busy === `delete:${a.id}` && <Loader2 size={12} className="animate-spin" />}
                        {tS("addressDeleteConfirm")}
                      </button>
                      <button type="button" className={BTN} onClick={() => setConfirmDelete(null)}>
                        {tS("cancel")}
                      </button>
                    </>
                  ) : (
                    <button type="button" className={`${BTN} hover:text-red-600`} onClick={() => setConfirmDelete(a.id)} data-address-delete={a.id} aria-label={t("adrDeleteAria")}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-t border-slate-900/[.08] px-5 py-3.5 dark:border-white/[.08]">
          <button type="button" onClick={() => setEditing({ address: null })} data-address-add className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[13.5px] font-medium text-white transition-colors hover:bg-blue-500">
            <Plus size={15} /> {t("adrAddNew")}
          </button>
        </div>
      </motion.div>

      {/* Its own backdrop: a click there must not also close this manager. */}
      <div onClick={(e) => e.stopPropagation()}>
      <AddressModal
        key={editing ? (editing.address?.id ?? "new") : "closed"}
        open={editing !== null}
        address={editing?.address ?? null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          toast.success(t("adrToastSaved"));
          router.refresh();
        }}
      />
      </div>
    </div>
  );
}
