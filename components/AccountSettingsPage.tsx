"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  FileBadge2,
  KeyRound,
  Landmark,
  Loader2,
  Lock,
  MapPin,
  Monitor,
  Moon,
  PackageCheck,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Sun,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import ToggleSwitch from "./ToggleSwitch";
import ChangePasswordFlow from "./ChangePasswordFlow";
import { updateNotificationPreferences, updateReorderCadence } from "@/lib/actions/notifications";
import { sendTestNotification, type TestNotificationKind } from "@/lib/actions/notificationTest";
import { updateProfile } from "@/lib/actions/profile";
import type { AccountSettingsData } from "@/lib/accountSettings";
import type { SecurityState } from "@/lib/actions/security";
import DeviceSessions from "./security/DeviceSessions";
import TwoFactorManager from "./security/TwoFactorManager";
import AddressesManager from "./security/AddressesManager";
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
 * Desktop settings — /profile/settings and /notifications.
 *
 * Built on the cart's grammar (components/CartPage) so the two read as one
 * product: a header bar with the page's facts on the left and pill tools on
 * the right; an 8-column list surface (email topics, then security) with a
 * slim footer; a 4-column sticky card holding the profile, the interface
 * preferences and the save action.
 *
 * Every control writes to the account: the six email topics and the restock
 * cadence (lib/actions/notifications), profile and VAT details
 * (lib/actions/profile), theme and language (mirrored to the User row), and
 * "sign out of all other devices" (lib/actions/sessions). The currency is a
 * statement, not a setting — prices, quotes and invoices are in euros and no
 * exchange-rate feed is connected.
 */

const EASE = [0.16, 1, 0.3, 1] as const;
const MUTED = "text-slate-500 dark:text-ink-muted";
/** Same pill as the cart header's "Ask AI to optimise". */
const PILL =
  "inline-flex min-h-[38px] items-center gap-2 whitespace-nowrap rounded-full border border-slate-900/[.12] bg-white/70 px-3.5 text-[13px] font-semibold tracking-[-.01em] text-slate-800 transition-colors hover:bg-slate-900/[.04] disabled:opacity-60 dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 dark:hover:bg-white/[.09]";
const PILL_ACTIVE = "border-blue-600/40 bg-blue-600/[.08] text-blue-700 dark:border-blue-400/40 dark:bg-blue-400/[.12] dark:text-blue-300";
const ROW_BTN =
  "inline-flex h-9 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-slate-900/[.12] bg-white/70 px-3.5 text-[13px] font-semibold tracking-[-.01em] text-slate-800 transition-colors hover:bg-slate-900/[.04] disabled:opacity-50 dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 dark:hover:bg-white/[.09]";
/** The cart's chip. */
const CHIP = "inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10.5px] font-semibold whitespace-nowrap";
const CHIP_MUTED = "border-slate-900/[.07] bg-slate-100 text-slate-600 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted";
const CHIP_OK = "border-[rgba(16,185,129,.26)] bg-[rgba(16,185,129,.13)] text-[#047857] dark:text-[#34d399]";
const CHIP_WARN = "border-[rgba(245,158,11,.3)] bg-[rgba(245,158,11,.14)] text-[#b45309] dark:text-[#fbbf24]";
const CHIP_BLUE = "border-blue-600/25 bg-blue-600/[.08] text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/[.12] dark:text-blue-300";
const INPUT =
  "h-10 w-full rounded-[12px] border border-slate-900/[.1] bg-white px-3 text-[13px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-600/50 focus:ring-2 focus:ring-blue-600/10 disabled:opacity-60 dark:border-white/[.1] dark:bg-white/[.03] dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-blue-400/50 dark:focus:ring-blue-400/10";

const TOPICS: Record<NotificationTopic, { icon: typeof Lock; tone: "blue" | "emerald"; badge?: string }> = {
  abandonedCart: { icon: ShoppingCart, tone: "blue", badge: "badgeCartDelay" },
  restockReminders: { icon: CalendarClock, tone: "blue" },
  priceDrops: { icon: TrendingDown, tone: "blue", badge: "badgeFavourites" },
  backInStock: { icon: PackageCheck, tone: "blue", badge: "badgeInstant" },
  fgasExpiry: { icon: FileBadge2, tone: "emerald", badge: "badgeFgasLead" },
  regulatory: { icon: Scale, tone: "emerald", badge: "badgeEuReg" },
};
const TILE = "flex h-10 w-10 flex-none items-center justify-center rounded-xl border transition-colors";
const TILE_ON = {
  blue: "border-blue-600/20 bg-blue-600/[.07] text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/[.1] dark:text-blue-300",
  emerald: "border-emerald-600/20 bg-emerald-600/[.07] text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/[.1] dark:text-emerald-300",
};
const TILE_OFF = "border-slate-900/[.08] bg-slate-50 text-slate-400 dark:border-white/[.08] dark:bg-white/[.03] dark:text-slate-500";
const ROW = "flex items-center gap-4 px-5 py-2 transition-colors hover:bg-slate-900/[.015] dark:hover:bg-white/[.02]";
const SECTION_BAR =
  "flex items-center justify-between gap-3 bg-slate-900/[.015] px-5 py-1.5 text-[11px] font-semibold tracking-[.08em] text-slate-500 uppercase dark:bg-white/[.02] dark:text-ink-muted";

/** Which rows offer "send a test", and the action kind behind it. */
const TESTABLE: Partial<Record<NotificationTopic, TestNotificationKind>> = { abandonedCart: "abandonedCart", restockReminders: "restockReminders" };

const VAT_PATTERN = /^[A-Z]{2}[A-Z0-9]{2,14}$/;
const normaliseVat = (v: string) => v.replace(/[\s.\-]/g, "").toUpperCase();

const THEMES: Array<{ value: ThemeChoice; icon: typeof Sun; labelKey: string }> = [
  { value: "light", icon: Sun, labelKey: "themeLight" },
  { value: "dark", icon: Moon, labelKey: "themeDark" },
  { value: "system", icon: Monitor, labelKey: "themeAuto" },
];

export default function AccountSettingsPage({ profile, security: initialSecurity, addresses, now, focus }: AccountSettingsData & { focus?: "security" }) {
  const t = useTranslations("AccountSettings");
  const router = useRouter();
  const { update } = useSession();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const signedIn = Boolean(profile);

  // ── Notifications ──
  const [prefs, setPrefs] = useState<NotificationPreferences>(profile?.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES);
  const [cadence, setCadence] = useState<ReorderCadence>(profile?.reorderReminderDays ?? null);
  const [savedAt, setSavedAt] = useState(0);
  const [testing, setTesting] = useState<TestNotificationKind | null>(null);
  const [, startTransition] = useTransition();

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

  const activeCount = NOTIFICATION_TOPICS.filter((k) => prefs[k]).length;
  const allOn = activeCount === NOTIFICATION_TOPICS.length;
  const essentialsOnly = NOTIFICATION_TOPICS.every((k) => prefs[k] === ESSENTIAL_TOPICS.includes(k));
  const presets = [
    { key: "all", label: t("enableAll"), active: allOn, next: Object.fromEntries(NOTIFICATION_TOPICS.map((k) => [k, true])) },
    { key: "essential", label: t("essentialsOnly"), active: essentialsOnly, next: Object.fromEntries(NOTIFICATION_TOPICS.map((k) => [k, ESSENTIAL_TOPICS.includes(k)])) },
  ] as const;

  // ── Profile ──
  const initial = { name: profile?.name ?? "", companyName: profile?.companyName ?? "", vatNumber: profile?.vatNumber ?? "", phone: profile?.phone ?? "" };
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const errors = {
    name: form.name.trim().length < 2 ? t("errName") : null,
    vatNumber: form.vatNumber && !VAT_PATTERN.test(normaliseVat(form.vatNumber)) ? t("errVat") : null,
    phone: form.phone && !/^[\d\s+()./-]*$/.test(form.phone) ? t("errPhone") : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const dirty = (Object.keys(form) as Array<keyof typeof form>).some((k) => form[k].trim() !== saved[k]);

  const saveProfile = async () => {
    setTouched(true);
    if (invalid || !dirty || saving || !profile) return;
    setSaving(true);
    const payload = { name: form.name.trim(), companyName: form.companyName.trim(), vatNumber: form.vatNumber ? normaliseVat(form.vatNumber) : "", phone: form.phone.trim() };
    const result = await updateProfile(payload).catch(() => null);
    setSaving(false);
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

  // ── Interface ──
  const { choice, setChoice } = useThemeChoice();
  const { activeLocale, switchLocale, isPending } = useSwitchLocale();

  // ── Security: real sessions, 2FA, recovery phrase ──
  const [security, setSecurity] = useState<SecurityState | null>(initialSecurity);
  const [managing2fa, setManaging2fa] = useState(false);
  const [managingAddresses, setManagingAddresses] = useState(false);
  const twoFa = security ? security.twoFactor : Boolean(profile?.isTwoFactorEnabled);
  const phraseSet = Boolean(security?.phrase.set);
  const securityRef = useRef<HTMLDivElement>(null);
  // Arriving from "Manage 2FA" elsewhere (/profile/security → #security):
  // bring the section into view and mark it for a moment.
  useEffect(() => {
    if ((window.location.hash !== "#security" && focus !== "security") || !securityRef.current) return;
    securityRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    securityRef.current.dataset.highlight = "1";
    const id = setTimeout(() => securityRef.current && delete securityRef.current.dataset.highlight, 2200);
    return () => clearTimeout(id);
  }, [focus]);

  const metaLine = [
    profile?.email,
    t("metaActive", { active: activeCount, total: NOTIFICATION_TOPICS.length }),
    twoFa ? t("meta2faOn") : t("meta2faOff"),
    "EUR (€)",
  ]
    .filter(Boolean)
    .join(" · ");

  const field = (key: keyof typeof form, label: string, opts: { mono?: boolean; type?: string; autoComplete?: string; placeholder?: string } = {}) => {
    const error = touched || form[key] !== saved[key] ? errors[key as keyof typeof errors] : null;
    return (
      <label className="block min-w-0" data-field={key}>
        <span className={`mb-1 block text-[11.5px] font-medium ${MUTED}`}>{label}</span>
        <input
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: key === "vatNumber" ? e.target.value.toUpperCase() : e.target.value }))}
          disabled={!profile || saving}
          type={opts.type ?? "text"}
          autoComplete={opts.autoComplete}
          placeholder={opts.placeholder}
          aria-invalid={Boolean(error)}
          className={`${INPUT} ${opts.mono ? "font-mono tracking-wide" : ""} ${error ? "border-red-400 dark:border-red-400/60" : ""}`}
        />
        {error && (
          <span className="mt-1 block text-[11px] leading-[1.4] text-red-600 dark:text-red-400" data-field-error>
            {error}
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="flex-1 bg-canvas text-slate-900 dark:text-slate-100">
      <Header onSignInClick={() => setIsAuthModalOpen(true)} />

      <div className="relative overflow-x-clip">
        {/* The cart's ambient field */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[220px] right-[-8%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_66%)] opacity-[.2] blur-[120px]" />
          <div className="absolute left-[-10%] top-[180px] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,var(--orb-violet),rgba(124,58,237,0)_66%)] opacity-[.16] blur-[120px]" />
        </div>

        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
          className="relative mx-auto max-w-7xl px-8 pb-24 pt-9"
          data-account-settings
        >
          {/* ── Header bar: the account's facts · the tools that act on it ── */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <h1 className="m-0 text-[34px] font-semibold leading-[1.1] tracking-[-.04em]">{t("pageTitle")}</h1>
              <p className={`m-0 mt-2 text-[14px] tabular-nums ${MUTED}`} data-settings-meta>
                {metaLine}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2" data-settings-toolbar>
              <span aria-live="polite" className="flex items-center">
                {savedAt > 0 && (
                  <span data-saved-badge className={`${CHIP} ${CHIP_OK} px-2.5 py-1 text-[11.5px]`}>
                    <Check size={12} strokeWidth={2.6} />
                    {t("saved")}
                  </span>
                )}
              </span>
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  data-bulk={preset.key}
                  aria-pressed={preset.active}
                  disabled={!signedIn}
                  onClick={() => apply(preset.next as Partial<NotificationPreferences>)}
                  className={`${PILL} ${preset.active ? PILL_ACTIVE : ""}`}
                >
                  {preset.active && <Check size={14} strokeWidth={2.4} />}
                  {preset.label}
                </button>
              ))}
              <Link
                href="/profile"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-900/[.04] hover:text-slate-900 dark:text-ink-muted dark:hover:bg-white/[.06] dark:hover:text-slate-100"
              >
                <ArrowLeft size={14} strokeWidth={2} />
                {t("backToProfile")}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* ─── left: ONE list surface — email topics, then security ─── */}
            <div className="min-w-0 lg:col-span-8">
              <div
                className="overflow-hidden rounded-[22px] border border-slate-900/[.08] bg-white/75 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-white/[.03]"
                data-settings-list
              >
                <div className="divide-y divide-slate-900/[.06] dark:divide-white/[.06]" data-notification-prefs>
                  <div className={SECTION_BAR}>
                    <h2 className="m-0 text-[11px] font-semibold tracking-[.08em]">{t("emailHeading")}</h2>
                    <span className="truncate normal-case tracking-normal font-normal">{profile?.email}</span>
                  </div>
                  {NOTIFICATION_TOPICS.map((key) => {
                    const { icon: Icon, tone, badge } = TOPICS[key];
                    const on = prefs[key];
                    const testKind = TESTABLE[key];
                    return (
                      <div key={key} data-preference={key} data-on={on ? "1" : "0"} className={ROW}>
                        <span className={`${TILE} ${on ? TILE_ON[tone] : TILE_OFF}`}>
                          <Icon size={17} strokeWidth={2} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[14px] font-semibold tracking-[-.02em]">{t(`topic_${key}_title`)}</span>
                            {badge && <span className={`${CHIP} ${CHIP_MUTED}`}>{t(badge)}</span>}
                            {key === "restockReminders" && (
                              <span role="radiogroup" aria-label={t("cadenceLabel")} className={`inline-flex items-center gap-1 ${on ? "" : "pointer-events-none opacity-45"}`} data-cadence>
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
                                      className={`${CHIP} tabular-nums transition-colors ${active ? CHIP_BLUE : `${CHIP_MUTED} hover:text-slate-900 dark:hover:text-slate-100`}`}
                                    >
                                      {days === null ? t("cadenceAuto") : t("cadenceDays", { days })}
                                    </button>
                                  );
                                })}
                              </span>
                            )}
                            {testKind && (
                              <button
                                type="button"
                                data-test-send={testKind}
                                disabled={!signedIn || testing !== null}
                                onClick={() => sendTest(testKind)}
                                className={`${CHIP} ${CHIP_BLUE} transition-opacity hover:opacity-80 disabled:opacity-50`}
                              >
                                {testing === testKind ? <Loader2 size={10} className="animate-spin" /> : null}
                                {testing === testKind ? t("sendingTest") : t("sendTestShort")}
                                {testing !== testKind && <ArrowUpRight size={10} strokeWidth={2.6} />}
                              </button>
                            )}
                          </div>
                          <p className={`m-0 mt-0.5 text-[12px] leading-[1.45] ${MUTED}`} {...(key === "restockReminders" ? { "data-cadence-note": "" } : {})}>
                            {key === "restockReminders"
                              ? cadence === null
                                ? t("cadenceAutoNote")
                                : t("cadenceFixedNote", { days: cadence })
                              : t(`topic_${key}_short`)}
                          </p>
                        </div>
                        <ToggleSwitch checked={on} onChange={() => apply({ [key]: !on })} ariaLabel={t(`topic_${key}_title`)} activeClassName="bg-blue-600 dark:bg-blue-500" />
                      </div>
                    );
                  })}
                </div>

                {/* Security & access — same surface, under its own bar */}
                <div
                  ref={securityRef}
                  id="security"
                  className="scroll-mt-24 divide-y divide-slate-900/[.06] border-t border-slate-900/[.06] transition-colors duration-700 data-[highlight]:bg-blue-600/[.05] dark:divide-white/[.06] dark:border-white/[.06]"
                  data-security
                >
                  <div className={SECTION_BAR}>
                    <h2 className="m-0 text-[11px] font-semibold tracking-[.08em]">{t("securityHeading")}</h2>
                  </div>

                  <div className="flex items-start gap-4 px-5 py-2" data-password-row>
                    <span className={`${TILE} ${TILE_OFF}`}>
                      <Lock size={17} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1 pt-px">
                      <ChangePasswordFlow email={profile?.email ?? ""} passwordChangedAt={profile?.passwordChangedAt ?? null} disabled={!profile} compact />
                    </div>
                  </div>

                  <div className={ROW} data-twofa>
                    <span className={`${TILE} ${twoFa ? TILE_ON.emerald : TILE_OFF}`}>
                      <KeyRound size={17} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13.5px] font-semibold tracking-[-.015em]">{t("twoFaTitleShort")}</span>
                        <span data-twofa-status={twoFa ? "on" : "off"} className={`${CHIP} ${twoFa ? CHIP_OK : CHIP_WARN}`}>
                          {twoFa ? t("twoFaOn") : t("twoFaOff")}
                        </span>
                        <span data-phrase-status={phraseSet ? "set" : "none"} className={`${CHIP} ${phraseSet ? CHIP_OK : CHIP_WARN}`}>
                          {phraseSet ? t("phraseActiveBadge") : t("phraseAddBadge")}
                        </span>
                      </div>
                      <p className={`m-0 mt-0.5 text-[12px] leading-[1.45] ${MUTED}`}>{t("twoFaSub")}</p>
                    </div>
                    <button type="button" onClick={() => setManaging2fa(true)} disabled={!security} data-twofa-manage className={ROW_BTN}>
                      {t("twoFaManage")}
                      <ArrowRight size={13} strokeWidth={2} />
                    </button>
                  </div>

                  {security && <DeviceSessions sessions={security.sessions} now={now} onChange={setSecurity} />}
                </div>

                {/* footer: back to the dashboard · what is always sent */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/[.06] bg-slate-900/[.015] px-5 py-3 dark:border-white/[.06] dark:bg-white/[.02]" data-settings-footer>
                  <Link href="/profile" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 dark:text-ink-muted dark:hover:text-slate-100">
                    <ArrowLeft size={14} strokeWidth={2} />
                    {t("backToDashboard")}
                  </Link>
                  <span className={`inline-flex items-center gap-1.5 text-[12px] ${MUTED}`} data-transactional-note title={t("transactionalNote")}>
                    <Lock size={12} strokeWidth={2.2} />
                    {t("transactionalShort")}
                  </span>
                </div>
              </div>
            </div>

            {/* ─── right: ONE card — profile, interface, save ─── */}
            <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4" data-profile-form>
              <form
                className="rounded-[22px] border border-slate-900/[.1] bg-white/80 p-5 shadow-[0_24px_60px_-44px_rgba(2,4,10,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.1] dark:bg-white/[.04]"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveProfile();
                }}
              >
                <h2 className="m-0 mb-4 text-[12px] font-semibold tracking-[.08em] text-slate-500 uppercase dark:text-ink-muted">{t("profileEyebrow")}</h2>

                {/* 1 · details */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  {field("name", t("fieldName"), { autoComplete: "name" })}
                  {field("companyName", t("fieldCompany"), { autoComplete: "organization" })}
                  {/* Format examples, not data: the EU VAT layout and an international phone form. */}
                  {field("vatNumber", t("fieldVatShort"), { mono: true, placeholder: "NL863495921B01" })}
                  {field("phone", t("fieldPhone"), { type: "tel", autoComplete: "tel", placeholder: "+49 40 …" })}
                </div>

                {/* 2 · interface & region, as summary lines */}
                <dl className="m-0 mt-4 flex flex-col gap-2.5 border-t border-slate-900/[.08] pt-4 text-[13px] dark:border-white/[.08]" data-interface>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-600 dark:text-ink-muted">{t("themeRow")}</dt>
                    <dd className="m-0">
                      <div role="radiogroup" aria-label={t("themeRow")} className="inline-flex rounded-full border border-slate-900/[.1] bg-slate-50 p-0.5 dark:border-white/[.12] dark:bg-white/[.05]">
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
                              className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold transition-colors ${
                                active ? "bg-white text-slate-900 shadow-sm dark:bg-white/[.14] dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-ink-muted dark:hover:text-slate-100"
                              }`}
                            >
                              <Icon size={12} strokeWidth={2.2} />
                              {t(labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-600 dark:text-ink-muted">{t("languageRow")}</dt>
                    <dd className="relative m-0">
                      <select
                        data-language-select
                        aria-label={t("languageRow")}
                        value={activeLocale}
                        disabled={isPending}
                        onChange={(e) => switchLocale(e.target.value)}
                        className="h-8 appearance-none rounded-full border border-slate-900/[.1] bg-slate-50 pl-3 pr-7 text-[12.5px] font-semibold text-slate-800 outline-none focus:border-blue-600/50 dark:border-white/[.12] dark:bg-white/[.05] dark:text-slate-100"
                      >
                        {LANGUAGE_OPTIONS.map(({ locale, name }) => (
                          <option key={locale} value={locale}>
                            {name} · {locale.toUpperCase()}
                          </option>
                        ))}
                      </select>
                      <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400">
                        ▼
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3" data-currency>
                    <dt className="text-slate-600 dark:text-ink-muted">{t("currencyRow")}</dt>
                    <dd className="m-0" title={t("currencyNote")}>
                      <span className={`${CHIP} ${CHIP_MUTED} px-2.5 py-0.5 font-mono text-[11.5px]`}>EUR (€)</span>
                    </dd>
                  </div>
                </dl>

                {/* 3 · the address everything goes to — the cart's emerald line */}
                {profile?.emailVerified ? (
                  <div
                    data-email-verified
                    className="mt-4 flex w-full items-start gap-2 rounded-[16px] border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11.5px] font-semibold leading-[1.45] text-emerald-700 dark:text-emerald-300"
                  >
                    <ShieldCheck size={13} strokeWidth={2.2} className="mt-[2px] flex-none" />
                    <span className="min-w-0 flex-1 break-words">{t("emailVerifiedBanner", { email: profile.email ?? "" })}</span>
                  </div>
                ) : (
                  <div className="mt-4 flex w-full items-start gap-2 rounded-[16px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] font-semibold leading-[1.45] text-amber-800 dark:text-amber-300">
                    <TriangleAlert size={13} strokeWidth={2.2} className="mt-[2px] flex-none" />
                    <span className="min-w-0 flex-1 break-words">{t("emailUnverifiedBanner", { email: profile?.email ?? "—" })}</span>
                  </div>
                )}

                {/* 4 · actions */}
                <button
                  type="submit"
                  data-profile-save
                  disabled={!profile || !dirty || saving}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[14.5px] font-medium tracking-[-.01em] text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
                >
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  {saving ? t("saving") : t("save")}
                  {!saving && <ArrowRight size={16} strokeWidth={2} />}
                </button>
                <button
                  type="button"
                  onClick={() => setManagingAddresses(true)}
                  disabled={!profile}
                  data-manage-addresses
                  className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-900/[.12] text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-900/[.04] disabled:opacity-50 dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]"
                >
                  <MapPin size={14} strokeWidth={2} />
                  {t("manageDelivery")}
                  {addresses.length > 0 && <span className="font-mono text-[11.5px] font-medium text-slate-400">· {addresses.length}</span>}
                </button>

                {/* 5 · trust, one row inside the card */}
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-900/[.07] pt-3.5 dark:border-white/[.07]" data-settings-trust>
                  {(
                    [
                      { icon: Lock, label: t("trust2fa") },
                      { icon: Landmark, label: t("trustVat") },
                      { icon: ShieldCheck, label: t("trustReg") },
                    ] as const
                  ).map(({ icon: Icon, label }) => (
                    <span key={label} className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium leading-tight text-slate-500 dark:text-ink-muted">
                      <Icon size={12} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                      {label}
                    </span>
                  ))}
                </div>
              </form>
            </aside>
          </div>
        </motion.main>
      </div>

      {managing2fa && security && (
        <TwoFactorManager state={security} email={profile?.email ?? ""} onClose={() => setManaging2fa(false)} onChange={setSecurity} />
      )}
      {managingAddresses && <AddressesManager addresses={addresses} onClose={() => setManagingAddresses(false)} />}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
