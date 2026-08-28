"use client";

import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Bell,
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Euro,
  Globe,
  Loader2,
  LogOut,
  MapPin,
  Moon,
  Package,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import { LANGUAGE_OPTIONS } from "@/lib/languageNames";
import type { ProfileDashboardData, UserAddress, UserOrder, UserProfileData } from "@/lib/data";
import type { OrderStatus } from "@/lib/generated/prisma/enums";

const THEME_KEY = "halocore-theme";
const subscribeTheme = (cb: () => void) => {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};
const themeSnapshot = () => document.documentElement.classList.contains("dark");

const TONES: Record<OrderStatus, { fg: string; dark: string; dot: string; bg: string; bd: string; live: boolean }> = {
  IN_TRANSIT: { fg: "#0369a1", dark: "#38bdf8", dot: "#22d3ee", bg: "rgba(56,189,248,.14)", bd: "rgba(56,189,248,.3)", live: true },
  DELIVERED: { fg: "#047857", dark: "#34d399", dot: "#34d399", bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.26)", live: false },
  PENDING: { fg: "#b45309", dark: "#fbbf24", dot: "#fbbf24", bg: "rgba(245,158,11,.14)", bd: "rgba(245,158,11,.3)", live: true },
};

const TABS = [
  { id: "orders", labelKey: "tabOrders", icon: Package },
  { id: "certs", labelKey: "tabCompliance", icon: ShieldCheck },
  { id: "company", labelKey: "tabCompany", icon: Briefcase },
  { id: "settings", labelKey: "tabSettings", icon: SlidersHorizontal },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface MobileProfileLayoutProps {
  dashboardData: ProfileDashboardData | null;
  profile?: UserProfileData | null;
  orders?: UserOrder[] | null;
  addresses?: UserAddress[] | null;
}

export default function MobileProfileLayout({ dashboardData, profile, orders, addresses }: MobileProfileLayoutProps) {
  const t = useTranslations("ProfileMobile");
  const tProfile = useTranslations("Profile");
  const tAccount = useTranslations("AccountProfile");
  const tPd = useTranslations("ProfileDashboard");
  const tHm = useTranslations("HomeMobile");
  const format = useFormatter();
  const locale = useLocale();
  const { data: session } = useSession();
  const addItem = useCartStore((s) => s.addItem);

  const [tab, setTab] = useState<TabId>("orders");
  const [openOrder, setOpenOrder] = useState<string | null>(orders?.[0]?.id ?? null);
  const [reordered, setReordered] = useState<string[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);

  const isDark = useSyncExternalStore(subscribeTheme, themeSnapshot, () => false);
  const flipTheme = () => {
    const next = isDark ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  };

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const day = (value: string) => {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : format.dateTime(d, { year: "numeric", month: "short", day: "numeric" });
  };

  const name = session?.user?.name || session?.user?.email || "";
  const email = session?.user?.email ?? "";
  const subtitle = [session?.user?.companyName, profile?.jobTitle].filter(Boolean).join(" · ");
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const cert = profile?.certificate ?? null;
  const activeLanguage = LANGUAGE_OPTIONS.find((o) => o.locale === locale)?.name ?? locale.toUpperCase();

  const reorder = (order: UserOrder) => {
    for (const item of order.items) {
      addItem({ sku: item.sku, name: item.productName, variant: item.variant, price: item.priceAtPurchase }, item.quantity);
    }
    setReordered((prev) => [...prev, order.id]);
  };

  const handleSignOut = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    void signOut({ callbackUrl: "/auth" });
  };

  const trackingLine = (order: UserOrder) => {
    if (order.status === "DELIVERED") return t("trackingDelivered");
    if (order.trackingNumber) return t("trackingArrives", { number: order.trackingNumber, date: day(order.estimatedDelivery) });
    return t("trackingEta", { date: day(order.estimatedDelivery) });
  };

  const settingsRows: Array<{
    id: string;
    icon: typeof Bell;
    tint: string;
    label: string;
    note: string;
    href?: string;
    value?: string;
  }> = [
    { id: "security", icon: ShieldCheck, tint: "#34d399", label: t("rowSecurity"), note: t("rowSecurityNote"), href: "/profile/settings/password" },
    { id: "notifications", icon: Bell, tint: "#2563eb", label: t("rowNotifications"), note: t("rowNotificationsNote"), href: "/notifications" },
    { id: "language", icon: Globe, tint: "#60a5fa", label: t("rowLanguage"), note: "", href: "/profile/settings/language", value: activeLanguage },
    { id: "currency", icon: Euro, tint: "#a78bfa", label: t("rowCurrency"), note: "", href: "/profile/settings/currency", value: "EUR (€)" },
  ];

  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-white dark:bg-canvas">
      {/* ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[190px] left-[-28%] h-[430px] w-[430px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_66%)] opacity-30 blur-[92px] [animation:hc-breathe_11s_ease-in-out_infinite]" />
        <div className="absolute -top-[120px] right-[-24%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_66%)] opacity-[.26] blur-[88px] [animation:hc-breathe_14s_ease-in-out_infinite_reverse]" />
        <div className="absolute -bottom-[120px] left-[8%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,#34d399,rgba(52,211,153,0)_68%)] opacity-[.16] blur-[84px] [animation:hc-breathe_13s_ease-in-out_infinite]" />
      </div>

      {/* sticky glass header */}
      <div className="sticky top-0 z-[80] bg-white/80 px-[18px] pb-2.5 pt-3 backdrop-blur-xl backdrop-saturate-150 dark:bg-[#090A0C]/[.82]">
        <div className="flex items-center gap-2.5">
          <motion.div whileTap={{ scale: 0.9 }} className="flex flex-none">
            <Link
              href="/"
              aria-label={t("backAria")}
              className="-ml-[11px] flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-slate-900/[.06] dark:hover:bg-white/10"
            >
              <ChevronLeft size={20} strokeWidth={2} />
            </Link>
          </motion.div>
          <span className="min-w-0 flex-1 text-center text-[16.5px] font-semibold tracking-[-.03em]">{t("title")}</span>
          <motion.div whileTap={{ scale: 0.9 }} className="flex flex-none">
            <Link
              href="/profile/settings"
              aria-label={tProfile("settingsAria")}
              className="-mr-[11px] flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/[.06] dark:text-ink-muted dark:hover:bg-white/10"
            >
              <Settings size={19} strokeWidth={1.9} />
            </Link>
          </motion.div>
        </div>
      </div>

      <div className="relative pb-[calc(118px+env(safe-area-inset-bottom))]">
        {/* hero card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="px-[18px] pt-3.5"
        >
          <div className="relative overflow-hidden rounded-[28px] border border-slate-900/[.1] bg-white/70 p-5 shadow-[0_30px_66px_-44px_rgba(0,0,0,.5)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass">
            <span className="pointer-events-none absolute -top-[104%] right-[-28%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,#2563eb,transparent_68%)] opacity-[.28] blur-[66px]" />

            <div className="relative flex items-center gap-3.5">
              <span
                data-avatar
                className="flex h-[58px] w-[58px] flex-none items-center justify-center rounded-full bg-[linear-gradient(140deg,#2563eb,#7c3aed)] text-[19px] font-semibold tracking-[-.02em] text-white shadow-[0_16px_32px_-16px_rgba(37,99,235,.8)]"
              >
                {initials || "•"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold leading-[1.2] tracking-[-.035em]">{name}</span>
                {subtitle && (
                  <span className="mt-1 block truncate text-xs text-slate-500 dark:text-ink-muted">{subtitle}</span>
                )}
                <span className="mt-0.5 block truncate text-[11px] text-slate-400 dark:text-ink-muted">{email}</span>
              </span>
            </div>

            <div className="relative mt-[15px] flex flex-wrap gap-[7px]">
              {profile?.fgasVerified && (
                <span className="inline-flex items-center gap-[7px] rounded-full border border-[rgba(16,185,129,.32)] bg-[rgba(16,185,129,.15)] py-1.5 pl-[9px] pr-3 text-[10.5px] font-semibold text-[#047857] shadow-[0_0_18px_-6px_#34d399] dark:text-[#34d399]">
                  <ShieldCheck size={13} strokeWidth={2} />
                  {tProfile("epaVerifiedBadge")}
                </span>
              )}
              {profile?.memberSinceYear && (
                <span className="inline-flex items-center rounded-full border border-blue-700/30 bg-blue-700/[.12] px-3 py-1.5 text-[10.5px] font-semibold text-blue-700 dark:bg-blue-600/[.16] dark:text-blue-400">
                  {t("memberPill", { year: profile.memberSinceYear })}
                </span>
              )}
            </div>

            <div className="relative mt-4 grid grid-cols-3 gap-2" data-hero-stats>
              {[
                { label: t("statOrders"), value: dashboardData?.totalOrders ?? 0 },
                { label: t("statTransit"), value: dashboardData?.activeShipments ?? 0 },
                { label: t("statAddresses"), value: dashboardData?.addressCount ?? 0 },
              ].map((stat) => (
                <span key={stat.label} className="block rounded-[15px] border border-slate-900/[.07] bg-slate-100 p-[11px] dark:border-hairline dark:bg-surface-3">
                  <span className="block text-[9px] tracking-[.07em] text-slate-400 dark:text-ink-muted">{stat.label}</span>
                  <span className="mt-1 block text-base font-semibold tracking-[-.035em] tabular-nums">{stat.value}</span>
                </span>
              ))}
            </div>

            <motion.div whileTap={{ scale: 0.95 }} className="relative mt-[15px]">
              <Link
                href="/profile/settings"
                data-edit-profile
                className="flex min-h-[46px] w-full items-center justify-center rounded-[15px] bg-blue-700 text-[13px] font-semibold tracking-[-.015em] text-white shadow-[0_16px_32px_-16px_#2563eb] transition-colors hover:bg-blue-800"
              >
                {tPd("editProfile")}
              </Link>
            </motion.div>
          </div>
        </motion.div>

        {/* tab rail */}
        <div className="mt-[18px] flex snap-x snap-mandatory gap-2 overflow-x-auto px-[18px] pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ id, labelKey, icon: Icon }) => {
            const on = tab === id;
            return (
              <motion.button
                key={id}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setTab(id)}
                data-profile-tab={id}
                className={`flex min-h-10 flex-none snap-start items-center gap-[7px] whitespace-nowrap rounded-full border px-3.5 text-[12.5px] font-semibold tracking-[-.015em] transition-colors ${
                  on
                    ? "border-transparent bg-blue-700 text-white shadow-[0_14px_28px_-16px_#2563eb]"
                    : "border-slate-900/[.14] text-slate-500 dark:border-hairline-strong dark:text-ink-muted"
                }`}
              >
                <Icon size={15} strokeWidth={1.9} />
                {t(labelKey)}
              </motion.button>
            );
          })}
        </div>

        {/* ── Orders ── */}
        {tab === "orders" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }} className="px-[18px] pt-[18px]" data-panel-orders>
            {(orders ?? []).map((order) => {
              const tone = TONES[order.status];
              const open = openOrder === order.id;
              const again = reordered.includes(order.id);
              const done = order.status === "DELIVERED";
              return (
                <div
                  key={order.id}
                  data-order-card={order.orderNumber}
                  className="mb-[11px] overflow-hidden rounded-[22px] border bg-white/70 backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 dark:bg-glass"
                  style={{
                    borderColor: open ? tone.bd : "var(--hc-cat-border, rgba(15,23,42,.1))",
                    boxShadow: open ? `0 0 26px -12px ${tone.dot}80` : "0 14px 34px -32px rgba(0,0,0,.5)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenOrder(open ? null : order.id)}
                    className="flex min-h-16 w-full items-center gap-3 p-[15px] text-left"
                  >
                    <span
                      className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] border"
                      style={{ background: tone.bg, borderColor: tone.bd }}
                    >
                      {done ? (
                        <Package size={17} strokeWidth={1.9} className="text-[#047857] dark:text-[#34d399]" />
                      ) : (
                        <Truck size={17} strokeWidth={1.9} style={{ color: tone.dot }} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold tracking-[-.025em]">{order.orderNumber}</span>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border py-[3px] pl-[7px] pr-[9px] text-[9.5px] font-semibold"
                          style={{ background: tone.bg, borderColor: tone.bd }}
                        >
                          <span
                            className="h-1 w-1 flex-none rounded-full"
                            style={{
                              background: tone.dot,
                              boxShadow: `0 0 6px 1px ${tone.dot}`,
                              animation: tone.live ? "hc-glow 2.2s ease-in-out infinite" : undefined,
                            }}
                          />
                          <span style={{ color: isDark ? tone.dark : tone.fg }}>
                            {order.status === "IN_TRANSIT" ? tAccount("statusInTransit") : done ? tAccount("statusDelivered") : tAccount("statusPending")}
                          </span>
                        </span>
                      </span>
                      <span className="mt-[5px] block text-[11px] text-slate-400 dark:text-ink-muted">
                        {day(order.createdAt)} · {t("itemsCount", { count: order.items.length })}
                      </span>
                    </span>
                    <span className="flex-none text-right">
                      <span className="block text-sm font-semibold tracking-[-.03em] tabular-nums">{eur(order.totalAmount)}</span>
                      <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }} className="ml-auto mt-1.5 flex w-fit">
                        <ChevronDown size={14} strokeWidth={2} className="text-slate-400 dark:text-ink-muted" />
                      </motion.span>
                    </span>
                  </button>

                  <AnimatePresence>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="px-[15px] pb-[15px]">
                          <div className="flex flex-col gap-[9px] border-t border-slate-900/[.08] pt-[13px] dark:border-hairline">
                            {order.items.map((item) => (
                              <span key={item.id} className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[11px] border border-slate-900/[.07] bg-slate-100 text-[10.5px] font-semibold text-slate-500 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted">
                                  {item.quantity}×
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-xs font-semibold tracking-[-.02em]">{item.productName}</span>
                                  <span className="mt-0.5 block text-[10.5px] text-slate-400 dark:text-ink-muted">{item.variant}</span>
                                </span>
                                <span className="text-xs font-semibold tracking-[-.02em] tabular-nums">
                                  {eur(item.priceAtPurchase * item.quantity)}
                                </span>
                              </span>
                            ))}
                          </div>

                          <div className="mt-[13px] flex items-center gap-[9px] border-t border-slate-900/[.08] pt-3 dark:border-hairline">
                            <span className="min-w-0 flex-1 text-[10.5px] text-slate-400 dark:text-ink-muted">{trackingLine(order)}</span>
                            <motion.div whileTap={{ scale: 0.95 }} className="flex flex-none">
                              <Link
                                href={`/profile/orders/${order.id}`}
                                className="flex min-h-9 items-center gap-1.5 rounded-[11px] border border-slate-900/[.16] px-3 text-[11.5px] font-semibold dark:border-hairline-strong"
                              >
                                <Download size={13} strokeWidth={2} />
                                {t("detailsBtn")}
                              </Link>
                            </motion.div>
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.95 }}
                              onClick={() => reorder(order)}
                              disabled={again}
                              className={`min-h-9 flex-none rounded-[11px] px-3.5 text-[11.5px] font-semibold tracking-[-.01em] text-white ${
                                again ? "bg-green-600 shadow-[0_12px_24px_-14px_#16a34a]" : "bg-blue-700 shadow-[0_12px_24px_-14px_#2563eb]"
                              }`}
                            >
                              {again ? tHm("reorderedBtn") : tHm("reorderBtn")}
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* ── Compliance ── */}
        {tab === "certs" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }} className="px-[18px] pt-[18px]" data-panel-certs>
            {cert ? (
              <div
                data-cert-card
                className="relative mb-3 overflow-hidden rounded-[22px] border border-[rgba(16,185,129,.27)] bg-white/70 p-[17px] shadow-[0_0_26px_-16px_#34d399] backdrop-blur-xl backdrop-saturate-150 dark:bg-glass"
              >
                <span className="pointer-events-none absolute -bottom-[150%] left-[-22%] h-[230px] w-[230px] rounded-full bg-[radial-gradient(circle,#34d399,transparent_68%)] opacity-20 blur-[58px]" />
                <span className="relative flex items-start gap-3">
                  <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-xl border border-[rgba(16,185,129,.27)] bg-[rgba(16,185,129,.13)]">
                    <ShieldCheck size={16} strokeWidth={1.9} className="text-[#047857] dark:text-[#34d399]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-[5px] block text-[9.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                      {t("certKind")}
                    </span>
                    <span className="block text-[13.5px] font-semibold leading-[1.3] tracking-[-.025em]">
                      {tHm("certTitle")} · {cert.certType}
                    </span>
                    <span className="mt-1 block text-[10.5px] text-slate-400 dark:text-ink-muted">
                      {cert.certId} · {tHm("certIssued", { year: cert.issuedYear })}
                    </span>
                  </span>
                  <motion.div whileTap={{ scale: 0.95 }} className="flex flex-none">
                    <Link
                      href="/profile/docs"
                      aria-label={tHm("certDownloadAria")}
                      className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-slate-100 dark:bg-white/[.07]"
                    >
                      <Download size={17} strokeWidth={1.9} />
                    </Link>
                  </motion.div>
                </span>
                <span className="relative mt-[13px] flex flex-wrap gap-[7px]">
                  {profile?.fgasVerified && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(16,185,129,.32)] bg-[rgba(16,185,129,.15)] py-[5px] pl-2 pr-[11px] text-[10px] font-semibold text-[#047857] shadow-[0_0_16px_-7px_#34d399] dark:text-[#34d399]">
                      <span className="h-[5px] w-[5px] flex-none rounded-full bg-[#34d399] shadow-[0_0_7px_1px_#34d399]" />
                      {t("certVerified")}
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full border border-slate-900/[.08] bg-slate-100 px-[11px] py-[5px] text-[10px] font-semibold text-slate-500 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted">
                    {cert.certType}
                  </span>
                </span>
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-900/[.16] bg-white/70 p-[17px] text-center text-xs text-slate-500 backdrop-blur-xl dark:border-hairline-strong dark:bg-glass dark:text-ink-muted">
                {t("noCerts")}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Company ── */}
        {tab === "company" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }} className="px-[18px] pt-[18px]" data-panel-company>
            <div className="rounded-[22px] border border-slate-900/[.1] bg-white/70 p-[17px] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass">
              <div className="mb-[13px] text-[9.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">{t("billingEntity")}</div>
              <div className="flex flex-col gap-3">
                {[
                  { label: t("fieldLegalEntity"), value: session?.user?.companyName },
                  { label: t("fieldRole"), value: profile?.jobTitle },
                  { label: t("fieldBillingEmail"), value: email },
                  { label: t("fieldMemberSince"), value: profile?.memberSinceYear ? String(profile.memberSinceYear) : null },
                ]
                  .filter((f) => f.value)
                  .map((field) => (
                    <span key={field.label} className="flex items-baseline justify-between gap-3.5">
                      <span className="flex-none text-[11px] tracking-[.04em] text-slate-400 dark:text-ink-muted">{field.label}</span>
                      <span className="min-w-0 truncate text-right text-[12.5px] font-semibold tracking-[-.02em]">{field.value}</span>
                    </span>
                  ))}
              </div>
            </div>

            <div className="mt-3 rounded-[22px] border border-slate-900/[.1] bg-white/70 p-[17px] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass">
              <div className="mb-[13px] flex items-baseline justify-between gap-3">
                <span className="text-[9.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">{t("shippingAddresses")}</span>
                <Link href="/profile/addresses" className="text-[11.5px] font-semibold text-blue-700 dark:text-blue-400">
                  {t("manage")}
                </Link>
              </div>
              <div className="flex flex-col gap-2.5">
                {(addresses ?? []).map((address) => (
                  <span
                    key={address.id}
                    data-address-row
                    className={`flex items-start gap-[11px] rounded-2xl border bg-slate-100/80 p-[13px] dark:bg-surface-3 ${
                      address.isDefault ? "border-blue-700/30" : "border-slate-900/[.08] dark:border-hairline"
                    }`}
                  >
                    <span
                      className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-xl border ${
                        address.isDefault
                          ? "border-blue-700/[.27] bg-blue-700/[.13] text-blue-700 dark:text-blue-400"
                          : "border-slate-900/[.08] bg-slate-200/60 text-slate-500 dark:border-hairline dark:bg-white/[.06] dark:text-ink-muted"
                      }`}
                    >
                      {address.kind === "BILLING" ? <Briefcase size={15} strokeWidth={1.9} /> : <MapPin size={15} strokeWidth={1.9} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-[7px]">
                        <span className="text-[12.5px] font-semibold tracking-[-.02em]">{address.title}</span>
                        {address.isDefault && (
                          <span className="inline-flex items-center rounded-full bg-blue-700/[.18] px-2 py-0.5 text-[9px] font-semibold text-blue-700 dark:text-blue-400">
                            {t("defaultPill")}
                          </span>
                        )}
                      </span>
                      <span className="mt-[3px] block text-[10.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">
                        {address.recipientName} · {address.fullAddress}
                      </span>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }} className="px-[18px] pt-[18px]" data-panel-settings>
            <div className="overflow-hidden rounded-[22px] border border-slate-900/[.1] bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass">
              {settingsRows.slice(0, 2).map((row) => (
                <Link
                  key={row.id}
                  href={row.href!}
                  className="flex min-h-[60px] w-full items-center gap-3 border-b border-slate-900/[.08] px-[15px] py-3 dark:border-hairline"
                >
                  <span
                    className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-xl border"
                    style={{ background: `${row.tint}22`, borderColor: `${row.tint}44` }}
                  >
                    <row.icon size={15} strokeWidth={1.9} style={{ color: row.tint }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold tracking-[-.022em]">{row.label}</span>
                    <span className="mt-[3px] block text-[10.5px] text-slate-400 dark:text-ink-muted">{row.note}</span>
                  </span>
                  <ChevronRight size={14} strokeWidth={2} className="flex-none text-slate-400 dark:text-ink-muted" />
                </Link>
              ))}

              {/* real theme switch */}
              <button
                type="button"
                onClick={flipTheme}
                data-theme-row
                className="flex min-h-[60px] w-full items-center gap-3 border-b border-slate-900/[.08] px-[15px] py-3 text-left dark:border-hairline"
              >
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-xl border border-[#7c3aed44] bg-[#7c3aed22]">
                  <Moon size={15} strokeWidth={1.9} className="text-[#7c3aed] dark:text-[#a78bfa]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold tracking-[-.022em]">{t("rowDark")}</span>
                  <span className="mt-[3px] block text-[10.5px] text-slate-400 dark:text-ink-muted">{t("rowDarkNote")}</span>
                </span>
                <span className={`relative h-[30px] w-12 flex-none rounded-full transition-colors ${isDark ? "bg-green-600" : "bg-slate-900/[.16] dark:bg-white/[.16]"}`}>
                  <motion.span
                    animate={{ left: isDark ? 21 : 3 }}
                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    className="absolute top-[3px] h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.4)]"
                  />
                </span>
              </button>

              {settingsRows.slice(2).map((row, i, arr) => (
                <Link
                  key={row.id}
                  href={row.href!}
                  className={`flex min-h-[60px] w-full items-center gap-3 px-[15px] py-3 ${
                    i === arr.length - 1 ? "" : "border-b border-slate-900/[.08] dark:border-hairline"
                  }`}
                >
                  <span
                    className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-xl border"
                    style={{ background: `${row.tint}22`, borderColor: `${row.tint}44` }}
                  >
                    <row.icon size={15} strokeWidth={1.9} style={{ color: row.tint }} />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] font-semibold tracking-[-.022em]">{row.label}</span>
                  {row.value && <span className="max-w-[40%] truncate text-xs font-semibold text-slate-500 dark:text-ink-muted">{row.value}</span>}
                  <ChevronRight size={14} strokeWidth={2} className="flex-none text-slate-400 dark:text-ink-muted" />
                </Link>
              ))}
            </div>
          </motion.div>
        )}

        {/* sign out */}
        <div className="px-[18px] pt-[22px]">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={handleSignOut}
            disabled={loggingOut}
            data-sign-out
            className="flex min-h-[50px] w-full items-center justify-center gap-[9px] rounded-2xl border border-red-500/[.34] bg-red-500/[.08] text-[13.5px] font-semibold tracking-[-.015em] text-red-500 shadow-[0_0_24px_-14px_#ef4444] transition-colors hover:bg-red-500/[.14] dark:text-[#f87171]"
          >
            {loggingOut ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : <LogOut size={16} strokeWidth={1.9} />}
            {loggingOut ? tProfile("loggingOut") : tProfile("logout")}
          </motion.button>
          <p className="mx-1 mb-0 mt-3 text-center text-[10px] text-slate-400 dark:text-ink-muted">{t("sessionNote")}</p>
        </div>
      </div>
    </div>
  );
}
