"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Check, Loader2, X } from "lucide-react";
import AvatarUploader from "@/components/AvatarUploader";
import { PRIMARY, SECONDARY } from "@/components/home/ui";
import { updateProfile } from "@/lib/actions/profile";
import { AVATAR_TONES, AVATAR_TONE_CLASS, FULFILMENT_PREFS, UNIT_PREFS, formatIban, isValidCompanyId, isValidIban, normaliseInitials, type AvatarTone, type FulfilmentPref, type UnitPref } from "@/lib/profilePrefs";
import type { UserProfileData } from "@/lib/data";
import type { ProfilePreferences } from "@/lib/profileHub";

/**
 * The profile editor: a drawer with the account, company and checkout
 * preferences in one form. Plain controlled inputs — validation mirrors
 * lib/actions/profile (which re-checks everything), and errors are shown on
 * the field they belong to.
 */

type Form = {
  name: string;
  jobTitle: string;
  phone: string;
  companyName: string;
  vatNumber: string;
  billingEmail: string;
  depositIban: string;
  avatarTone: AvatarTone | "";
  avatarInitials: string;
  preferredFulfilment: FulfilmentPref | "";
  preferredUnits: UnitPref;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLE_SUGGESTIONS = ["roleHvacLead", "roleProcurement", "roleOwner", "roleServiceTech", "roleProjectManager"] as const;

export default function ProfileEditor({
  profile,
  prefs,
  initials,
  onClose,
  onSaved,
}: {
  profile: UserProfileData;
  prefs: ProfilePreferences;
  initials: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("ProfileHub");
  const { update } = useSession();
  const [form, setForm] = useState<Form>({
    name: profile.name ?? "",
    jobTitle: profile.jobTitle ?? "",
    phone: profile.phone ?? "",
    companyName: profile.companyName ?? "",
    vatNumber: profile.vatNumber ?? "",
    billingEmail: prefs.billingEmail ?? "",
    depositIban: prefs.depositIban ? formatIban(prefs.depositIban) : "",
    avatarTone: prefs.avatarTone ?? "",
    avatarInitials: prefs.avatarInitials ?? "",
    preferredFulfilment: prefs.preferredFulfilment ?? "",
    preferredUnits: prefs.preferredUnits,
  });
  const [serverField, setServerField] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (serverField === key) setServerField(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const errors: Partial<Record<keyof Form, string>> = {};
  if (form.name.trim().length < 2) errors.name = t("errName");
  if (form.vatNumber.trim() && !isValidCompanyId(form.vatNumber)) errors.vatNumber = t("errVat");
  if (form.billingEmail.trim() && !EMAIL.test(form.billingEmail.trim())) errors.billingEmail = t("errEmail");
  if (form.depositIban.trim() && !isValidIban(form.depositIban)) errors.depositIban = t("errIban");
  if (form.phone && !/^[\d\s+()./-]*$/.test(form.phone)) errors.phone = t("errPhone");
  if (serverField && !errors[serverField as keyof Form]) errors[serverField as keyof Form] = t("errServer");
  const invalid = Object.keys(errors).length > 0;

  const save = () =>
    start(async () => {
      const result = await updateProfile({
        ...form,
        avatarInitials: normaliseInitials(form.avatarInitials),
        depositIban: form.depositIban.replace(/\s+/g, ""),
      }).catch(() => null);
      if (!result?.ok) {
        setServerField(result && !result.ok ? (result.field ?? "name") : "name");
        return;
      }
      // Name, monogram colour and initials live in the session (header avatar).
      await update({}).catch(() => undefined);
      onSaved();
      onClose();
    });

  const input = (key: keyof Form, opts: { label: string; mono?: boolean; placeholder?: string; type?: string; list?: string; hint?: string } ) => (
    <label className="block" data-editor-field={key}>
      <span className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-slate-300">{opts.label}</span>
      <input
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        type={opts.type ?? "text"}
        list={opts.list}
        placeholder={opts.placeholder}
        aria-invalid={Boolean(errors[key])}
        className={`h-10 w-full rounded-[11px] border bg-white px-3 text-[13.5px] outline-none transition-[border-color,box-shadow] focus:ring-4 dark:bg-white/[.04] ${opts.mono ? "font-mono tracking-[.02em]" : ""} ${
          errors[key] ? "border-red-500/60 focus:ring-red-500/15" : "border-slate-900/[.12] focus:border-blue-600 focus:ring-blue-600/15 dark:border-white/[.14]"
        }`}
      />
      {errors[key] ? <span className="mt-1 block text-[11.5px] text-red-600 dark:text-red-400" data-editor-error={key}>{errors[key]}</span> : opts.hint ? <span className="mt-1 block text-[11.5px] text-slate-400">{opts.hint}</span> : null}
    </label>
  );

  const shownInitials = normaliseInitials(form.avatarInitials) || initials;
  const section = "border-b border-slate-900/[.06] px-6 py-5 dark:border-white/[.06]";
  const sectionTitle = "mb-3 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted";

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-label={t("editorTitle")} data-profile-editor>
      <button type="button" aria-label={t("close")} onClick={onClose} className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-[560px] max-w-full flex-col bg-white shadow-[0_0_60px_-10px_rgba(2,4,10,.5)] dark:bg-[#0B0F17]">
        <div className="flex items-center justify-between border-b border-slate-900/[.08] px-6 py-4 dark:border-white/[.08]">
          <div>
            <h2 className="m-0 text-[18px] font-semibold tracking-[-.025em]">{t("editorTitle")}</h2>
            <p className="m-0 mt-0.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{t("editorSubtitle")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("close")} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-900/[.05] dark:hover:bg-white/[.08]">
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Avatar */}
          <div className={section}>
            <div className={sectionTitle}>{t("edAvatar")}</div>
            <div className="flex items-center gap-4">
              <AvatarUploader key={profile.avatarUrl ?? "none"} avatarUrl={profile.avatarUrl ?? null} initials={shownInitials} tone={form.avatarTone || null} size={64} editable className="text-[20px]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("edTone")}>
                  {AVATAR_TONES.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      role="radio"
                      aria-checked={form.avatarTone === tone}
                      aria-label={t(`tone_${tone}`)}
                      title={t(`tone_${tone}`)}
                      onClick={() => set("avatarTone", form.avatarTone === tone ? "" : tone)}
                      data-editor-tone={tone}
                      className={`flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-white transition dark:ring-offset-[#0B0F17] ${AVATAR_TONE_CLASS[tone]} ${form.avatarTone === tone ? "ring-2 ring-blue-600" : ""}`}
                    >
                      {form.avatarTone === tone && <Check size={14} strokeWidth={3} />}
                    </button>
                  ))}
                </div>
                <div className="mt-3 w-[180px]">{input("avatarInitials", { label: t("edInitials"), placeholder: initials, hint: t("edInitialsHint") })}</div>
              </div>
            </div>
          </div>

          {/* Person */}
          <div className={section}>
            <div className={sectionTitle}>{t("groupPerson")}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">{input("name", { label: t("fName") })}</div>
              {input("jobTitle", { label: t("fJobTitle"), list: "profile-roles", placeholder: t("roleHvacLead") })}
              {input("phone", { label: t("fPhone"), type: "tel", placeholder: "+380 67 123 45 67" })}
            </div>
            <datalist id="profile-roles">
              {ROLE_SUGGESTIONS.map((k) => (
                <option key={k} value={t(k)} />
              ))}
            </datalist>
          </div>

          {/* Company & billing */}
          <div className={section}>
            <div className={sectionTitle}>{t("groupCompany")}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">{input("companyName", { label: t("fCompany") })}</div>
              {input("vatNumber", { label: t("fVat"), mono: true, placeholder: "NL863495921B01 / 12345678", hint: t("edVatHint") })}
              {input("billingEmail", { label: t("fBillingEmail"), type: "email", placeholder: "accounts@company.eu", hint: t("edBillingHint") })}
              <div className="col-span-2">{input("depositIban", { label: t("fIban"), mono: true, placeholder: "UA21 3223 1300 0002 6007 2335 6600 1", hint: t("edIbanHint") })}</div>
            </div>
          </div>

          {/* Checkout preferences */}
          <div className={section}>
            <div className={sectionTitle}>{t("groupPrefs")}</div>
            <div className="mb-1 text-[12px] font-medium text-slate-600 dark:text-slate-300">{t("fFulfilment")}</div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("fFulfilment")}>
              {(["", ...FULFILMENT_PREFS] as const).map((f) => {
                const on = form.preferredFulfilment === f;
                return (
                  <button
                    key={f || "any"}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("preferredFulfilment", f)}
                    data-editor-fulfilment={f || "any"}
                    className={`rounded-[12px] border px-3 py-2.5 text-left text-[12.5px] transition-colors ${f === "" ? "col-span-2" : ""} ${
                      on ? "border-blue-600 bg-blue-600/[.06] font-semibold text-blue-800 dark:border-blue-400 dark:bg-blue-500/[.12] dark:text-blue-200" : "border-slate-900/[.12] text-slate-700 hover:bg-slate-900/[.03] dark:border-white/[.14] dark:text-slate-300"
                    }`}
                  >
                    {f ? t(`ful_${f}`) : t("fulfilmentAny")}
                  </button>
                );
              })}
            </div>
            <p className="m-0 mt-1.5 text-[11.5px] text-slate-400">{t("edFulfilmentHint")}</p>

            <div className="mb-1 mt-4 text-[12px] font-medium text-slate-600 dark:text-slate-300">{t("fPayment")}</div>
            <div className="rounded-[12px] border border-slate-900/[.08] bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-700 dark:border-white/[.1] dark:bg-white/[.03] dark:text-slate-300" data-editor-payment>
              {t("paymentSepa")} <span className="text-slate-400">· {t("edPaymentHint")}</span>
            </div>

            <div className="mb-1 mt-4 text-[12px] font-medium text-slate-600 dark:text-slate-300">{t("fUnits")}</div>
            <div className="inline-flex rounded-full border border-slate-900/[.12] p-1 dark:border-white/[.14]" role="radiogroup" aria-label={t("fUnits")}>
              {UNIT_PREFS.map((u) => (
                <button key={u} type="button" role="radio" aria-checked={form.preferredUnits === u} onClick={() => set("preferredUnits", u)} data-editor-units={u} className={`h-[30px] rounded-full px-3 text-[12.5px] font-semibold ${form.preferredUnits === u ? "bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}>
                  {t(`units_${u}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-900/[.08] px-6 py-4 dark:border-white/[.08]">
          <button type="button" onClick={onClose} className={`${SECONDARY} !h-12 flex-1`}>
            {t("cancel")}
          </button>
          <button type="button" onClick={save} disabled={pending || invalid} className={`${PRIMARY} flex-[2]`} data-editor-save>
            {pending && <Loader2 size={16} className="animate-spin" />}
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
