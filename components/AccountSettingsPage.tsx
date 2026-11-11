"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Building2,
  CalendarClock,
  Check,
  FileBadge2,
  KeyRound,
  Landmark,
  Laptop,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Monitor,
  Moon,
  PackageCheck,
  Phone,
  ReceiptText,
  Scale,
  Send,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sun,
  TrendingDown,
  User,
} from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import ToggleSwitch from "./ToggleSwitch";
import ChangePasswordFlow from "./ChangePasswordFlow";
import type { UserProfileData } from "@/lib/data";
import { updateNotificationPreferences, updateReorderCadence } from "@/lib/actions/notifications";
import { sendTestNotification, type TestNotificationKind } from "@/lib/actions/notificationTest";
import { updateProfile } from "@/lib/actions/profile";
import { signOutOtherDevices } from "@/lib/actions/sessions";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  ESSENTIAL_TOPICS,
  NOTIFICATION_TOPICS,
  REORDER_CADENCES,
  type NotificationPreferences,
  type NotificationTopic,
  type ReorderCadence,
} from "@/lib/notifications";
import { LANGUAGE_OPTIONS } from "@/lib/languageNames";
import { useSwitchLocale } from "@/lib/hooks/useSwitchLocale";
import { useThemeChoice } from "@/lib/hooks/useThemeChoice";
import type { ThemeChoice } from "@/lib/theme";

/**
 * Desktop /profile/settings — the account command centre.
 *
 *   row 1  Email notifications (7)  |  Profile & company (5) + Interface & region (5)
 *   row 2  Security & access, full width
 *
 * Every control writes to the account: the six email topics and the restock
 * cadence (lib/actions/notifications), the profile and VAT details
 * (lib/actions/profile), theme and language (both mirrored to the User row),
 * and "sign out of all other devices" (lib/actions/sessions). Nothing here is
 * a placeholder — the currency row says plainly why it is fixed to EUR.
 */

const CARD = "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0E1116] dark:shadow-none";
const TOGGLE_ON = "bg-blue-600 dark:bg-blue-500";
const MUTED = "text-slate-500 dark:text-zinc-400";
const INPUT =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13.5px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/[.06] dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-white/25 dark:focus:ring-white/[.06]";
const SECONDARY_BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/[0.08]";
const PRIMARY_BTN =
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-4 text-[13px] font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-zinc-200";

const TOPICS: Record<NotificationTopic, { icon: typeof BellRing; tone: "blue" | "emerald" }> = {
  abandonedCart: { icon: ShoppingCart, tone: "blue" },
  restockReminders: { icon: CalendarClock, tone: "blue" },
  priceDrops: { icon: TrendingDown, tone: "blue" },
  backInStock: { icon: PackageCheck, tone: "blue" },
  fgasExpiry: { icon: FileBadge2, tone: "emerald" },
  regulatory: { icon: Scale, tone: "emerald" },
};
const TILE_ON = {
  blue: "border-blue-600/20 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300",
  emerald: "border-emerald-600/20 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
};
const TILE_OFF = "border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-500";

/** Which rows offer "send a test", and the action kind behind it. */
const TESTABLE: Partial<Record<NotificationTopic, TestNotificationKind>> = { abandonedCart: "abandonedCart", restockReminders: "restockReminders" };

function SectionHeader({ icon: Icon, title, body, action }: { icon: typeof BellRing; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-200 px-6 py-4 dark:border-white/[0.08]">
      <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
        <Icon size={15} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[15px] font-semibold tracking-[-.015em] text-slate-900 dark:text-white">{title}</h2>
        <p className={`m-0 mt-0.5 text-[12.5px] leading-[1.5] ${MUTED}`}>{body}</p>
      </div>
      {action}
    </div>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────

function NotificationsCard({ profile, className = "" }: { profile: UserProfileData | null; className?: string }) {
  const t = useTranslations("AccountSettings");
  const [prefs, setPrefs] = useState<NotificationPreferences>(profile?.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES);
  const [cadence, setCadence] = useState<ReorderCadence>(profile?.reorderReminderDays ?? null);
  const [savedAt, setSavedAt] = useState(0);
  const [testing, setTesting] = useState<TestNotificationKind | null>(null);
  const [, startTransition] = useTransition();
  const signedIn = Boolean(profile);

  // The "Saved" badge stays for two seconds after the last confirmed write.
  useEffect(() => {
    if (!savedAt) return;
    const id = setTimeout(() => setSavedAt(0), 2000);
    return () => clearTimeout(id);
  }, [savedAt]);

  /** Shows the change at once, saves only what changed, and puts it back if the save fails. */
  const apply = (next: Partial<NotificationPreferences>) => {
    const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => prefs[k as NotificationTopic] !== v)) as Partial<NotificationPreferences>;
    if (Object.keys(changed).length === 0 || !signedIn) return;
    const before = Object.fromEntries(Object.keys(changed).map((k) => [k, prefs[k as NotificationTopic]]));
    setPrefs((current) => ({ ...current, ...changed }));
    startTransition(async () => {
      const result = await updateNotificationPreferences(changed).catch(() => null);
      if (result?.ok) return setSavedAt(Date.now());
      setPrefs((current) => ({ ...current, ...before }));
      toast.error(t("notificationsSaveFailed"));
    });
  };

  const chooseCadence = (next: ReorderCadence) => {
    if (next === cadence || !signedIn) return;
    const before = cadence;
    setCadence(next);
    startTransition(async () => {
      const result = await updateReorderCadence(next).catch(() => null);
      if (result?.ok) return setSavedAt(Date.now());
      setCadence(before);
      toast.error(t("notificationsSaveFailed"));
    });
  };

  const sendTest = async (kind: TestNotificationKind) => {
    if (testing) return;
    setTesting(kind);
    const result = await sendTestNotification(kind).catch(() => null);
    setTesting(null);
    if (result?.ok) toast.success(t("testSent", { email: profile?.email ?? "" }));
    else toast.error(t(`test_${result && !result.ok && result.code !== "UNAUTHENTICATED" ? result.code : "FAILED"}`));
  };

  const allOn = NOTIFICATION_TOPICS.every((k) => prefs[k]);
  const essentialsOnly = NOTIFICATION_TOPICS.every((k) => prefs[k] === ESSENTIAL_TOPICS.includes(k));

  return (
    <section data-notification-prefs className={`flex flex-col ${CARD} ${className}`}>
      <SectionHeader
        icon={BellRing}
        title={t("emailHeading")}
        body={t("emailBody", { email: profile?.email ?? "—" })}
        action={
          <span aria-live="polite" className="flex h-8 flex-none items-center">
            {savedAt > 0 && (
              <span data-saved-badge className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11.5px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                <Check size={12} strokeWidth={2.6} />
                {t("saved")}
              </span>
            )}
          </span>
        }
      />

      {/* Bulk presets */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-2.5 dark:border-white/[0.08]">
        <SlidersHorizontal size={13} strokeWidth={2} className="text-slate-400 dark:text-zinc-500" />
        {(
          [
            { key: "all", label: t("enableAll"), active: allOn, next: Object.fromEntries(NOTIFICATION_TOPICS.map((k) => [k, true])) },
            { key: "essential", label: t("essentialsOnly"), active: essentialsOnly, next: Object.fromEntries(NOTIFICATION_TOPICS.map((k) => [k, ESSENTIAL_TOPICS.includes(k)])) },
          ] as const
        ).map((preset) => (
          <button
            key={preset.key}
            type="button"
            data-bulk={preset.key}
            aria-pressed={preset.active}
            disabled={!signedIn}
            onClick={() => apply(preset.next as Partial<NotificationPreferences>)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50 ${
              preset.active
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Rows share any spare height, so the card meets the right column without a void. */}
      <ul className="m-0 flex flex-1 list-none flex-col divide-y divide-slate-200 p-0 dark:divide-white/[0.06]">
        {NOTIFICATION_TOPICS.map((key) => {
          const { icon: Icon, tone } = TOPICS[key];
          const on = prefs[key];
          const testKind = TESTABLE[key];
          return (
            <li key={key} data-preference={key} data-on={on ? "1" : "0"} className="flex flex-1 items-start gap-3.5 px-6 py-3.5">
              <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg border transition-colors ${on ? TILE_ON[tone] : TILE_OFF}`}>
                <Icon size={15} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-slate-900 dark:text-white">{t(`topic_${key}_title`)}</div>
                <p className={`m-0 mt-0.5 text-[12.5px] leading-[1.5] ${MUTED}`}>{t(`topic_${key}_body`)}</p>

                {key === "restockReminders" && (
                  <div className={`mt-2.5 transition-opacity ${on ? "" : "pointer-events-none opacity-45"}`} data-cadence>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[11.5px] ${MUTED}`}>{t("cadenceLabel")}</span>
                      <div role="radiogroup" aria-label={t("cadenceLabel")} className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
                        {REORDER_CADENCES.map((days) => {
                          const active = cadence === days;
                          return (
                            <button
                              key={days ?? "auto"}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              disabled={!on || !signedIn}
                              data-cadence-option={days ?? "auto"}
                              onClick={() => chooseCadence(days)}
                              className={`rounded-md px-2.5 py-1 font-mono text-[11.5px] font-medium tabular-nums transition-colors ${
                                active
                                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-white/[0.12] dark:text-white dark:ring-white/10"
                                  : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                              }`}
                            >
                              {days === null ? t("cadenceAuto") : t("cadenceDays", { days })}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className={`m-0 mt-1.5 text-[11.5px] ${MUTED}`} data-cadence-note>
                      {cadence === null ? t("cadenceAutoNote") : t("cadenceFixedNote", { days: cadence })}
                    </p>
                  </div>
                )}

                {testKind && (
                  <button
                    type="button"
                    data-test-send={testKind}
                    disabled={!signedIn || testing !== null}
                    onClick={() => sendTest(testKind)}
                    className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-400"
                  >
                    {testing === testKind ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} strokeWidth={2} />}
                    {testing === testKind ? t("sendingTest") : t("sendTest")}
                  </button>
                )}
              </div>
              <div className="mt-0.5 flex-none">
                <ToggleSwitch checked={on} onChange={() => apply({ [key]: !on })} ariaLabel={t(`topic_${key}_title`)} activeClassName={TOGGLE_ON} />
              </div>
            </li>
          );
        })}
      </ul>

      <p className={`m-0 flex items-start gap-2 border-t border-slate-200 px-6 py-3 text-[11.5px] leading-[1.5] dark:border-white/[0.08] ${MUTED}`} data-transactional-note>
        <Lock size={12} strokeWidth={2.2} className="mt-[3px] flex-none" />
        {t("transactionalNote")}
      </p>
    </section>
  );
}

// ─── Profile & company ────────────────────────────────────────────────────

const VAT_PATTERN = /^[A-Z]{2}[A-Z0-9]{2,14}$/;
const normaliseVat = (v: string) => v.replace(/[\s.\-]/g, "").toUpperCase();

function ProfileCard({ profile, className = "" }: { profile: UserProfileData | null; className?: string }) {
  const t = useTranslations("AccountSettings");
  const router = useRouter();
  const { update } = useSession();
  const initial = {
    name: profile?.name ?? "",
    companyName: profile?.companyName ?? "",
    vatNumber: profile?.vatNumber ?? "",
    phone: profile?.phone ?? "",
  };
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const errors = {
    name: form.name.trim().length < 2 ? t("errName") : null,
    vatNumber: form.vatNumber && !VAT_PATTERN.test(normaliseVat(form.vatNumber)) ? t("errVat") : null,
    phone: form.phone && !/^[\d\s+()./-]*$/.test(form.phone) ? t("errPhone") : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const dirty = (Object.keys(form) as Array<keyof typeof form>).some((k) => form[k].trim() !== saved[k]);

  const save = async () => {
    setTouched(true);
    if (invalid || !dirty || busy || !profile) return;
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      companyName: form.companyName.trim(),
      vatNumber: form.vatNumber ? normaliseVat(form.vatNumber) : "",
      phone: form.phone.trim(),
    };
    const result = await updateProfile(payload).catch(() => null);
    setBusy(false);
    if (!result?.ok) {
      toast.error(t("profileSaveFailed"));
      return;
    }
    setSaved(payload);
    setForm(payload);
    setTouched(false);
    toast.success(t("profileSaved"));
    // The header shows the session's name — refresh it (update({}), never update()).
    void update({});
    router.refresh();
  };

  const field = (key: keyof typeof form, label: string, icon: typeof User, opts: { mono?: boolean; hint?: string; type?: string; autoComplete?: string; placeholder?: string } = {}) => {
    const Icon = icon;
    const error = touched || form[key] !== saved[key] ? errors[key as keyof typeof errors] : null;
    return (
      <label className="block" data-field={key}>
        <span className="mb-1.5 block text-[12px] font-medium text-slate-700 dark:text-zinc-300">{label}</span>
        <span className="relative block">
          <Icon size={14} strokeWidth={2} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: key === "vatNumber" ? e.target.value.toUpperCase() : e.target.value }))}
            disabled={!profile || busy}
            type={opts.type ?? "text"}
            autoComplete={opts.autoComplete}
            placeholder={opts.placeholder}
            aria-invalid={Boolean(error)}
            className={`${INPUT} pl-9 ${opts.mono ? "font-mono tracking-wide" : ""} ${error ? "border-red-400 dark:border-red-400/60" : ""}`}
          />
        </span>
        {error ? (
          <span className="mt-1 block text-[11.5px] text-red-600 dark:text-red-400" data-field-error>
            {error}
          </span>
        ) : (
          opts.hint && <span className={`mt-1 block text-[11.5px] ${MUTED}`}>{opts.hint}</span>
        )}
      </label>
    );
  };

  return (
    <section data-profile-form className={`flex flex-col ${CARD} ${className}`}>
      <SectionHeader icon={Building2} title={t("profileHeading")} body={t("profileBody")} />
      <form
        className="flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid flex-1 grid-cols-1 content-start gap-x-4 gap-y-3.5 px-6 py-5 sm:grid-cols-2">
          {field("name", t("fieldName"), User, { autoComplete: "name" })}
          {field("companyName", t("fieldCompany"), Landmark, { autoComplete: "organization" })}
          {/* Format examples, not data: the VAT layout is the EU one, the phone is international form. */}
          {field("vatNumber", t("fieldVat"), ReceiptText, { mono: true, placeholder: "NL863495921B01" })}
          {field("phone", t("fieldPhone"), Phone, { type: "tel", autoComplete: "tel", placeholder: "+49 40 …" })}
          <div className="sm:col-span-2" data-field="email">
            <span className="mb-1.5 flex items-center gap-2 text-[12px] font-medium text-slate-700 dark:text-zinc-300">
              {t("fieldEmail")}
              {profile?.emailVerified ? (
                <span data-email-verified className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                  <BadgeCheck size={11} strokeWidth={2.4} />
                  {t("emailVerified")}
                </span>
              ) : (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300">{t("emailUnverified")}</span>
              )}
            </span>
            <div className="flex h-10 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13.5px] text-slate-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-300">
              <Mail size={14} strokeWidth={2} className="flex-none text-slate-400 dark:text-zinc-500" />
              <span className="truncate">{profile?.email ?? "—"}</span>
            </div>
            <span className={`mt-1 block text-[11.5px] ${MUTED}`}>{t("emailNote")}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-3.5 dark:border-white/[0.08]">
          <Link
            href="/profile#addresses"
            data-manage-addresses
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white"
          >
            <MapPin size={13} strokeWidth={2} />
            {t("manageDelivery")}
            <ArrowRight size={13} strokeWidth={2} />
          </Link>
          <button type="submit" data-profile-save disabled={!profile || !dirty || busy} className={PRIMARY_BTN}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? t("saving") : t("save")}
          </button>
        </div>
      </form>
    </section>
  );
}

// ─── Interface & region ───────────────────────────────────────────────────

const THEMES: Array<{ value: ThemeChoice; icon: typeof Sun; labelKey: string }> = [
  { value: "light", icon: Sun, labelKey: "themeLight" },
  { value: "dark", icon: Moon, labelKey: "themeDark" },
  { value: "system", icon: Monitor, labelKey: "themeSystem" },
];

function InterfaceCard({ className = "" }: { className?: string }) {
  const t = useTranslations("AccountSettings");
  const { choice, setChoice, saving, synced } = useThemeChoice();
  const { activeLocale, switchLocale, isPending } = useSwitchLocale();

  return (
    <section data-interface className={`${CARD} ${className}`}>
      <SectionHeader icon={Laptop} title={t("interfaceHeading")} body={t("interfaceBody")} />
      <div className="flex flex-col gap-4 px-6 py-5">
        <div>
          <span className="mb-1.5 block text-[12px] font-medium text-slate-700 dark:text-zinc-300">{t("themeLabel")}</span>
          <div role="radiogroup" aria-label={t("themeLabel")} className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
            {THEMES.map(({ value, icon: Icon, labelKey }) => {
              const active = choice === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-theme-option={value}
                  data-active={active}
                  onClick={() => setChoice(value)}
                  className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium transition-colors ${
                    active
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-white/[0.12] dark:text-white dark:ring-white/10"
                      : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  <Icon size={13} strokeWidth={2} />
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
          <p data-theme-sync-note aria-live="polite" className={`m-0 mt-1.5 text-[11.5px] ${MUTED}`}>
            {saving ? t("themeSaving") : synced ? t("themeSynced") : t("themeDeviceOnly")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-700 dark:text-zinc-300">{t("languageLabel")}</span>
            <span className="relative block">
              <select
                data-language-select
                value={activeLocale}
                disabled={isPending}
                onChange={(e) => switchLocale(e.target.value)}
                className={`${INPUT} appearance-none pr-8`}
              >
                {LANGUAGE_OPTIONS.map(({ locale, name }) => (
                  <option key={locale} value={locale}>
                    {name} · {locale.toUpperCase()}
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                ▼
              </span>
            </span>
          </label>
          <div data-currency>
            <span className="mb-1.5 block text-[12px] font-medium text-slate-700 dark:text-zinc-300">{t("currencyLabel")}</span>
            <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-[13px] text-slate-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-300">
              {t("currencyEur")}
            </div>
          </div>
        </div>
        <p className={`m-0 -mt-1 text-[11.5px] leading-[1.5] ${MUTED}`} data-currency-note>
          {t("currencyNote")}
        </p>
      </div>
    </section>
  );
}

// ─── Security & access ────────────────────────────────────────────────────

function SecurityCard({ profile, className = "" }: { profile: UserProfileData | null; className?: string }) {
  const t = useTranslations("AccountSettings");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const on = Boolean(profile?.isTwoFactorEnabled);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const signOutOthers = async () => {
    setBusy(true);
    const result = await signOutOtherDevices().catch(() => null);
    setBusy(false);
    setConfirming(false);
    if (result?.ok) toast.success(t("signedOutOthers"));
    else toast.error(t("signOutFailed"));
  };

  return (
    <section data-security className={`${CARD} ${className}`}>
      <SectionHeader icon={ShieldCheck} title={t("securityHeading")} body={t("securityBody")} />
      <div className="px-6 pb-5">
        {/* Password: the OTP-verified inline flow shared with the dashboard. */}
        <div data-password-row className="[&>div]:pt-4">
          <ChangePasswordFlow email={profile?.email ?? ""} passwordChangedAt={profile?.passwordChangedAt ?? null} disabled={!profile} />
        </div>

        <div className="mt-4 grid grid-cols-1 border-t border-slate-200 lg:grid-cols-2 dark:border-white/[0.08]">
          <div className="flex items-start gap-3 py-4 lg:pr-6" data-twofa>
            <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg border ${on ? TILE_ON.emerald : TILE_OFF}`}>
              <KeyRound size={15} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-medium text-slate-900 dark:text-white">{t("twoFaTitle")}</span>
                <span
                  data-twofa-status={on ? "on" : "off"}
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                    on
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20"
                      : "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20"
                  }`}
                >
                  {on ? t("twoFaOn") : t("twoFaOff")}
                </span>
              </div>
              <p className={`m-0 mt-0.5 text-[12.5px] leading-[1.5] ${MUTED}`}>{on ? t("twoFaBodyOn") : t("twoFaBodyOff")}</p>
            </div>
            <Link href="/profile/security" data-twofa-manage className={SECONDARY_BTN}>
              {t("twoFaManage")}
              <ArrowRight size={13} strokeWidth={2} />
            </Link>
          </div>

          <div className="flex items-start gap-3 border-t border-slate-200 py-4 lg:border-l lg:border-t-0 lg:pl-6 dark:border-white/[0.08]" data-sessions>
            <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg border ${TILE_OFF}`}>
              <Laptop size={15} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[13.5px] font-medium text-slate-900 dark:text-white">{t("sessionsTitle")}</span>
              <p className={`m-0 mt-0.5 text-[12.5px] leading-[1.5] ${MUTED}`}>{t("sessionsBody")}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {confirming ? (
                  <>
                    <button
                      ref={confirmRef}
                      type="button"
                      data-sign-out-confirm
                      onClick={signOutOthers}
                      disabled={busy}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                    >
                      {busy && <Loader2 size={14} className="animate-spin" />}
                      {t("signOutConfirm")}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={SECONDARY_BTN}>
                      {t("cancel")}
                    </button>
                  </>
                ) : (
                  <button type="button" data-sign-out-others onClick={() => setConfirming(true)} disabled={!profile} className={SECONDARY_BTN}>
                    {t("signOutOthers")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AccountSettingsPage({ profile }: { profile: UserProfileData | null }) {
  const t = useTranslations("AccountSettings");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="flex-1 bg-slate-50 text-slate-900 dark:bg-[#0a0a0c] dark:text-slate-100">
      <Header onSignInClick={() => setIsAuthModalOpen(true)} />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10 lg:px-8" data-account-settings>
        <div className="mb-7">
          <div className="mb-2 text-[11.5px] font-medium tracking-[.09em] text-slate-500 dark:text-zinc-400">{t("eyebrow")}</div>
          <h1 className="m-0 text-[30px] font-semibold leading-[1.1] tracking-[-.035em] text-slate-900 dark:text-white">{t("pageTitle")}</h1>
          <p className={`mb-0 mt-2 max-w-[620px] text-[14px] leading-[1.6] ${MUTED}`}>{t("pageSubtitle")}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch">
          <NotificationsCard profile={profile} className="lg:col-span-7" />
          <div className="flex flex-col gap-5 lg:col-span-5">
            <ProfileCard profile={profile} className="flex-1" />
            <InterfaceCard />
          </div>
          <SecurityCard profile={profile} className="lg:col-span-12" />
        </div>
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
