"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { ArrowRight, BellRing, Building2, CalendarClock, Mail, MapPin, PackageCheck, Scale, TrendingDown, User } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import ToggleSwitch from "./ToggleSwitch";
import ThemePreferenceCard from "./ThemePreferenceCard";
import type { UserProfileData } from "@/lib/data";
import { updateNotificationPreferences } from "@/lib/actions/notifications";
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationTopic } from "@/lib/notifications";

/**
 * Desktop /profile/settings.
 *
 * The route existed but rendered only the mobile layout, so anything above
 * the `md` breakpoint — including the dashboard's "Manage price alerts"
 * button — landed on a blank page.
 *
 * Theme-following throughout: no `.dark` wrapper, every surface pairs a
 * light treatment with a `dark:` counterpart.
 */

/** Cyan→emerald: the active state for every preference toggle. */
const TOGGLE_ACTIVE = "bg-[linear-gradient(135deg,#0891b2,#059669)]";

const CARD =
  "rounded-[26px] border border-slate-200 bg-white/80 shadow-sm backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-[#141518]/80 dark:shadow-none";

const PREFERENCES: Array<{ key: NotificationTopic; icon: typeof TrendingDown; titleKey: string; bodyKey: string }> = [
  { key: "priceDrops", icon: TrendingDown, titleKey: "priceDropTitle", bodyKey: "priceDropBody" },
  { key: "backInStock", icon: PackageCheck, titleKey: "restockTitle", bodyKey: "restockBody" },
  { key: "restockReminders", icon: CalendarClock, titleKey: "replenishTitle", bodyKey: "replenishBody" },
  { key: "regulatory", icon: Scale, titleKey: "regulatoryTitle", bodyKey: "regulatoryBody" },
];

interface AccountSettingsPageProps {
  profile: UserProfileData | null;
}

export default function AccountSettingsPage({ profile }: AccountSettingsPageProps) {
  const t = useTranslations("AccountSettings");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  // Seeded from the row; each flip shows at once and saves in the
  // background. Only the flipped topic is sent, so two quick flips can't
  // overwrite each other. A failed save puts that one toggle back.
  const [preferences, setPreferences] = useState(profile?.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES);
  const [, startTransition] = useTransition();

  const toggle = (key: NotificationTopic) => {
    const next = !preferences[key];
    setPreferences((current) => ({ ...current, [key]: next }));
    startTransition(async () => {
      const result = await updateNotificationPreferences({ [key]: next }).catch(() => null);
      if (result?.ok) return;
      setPreferences((current) => (current[key] === next ? { ...current, [key]: !next } : current));
      toast.error(t("notificationsSaveFailed"));
    });
  };

  const fields: Array<{ icon: typeof User; labelKey: string; value: string | null }> = [
    { icon: User, labelKey: "fieldName", value: profile?.name ?? null },
    { icon: Mail, labelKey: "fieldEmail", value: profile?.email ?? null },
    { icon: Building2, labelKey: "fieldCompany", value: profile?.companyName ?? null },
  ];

  return (
    <div className="flex-1 bg-slate-50 text-slate-900 dark:bg-[#0a0a0c] dark:text-slate-100">
      <Header onSignInClick={() => setIsAuthModalOpen(true)} />

      <div className="relative overflow-x-clip">
        {/* Ambient orbs, dimmer on light so the page stays clean */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[220px] right-[-8%] h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_66%)] opacity-[.12] blur-[120px] [animation:hc-breathe_9s_ease-in-out_infinite] dark:opacity-[.22]" />
          <div className="absolute left-[-10%] top-[200px] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,var(--orb-blue),rgba(37,99,235,0)_66%)] opacity-[.1] blur-[120px] [animation:hc-float_30s_ease-in-out_infinite] dark:opacity-20" />
        </div>

        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto max-w-[1240px] px-8 pb-[120px] pt-11"
          data-account-settings
        >
          <div className="mb-9">
            <div className="mb-3 text-xs tracking-[.09em] text-slate-500 dark:text-slate-400">{t("eyebrow")}</div>
            <h1 className="m-0 text-[38px] font-semibold leading-[1.05] tracking-[-.045em] text-slate-900 dark:text-white">
              {t("title")}
            </h1>
            <p className="mt-3 max-w-[560px] text-[14.5px] leading-[1.6] text-slate-600 dark:text-slate-400">
              {t("subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            {/* ── Notification preferences ── */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
              data-notification-prefs
              className={`p-[26px] lg:col-span-7 ${CARD}`}
            >
              <div className="mb-5 flex items-start gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[14px] bg-[linear-gradient(140deg,#0891b2,#059669)] text-white shadow-[0_12px_26px_-14px_rgba(8,145,178,.9)]">
                  <BellRing size={18} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h2 className="m-0 text-[17px] font-semibold tracking-[-.025em] text-slate-900 dark:text-white">
                    {t("notificationsHeading")}
                  </h2>
                  <p className="mb-0 mt-1 text-[12.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
                    {t("notificationsBody")}
                  </p>
                </div>
              </div>

              <div className="flex flex-col">
                {PREFERENCES.map(({ key, icon: Icon, titleKey, bodyKey }, index) => (
                  <div
                    key={key}
                    data-preference={key}
                    className={`flex items-start gap-3.5 py-4 ${
                      index > 0 ? "border-t border-slate-200 dark:border-white/10" : ""
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 flex-none items-center justify-center rounded-[12px] border transition-colors duration-200 ${
                        preferences[key]
                          ? "border-cyan-600/25 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-300"
                          : "border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[.04] dark:text-slate-500"
                      }`}
                    >
                      <Icon size={16} strokeWidth={2} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">
                        {t(titleKey)}
                      </div>
                      <p className="mb-0 mt-1 text-[12.5px] leading-[1.55] text-slate-500 dark:text-slate-400">
                        {t(bodyKey)}
                      </p>
                    </div>

                    <ToggleSwitch
                      checked={preferences[key]}
                      onChange={() => toggle(key)}
                      ariaLabel={t(titleKey)}
                      activeClassName={TOGGLE_ACTIVE}
                    />
                  </div>
                ))}
              </div>
            </motion.section>

            <div className="flex flex-col gap-5 lg:col-span-5">
              {/* ── Personal information ── */}
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
                data-personal-info
                className={`p-[26px] ${CARD}`}
              >
                <div className="mb-5">
                  <h2 className="m-0 text-[17px] font-semibold tracking-[-.025em] text-slate-900 dark:text-white">
                    {t("personalHeading")}
                  </h2>
                  <p className="mb-0 mt-1 text-[12.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
                    {t("personalBody")}
                  </p>
                </div>
  
                <div className="flex flex-col gap-3.5">
                  {fields.map(({ icon: Icon, labelKey, value }) => (
                    <label key={labelKey} className="block" data-info-field={labelKey}>
                      <span className="mb-1.5 block text-[11px] tracking-[.06em] text-slate-500 dark:text-slate-400">
                        {t(labelKey).toUpperCase()}
                      </span>
                      <span className="relative block">
                        <Icon
                          size={15}
                          strokeWidth={2}
                          aria-hidden
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                        />
                        <input
                          readOnly
                          value={value ?? t("notSet")}
                          aria-label={t(labelKey)}
                          className="h-[46px] w-full cursor-default rounded-[14px] border border-slate-200 bg-slate-50 pl-10 pr-3.5 text-[13.5px] text-slate-700 focus:outline-none dark:border-white/10 dark:bg-white/[.03] dark:text-slate-300"
                        />
                      </span>
                    </label>
                  ))}
                </div>
  
                {/* Desktop address management lives in the dashboard's
                    addresses section; /profile/addresses is mobile-only. */}
                <Link
                  href="/profile#addresses"
                  data-manage-addresses
                  className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-white text-[13.5px] font-semibold tracking-[-.015em] text-slate-700 shadow-sm transition-colors hover:border-cyan-500/40 hover:text-cyan-700 dark:border-white/10 dark:bg-white/[.04] dark:text-slate-200 dark:shadow-none dark:hover:border-cyan-400/35 dark:hover:text-cyan-300"
                >
                  <MapPin size={15} strokeWidth={2} />
                  {t("manageAddresses")}
                  <ArrowRight size={15} strokeWidth={2} />
                </Link>
              </motion.section>

              {/* ── Appearance ── saved to the account, unlike the alerts card */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
              >
                <ThemePreferenceCard className={CARD} />
              </motion.div>
            </div>
          </div>
        </motion.main>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
