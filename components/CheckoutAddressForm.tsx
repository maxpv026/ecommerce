"use client";

import { useId, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Loader2, MapPinPlus } from "lucide-react";
import { saveAddress, type SavedAddress } from "@/lib/actions/address";

/**
 * The in-checkout "add a shipping address" form.
 *
 * Deliberately asks only for shipping facts — no address label: the server
 * derives one from the city (lib/actions/address.ts), so the buyer answers
 * six questions instead of seven on the page where every extra field costs
 * conversions. Saving hands the created row straight back to the parent,
 * which selects it; there is no refetch in the critical path.
 *
 * Mount inside <AnimatePresence> — the height animation lives here so the
 * surrounding layout reflows smoothly whether the form opens by itself
 * (no saved addresses) or from the "+ Add new address" button.
 */

const FIELDS = [
  { key: "recipientName", labelKey: "adrFormRecipient", autoComplete: "organization", span: 2 },
  { key: "street", labelKey: "adrFormStreet", autoComplete: "address-line1", span: 2 },
  { key: "city", labelKey: "adrFormCity", autoComplete: "address-level2", span: 1 },
  { key: "postalCode", labelKey: "adrFormPostal", autoComplete: "postal-code", span: 1 },
  { key: "country", labelKey: "adrFormCountry", autoComplete: "country-name", span: 1 },
  { key: "phone", labelKey: "adrFormPhone", autoComplete: "tel", span: 1, type: "tel" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type FormState = Record<FieldKey, string>;

const EMPTY: FormState = {
  recipientName: "",
  street: "",
  city: "",
  postalCode: "",
  country: "",
  phone: "",
};

// Tech-Luxury: near-black glass, hairline border, cyan focus.
const CYAN = "#06b6d4";

interface CheckoutAddressFormProps {
  /** Hidden when this is the buyer's only way forward (no saved addresses). */
  canCancel: boolean;
  onCancel: () => void;
  /** Handed the created row; the parent selects it and closes the form. */
  onSaved: (address: SavedAddress) => void;
}

export default function CheckoutAddressForm({ canCancel, onCancel, onSaved }: CheckoutAddressFormProps) {
  const t = useTranslations("Checkout");
  const formId = useId();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [focus, setFocus] = useState<FieldKey | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = FIELDS.filter((f) => form[f.key].trim().length === 0).map((f) => f.key);
  const complete = missing.length === 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setTouched(true);
    setError(null);
    if (!complete) {
      setError(t("adrFormIncomplete"));
      return;
    }

    setSaving(true);
    const result = await saveAddress({
      recipientName: form.recipientName,
      street: form.street,
      city: form.city,
      postalCode: form.postalCode,
      country: form.country,
      phone: form.phone,
      kind: "SHIPPING",
    });
    setSaving(false);

    if (!result.ok) {
      setError(t("adrFormError"));
      return;
    }
    onSaved(result.address);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden"
      data-address-form
    >
      <form
        onSubmit={submit}
        noValidate
        className="relative mt-0.5 overflow-hidden rounded-[22px] border border-slate-900/[.1] bg-white/70 p-5 shadow-[0_28px_64px_-40px_rgba(2,4,10,.6)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#141518]/50"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,#22d3ee,transparent_68%)] opacity-[.22] blur-[52px]"
        />

        <div className="relative mb-4 flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[linear-gradient(140deg,#06b6d4,#2563eb)] text-white shadow-[0_12px_24px_-12px_rgba(6,182,212,.9)]">
            <MapPinPlus size={17} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h3 className="m-0 text-[14.5px] font-semibold tracking-[-.025em]">{t("adrFormTitle")}</h3>
            <p className="mb-0 mt-0.5 text-[12px] leading-[1.5] text-slate-500 dark:text-ink-muted">
              {t("adrFormSubtitle")}
            </p>
          </div>
        </div>

        <div className="relative grid grid-cols-2 gap-2.5">
          {FIELDS.map((field) => {
            const value = form[field.key];
            const focused = focus === field.key;
            const lifted = focused || value.length > 0;
            const invalid = touched && value.trim().length === 0;
            const accent = invalid ? "#f87171" : CYAN;
            return (
              <label
                key={field.key}
                htmlFor={`${formId}-${field.key}`}
                className={`relative block ${field.span === 2 ? "col-span-2" : "col-span-1"}`}
              >
                <span
                  className="pointer-events-none absolute left-[14px] z-[1] transition-all duration-[220ms] ease-[cubic-bezier(.16,1,.3,1)]"
                  style={{
                    top: lifted ? 8 : 16,
                    fontSize: lifted ? 9.5 : 13,
                    letterSpacing: lifted ? ".07em" : "-.01em",
                    color: focused || invalid ? accent : "var(--hc-label-idle, #94a3b8)",
                  }}
                >
                  {t(field.labelKey)}
                </span>
                <input
                  id={`${formId}-${field.key}`}
                  name={field.key}
                  type={"type" in field ? field.type : "text"}
                  autoComplete={field.autoComplete}
                  value={value}
                  aria-invalid={invalid || undefined}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  onFocus={() => setFocus(field.key)}
                  onBlur={() => setFocus(null)}
                  data-address-field={field.key}
                  className="h-[54px] w-full rounded-2xl border bg-slate-50 px-[14px] pb-2 pt-[21px] text-[13.5px] tracking-[-.01em] text-slate-900 transition-[border-color,box-shadow] duration-[240ms] focus:outline-none dark:bg-white/[.03] dark:text-slate-50"
                  style={{
                    borderColor: focused || invalid ? accent : "var(--hc-border-idle, rgba(15,23,42,.14))",
                    boxShadow: focused ? `0 0 0 3px ${accent}2e, 0 0 22px -10px ${accent}` : "none",
                  }}
                />
              </label>
            );
          })}
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            data-address-form-error
            className="mb-0 mt-3 text-[12px] leading-[1.5] text-red-600 dark:text-red-400"
          >
            {error}
          </motion.p>
        )}

        <div className="relative mt-4 flex items-center gap-2.5">
          <motion.button
            type="submit"
            whileHover={saving ? undefined : { y: -1 }}
            whileTap={saving ? undefined : { scale: 0.98 }}
            disabled={saving}
            data-address-save
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(140deg,#06b6d4,#0e7490)] text-[13.5px] font-semibold tracking-[-.015em] text-white shadow-[0_18px_38px_-18px_rgba(6,182,212,.95)] transition-[filter,box-shadow] duration-200 hover:shadow-[0_22px_46px_-18px_rgba(6,182,212,.95),0_0_26px_-10px_#06b6d4] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />}
            {saving ? t("adrFormSaving") : t("adrFormSave")}
          </motion.button>

          {canCancel && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={onCancel}
              disabled={saving}
              data-address-cancel
              className="flex h-12 flex-none items-center justify-center rounded-[14px] border border-slate-900/[.12] px-5 text-[13px] font-semibold tracking-[-.015em] text-slate-600 transition-colors hover:bg-slate-900/[.04] disabled:opacity-50 dark:border-white/10 dark:text-ink-muted dark:hover:bg-white/[.06]"
            >
              {t("adrFormCancel")}
            </motion.button>
          )}
        </div>
      </form>
    </motion.div>
  );
}
