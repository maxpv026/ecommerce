"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { saveAddress } from "@/lib/actions/address";
import type { UserAddress } from "@/lib/data";

const ACCENT = "#1d4ed8";

type FormState = {
  title: string;
  recipientName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

const EMPTY: FormState = {
  title: "",
  recipientName: "",
  street: "",
  city: "",
  postalCode: "",
  country: "",
  isDefault: false,
};

interface FieldSpec {
  key: keyof Omit<FormState, "isDefault">;
  labelKey: string;
  placeholder: string;
  wide?: boolean;
}

const FIELDS: FieldSpec[] = [
  { key: "title", labelKey: "adrFieldLabel", placeholder: "Office / Workspace", wide: true },
  { key: "recipientName", labelKey: "adrFieldRecipient", placeholder: "Full name or company", wide: true },
  { key: "street", labelKey: "adrFieldStreet", placeholder: "vul. Shevchenka 12, of. 4", wide: true },
  { key: "city", labelKey: "adrFieldCity", placeholder: "Lviv" },
  { key: "postalCode", labelKey: "adrFieldPostal", placeholder: "79000" },
  { key: "country", labelKey: "adrFieldCountry", placeholder: "Ukraine", wide: true },
];

interface AddressModalProps {
  open: boolean;
  /** null = create; an existing address = edit. */
  address: UserAddress | null;
  onClose: () => void;
  /** Called after a successful save — parent refreshes + toasts. */
  onSaved: () => void;
}

export default function AddressModal({ open, address, onClose, onSaved }: AddressModalProps) {
  const t = useTranslations("ProfileDashboard");
  const tAccount = useTranslations("AccountProfile");
  // The parent remounts this component per open/edit target (via `key`),
  // so initializing from props here is safe — no sync-setState effects.
  const [form, setForm] = useState<FormState>(() =>
    address
      ? {
          title: address.title,
          recipientName: address.recipientName,
          street: address.street ?? "",
          city: address.city ?? "",
          postalCode: address.postalCode ?? "",
          country: address.country ?? "",
          isDefault: address.isDefault,
        }
      : EMPTY
  );
  const [focus, setFocus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(address);

  // Escape closes; page scroll locks behind the blurred overlay.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const result = await saveAddress({
      id: address?.id,
      title: form.title,
      recipientName: form.recipientName,
      street: form.street,
      city: form.city,
      postalCode: form.postalCode,
      country: form.country,
      kind: address?.kind ?? "SHIPPING",
      isDefault: form.isDefault,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(t("adrToastError"));
      return;
    }
    onSaved();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
          className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-900/[.42] p-8 backdrop-blur-md dark:bg-[#090A0C]/80"
        >
          <motion.div
            initial={{ y: 14, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            data-address-modal
            className="relative w-[560px] max-w-full overflow-hidden rounded-[30px] border border-slate-900/[.14] bg-white/[.92] p-[30px] shadow-[0_60px_120px_-50px_rgba(2,4,10,.8)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/[.16] dark:bg-[rgba(20,21,24,.9)]"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[30px]">
              <div className="absolute -top-[46%] left-[-14%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_68%)] opacity-[.34] blur-[90px]" />
              <div className="absolute -bottom-[44%] right-[-16%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_68%)] opacity-[.28] blur-[90px]" />
            </div>

            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-[9px] text-[11px] tracking-[.09em] text-slate-400 dark:text-ink-muted">
                    {editing ? t("adrEditEyebrow") : t("adrNewEyebrow")}
                  </div>
                  <h3 className="m-0 text-2xl font-semibold tracking-[-.038em]">
                    {editing ? t("adrEditTitle") : t("adrNewTitle")}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("adrCancel")}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-900/[.05] dark:text-ink-muted dark:hover:bg-white/10"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>

              <div className="mt-[26px] grid grid-cols-2 gap-3.5">
                {FIELDS.map((field) => {
                  const value = form[field.key];
                  const focused = focus === field.key;
                  const lifted = focused || value.length > 0;
                  return (
                    <label
                      key={field.key}
                      className={`relative block ${field.wide ? "col-span-2" : "col-span-1"}`}
                    >
                      <span
                        className="pointer-events-none absolute left-[15px] transition-all duration-[220ms] ease-[cubic-bezier(.16,1,.3,1)]"
                        style={{
                          top: lifted ? 9 : 17,
                          fontSize: lifted ? 10 : 13,
                          letterSpacing: lifted ? ".07em" : "-.01em",
                          color: focused ? ACCENT : "var(--hc-label-idle, #94a3b8)",
                        }}
                      >
                        {t(field.labelKey)}
                      </span>
                      <input
                        value={value}
                        onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                        onFocus={() => setFocus(field.key)}
                        onBlur={() => setFocus(null)}
                        placeholder={focused ? field.placeholder : ""}
                        className="h-14 w-full rounded-2xl border bg-slate-50 px-[15px] pb-2 pt-[22px] text-[13.5px] tracking-[-.01em] text-slate-900 transition-[border-color,box-shadow] duration-[240ms] focus:outline-none dark:bg-white/[.04] dark:text-slate-50 dark:placeholder:text-slate-600"
                        style={{
                          borderColor: focused ? ACCENT : "var(--hc-border-idle, rgba(15,23,42,.14))",
                          boxShadow: focused ? `0 0 0 4px ${ACCENT}26, 0 0 22px -8px ${ACCENT}` : "none",
                        }}
                      />
                    </label>
                  );
                })}
              </div>

              <label className="mt-4 flex cursor-pointer items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isDefault}
                  onClick={(e) => {
                    e.preventDefault();
                    setForm((f) => ({ ...f, isDefault: !f.isDefault }));
                  }}
                  className={`relative h-7 w-[46px] flex-none rounded-full transition-colors duration-300 ${
                    form.isDefault ? "bg-blue-700" : "bg-slate-900/[.14] dark:bg-hairline-strong"
                  }`}
                >
                  <motion.span
                    animate={{ x: form.isDefault ? 18 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    className="absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,.3)]"
                  />
                </button>
                <span className="text-[13px] text-slate-600 dark:text-ink-muted">{t("adrDefaultToggle")}</span>
              </label>

              <div className="mt-7 flex items-center justify-end gap-2.5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="flex h-11 items-center justify-center rounded-[14px] border border-slate-900/[.14] px-5 text-[13.5px] font-semibold tracking-[-.015em] transition-colors hover:bg-slate-900/[.05] dark:border-hairline-strong dark:hover:bg-white/10"
                >
                  {t("adrCancel")}
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={submit}
                  disabled={saving}
                  className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-[22px] text-[13.5px] font-semibold tracking-[-.015em] text-white shadow-[0_18px_36px_-18px_rgba(29,78,216,.8)] transition-colors hover:bg-blue-800 disabled:opacity-60"
                >
                  {saving && <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />}
                  {editing ? tAccount("saveChanges") : t("adrSave")}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
