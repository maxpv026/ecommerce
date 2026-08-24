"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ChevronDown,
  Droplets,
  FileText,
  Lock,
  LogOut,
  Package,
  ShieldCheck,
  ShoppingBag,
  Truck,
  User,
} from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import { nativeLanguageName } from "@/lib/languageNames";
import { ACCOUNT_PROFILE } from "@/lib/account";
import type { ProfileDashboardData, UserOrder, UserProfileData } from "@/lib/data";
import type { OrderTrackingView, TimelineStepKey } from "@/lib/tracking";
import type { OrderStatus } from "@/lib/generated/prisma/enums";

// F-Gas certs run on a 4-year cycle — the DB stores the issue date, the
// expiry and the renewal progress bar are derived from it.
const CERT_VALIDITY_YEARS = 4;

/* ── entrance: cascading fade-up, design's cubic-bezier(.16,1,.3,1) ── */
const rise = {
  hidden: { opacity: 0, y: 24, scale: 0.965 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.09, duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

/* ── hover physics shared by every interactive bento card ── */
const hoverLift = { scale: 1.02, y: -3 };
const hoverSpring = { type: "spring" as const, stiffness: 300, damping: 24 };
const GLOW_HOVER =
  "transition-[box-shadow,border-color] duration-300 hover:border-blue-500/30 hover:shadow-[0_0_0_1px_rgba(80,140,255,.34),0_0_34px_-6px_rgba(59,130,246,.34),0_44px_90px_-44px_rgba(2,4,10,.62)]";

const STATUS_PROGRESS: Record<OrderStatus, number> = { PENDING: 0.35, IN_TRANSIT: 0.62, DELIVERED: 1 };

/* ── order-row cascade: each card springs up in turn (design: 75ms apart) ── */
const rowRise = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.62, ease: [0.16, 1, 0.3, 1] as const } },
};

/* ── glowing status tones from the design's TONES palette (light + dark) ── */
type OrderToneKey = "transit" | "done" | "pending";
const ORDER_TONES: Record<
  OrderToneKey,
  { badge: string; dot: string; bar: string; iconWrap: string; iconText: string; aura: string; timelineDot: string; hoverGlow: string; ring: string }
> = {
  transit: {
    badge:
      "border-[rgba(3,105,161,.24)] bg-[rgba(56,189,248,.14)] text-[#0369a1] shadow-[0_0_18px_-6px_rgba(8,145,178,.4)] dark:border-[rgba(56,189,248,.3)] dark:bg-[rgba(56,189,248,.12)] dark:text-[#38bdf8] dark:shadow-[0_0_18px_-6px_rgba(34,211,238,.4)]",
    dot: "bg-[#0891b2] shadow-[0_0_8px_1px_#0891b2] dark:bg-[#22d3ee] dark:shadow-[0_0_8px_1px_#22d3ee]",
    bar: "bg-[linear-gradient(90deg,#1d4ed8,#0891b2)] shadow-[0_0_12px_-2px_#0891b2] dark:bg-[linear-gradient(90deg,#2563eb,#22d3ee)] dark:shadow-[0_0_12px_-2px_#22d3ee]",
    iconWrap: "border-[rgba(3,105,161,.24)] bg-[rgba(56,189,248,.14)] dark:border-[rgba(56,189,248,.3)] dark:bg-[rgba(56,189,248,.12)]",
    iconText: "text-[#0369a1] dark:text-[#38bdf8]",
    aura: "bg-[radial-gradient(circle,#0891b2,transparent_68%)] dark:bg-[radial-gradient(circle,#22d3ee,transparent_68%)]",
    timelineDot: "bg-[#0891b2] dark:bg-[#22d3ee]",
    hoverGlow:
      "hover:shadow-[0_34px_70px_-40px_rgba(2,4,10,.6),0_0_26px_-8px_rgba(8,145,178,.33)] dark:hover:shadow-[0_34px_70px_-40px_rgba(2,4,10,.6),0_0_26px_-8px_rgba(34,211,238,.33)]",
    ring: "shadow-[0_0_0_4px_rgba(56,189,248,.14),0_0_14px_1px_#0891b2] dark:shadow-[0_0_0_4px_rgba(56,189,248,.12),0_0_14px_1px_#22d3ee]",
  },
  done: {
    badge:
      "border-[rgba(4,120,87,.22)] bg-[rgba(16,185,129,.13)] text-[#047857] shadow-[0_0_18px_-6px_rgba(5,150,105,.4)] dark:border-[rgba(16,185,129,.24)] dark:bg-[rgba(16,185,129,.1)] dark:text-[#34d399] dark:shadow-[0_0_18px_-6px_rgba(52,211,153,.4)]",
    dot: "bg-[#059669] shadow-[0_0_8px_1px_#059669] dark:bg-[#34d399] dark:shadow-[0_0_8px_1px_#34d399]",
    bar: "bg-[linear-gradient(90deg,#047857,#10b981)] shadow-[0_0_12px_-2px_#059669] dark:bg-[linear-gradient(90deg,#059669,#34d399)] dark:shadow-[0_0_12px_-2px_#34d399]",
    iconWrap: "border-[rgba(4,120,87,.22)] bg-[rgba(16,185,129,.13)] dark:border-[rgba(16,185,129,.24)] dark:bg-[rgba(16,185,129,.1)]",
    iconText: "text-[#047857] dark:text-[#34d399]",
    aura: "bg-[radial-gradient(circle,#059669,transparent_68%)] dark:bg-[radial-gradient(circle,#34d399,transparent_68%)]",
    timelineDot: "bg-[#059669] dark:bg-[#34d399]",
    hoverGlow:
      "hover:shadow-[0_34px_70px_-40px_rgba(2,4,10,.6),0_0_26px_-8px_rgba(5,150,105,.33)] dark:hover:shadow-[0_34px_70px_-40px_rgba(2,4,10,.6),0_0_26px_-8px_rgba(52,211,153,.33)]",
    ring: "shadow-[0_0_0_4px_rgba(16,185,129,.13),0_0_14px_1px_#059669] dark:shadow-[0_0_0_4px_rgba(16,185,129,.1),0_0_14px_1px_#34d399]",
  },
  pending: {
    badge:
      "border-[rgba(180,83,9,.24)] bg-[rgba(245,158,11,.15)] text-[#b45309] shadow-[0_0_18px_-6px_rgba(217,119,6,.4)] dark:border-[rgba(245,158,11,.28)] dark:bg-[rgba(245,158,11,.12)] dark:text-[#fbbf24] dark:shadow-[0_0_18px_-6px_rgba(251,191,36,.4)]",
    dot: "bg-[#d97706] shadow-[0_0_8px_1px_#d97706] dark:bg-[#fbbf24] dark:shadow-[0_0_8px_1px_#fbbf24]",
    bar: "bg-[linear-gradient(90deg,#b45309,#f59e0b)] shadow-[0_0_12px_-2px_#d97706] dark:bg-[linear-gradient(90deg,#d97706,#fbbf24)] dark:shadow-[0_0_12px_-2px_#fbbf24]",
    iconWrap: "border-[rgba(180,83,9,.24)] bg-[rgba(245,158,11,.15)] dark:border-[rgba(245,158,11,.28)] dark:bg-[rgba(245,158,11,.12)]",
    iconText: "text-[#b45309] dark:text-[#fbbf24]",
    aura: "bg-[radial-gradient(circle,#d97706,transparent_68%)] dark:bg-[radial-gradient(circle,#fbbf24,transparent_68%)]",
    timelineDot: "bg-[#d97706] dark:bg-[#fbbf24]",
    hoverGlow:
      "hover:shadow-[0_34px_70px_-40px_rgba(2,4,10,.6),0_0_26px_-8px_rgba(217,119,6,.33)] dark:hover:shadow-[0_34px_70px_-40px_rgba(2,4,10,.6),0_0_26px_-8px_rgba(251,191,36,.33)]",
    ring: "shadow-[0_0_0_4px_rgba(245,158,11,.15),0_0_14px_1px_#d97706] dark:shadow-[0_0_0_4px_rgba(245,158,11,.12),0_0_14px_1px_#fbbf24]",
  },
};

const STEP_LABEL_KEY: Record<TimelineStepKey, string> = {
  placed: "stepPlaced",
  shipped: "stepShipped",
  inTransit: "stepInTransit",
  delivered: "stepDelivered",
};

interface DashboardDesktopProps {
  isAuthenticated: boolean;
  profile: UserProfileData | null;
  orders: UserOrder[] | null;
  orderTracking: Record<string, OrderTrackingView>;
  dashboard: ProfileDashboardData | null;
}

export default function DashboardDesktop({
  isAuthenticated,
  profile,
  orders,
  orderTracking,
  dashboard,
}: DashboardDesktopProps) {
  const t = useTranslations("ProfileDashboard");
  const tAccount = useTranslations("AccountProfile");
  const tProfile = useTranslations("Profile");
  const tHome = useTranslations("HomeDesktop");
  const tCheckout = useTranslations("Checkout");
  const tCart = useTranslations("Cart");
  const tAuth = useTranslations("Auth");
  const format = useFormatter();
  const router = useRouter();
  const { data: session } = useSession();
  const addItem = useCartStore((s) => s.addItem);

  const [activeTab, setActiveTab] = useState("overview");
  const [reordered, setReordered] = useState<string[]>([]);
  const [openOrder, setOpenOrder] = useState<string | null>(() => orders?.[0]?.id ?? null);
  const [signingOut, setSigningOut] = useState(false);

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  // Real session/Prisma bindings with the signed-out placeholder preview
  // (same "Dana Mercer" dataset the previous profile page used for guests).
  const preview = !isAuthenticated;
  const displayName = preview
    ? ACCOUNT_PROFILE.name
    : (profile?.name || session?.user?.name || session?.user?.email || profile?.email) ?? "";
  const email = preview ? "dana@mercermechanical.com" : (profile?.email ?? session?.user?.email ?? "");
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const company = preview ? ACCOUNT_PROFILE.companyLabel : profile?.companyName;
  const memberSinceYear = preview ? ACCOUNT_PROFILE.customerSinceYear : (profile?.memberSinceYear ?? null);
  const fgasVerified = preview ? true : Boolean(profile?.fgasVerified);
  const cert = preview
    ? { certType: "Category I", certId: "FGAS-849201", issuedYear: 2025 }
    : (profile?.certificate ?? null);
  const certExpiryYear = cert ? cert.issuedYear + CERT_VALIDITY_YEARS : null;
  // Renewal progress: elapsed fraction of the certificate's validity window.
  const renewalProgress = cert
    ? Math.min(0.95, Math.max(0.05, (new Date().getFullYear() - cert.issuedYear) / CERT_VALIDITY_YEARS))
    : 0;

  const totalOrders = dashboard?.totalOrders ?? (preview ? ACCOUNT_PROFILE.orderCount : 0);
  const activeShipments = dashboard?.activeShipments ?? (preview ? 1 : 0);
  const shownOrders = orders ?? [];

  const identityFields = [
    { label: tAccount("fieldCompany"), value: company ?? tAccount("fieldEmpty") },
    { label: tAccount("fieldLanguage"), value: profile ? nativeLanguageName(profile.locale) : nativeLanguageName("en") },
    {
      label: t("fieldRole"),
      value: session?.user?.role === "ADMIN" ? t("roleFounder") : t("rolePurchasing"),
    },
    { label: t("fieldMemberSince"), value: memberSinceYear ? String(memberSinceYear) : tAccount("fieldEmpty") },
  ];

  const certFields = [
    { label: t("fieldHolder"), value: displayName || tAccount("fieldEmpty") },
    { label: t("fieldCertId"), value: cert?.certId ?? tAccount("fieldEmpty") },
    { label: t("fieldIssued"), value: cert ? String(cert.issuedYear) : "—" },
    { label: t("fieldExpires"), value: certExpiryYear ? String(certExpiryYear) : "—" },
  ];

  const stats = [
    {
      label: tHome("statOrders"),
      value: String(totalOrders),
      note: memberSinceYear ? t("statSinceNote", { year: memberSinceYear }) : "",
      icon: ShoppingBag,
      grad: "bg-[linear-gradient(140deg,#2563eb,#4338ca)]",
    },
    {
      label: tHome("statInTransit"),
      value: String(activeShipments),
      note: t("statDhlNote"),
      icon: Truck,
      grad: "bg-[linear-gradient(140deg,#0891b2,#22d3ee)]",
    },
    {
      label: tHome("statPurity"),
      value: "99.9%",
      note: t("statPurityNote"),
      icon: Droplets,
      grad: "bg-[linear-gradient(140deg,#7c3aed,#a855f7)]",
    },
  ];

  const tabs = [
    { id: "overview", label: t("tabOverview"), icon: User, target: "identity" },
    { id: "certificate", label: t("tabCertificate"), icon: ShieldCheck, target: "certificate", badge: fgasVerified ? t("badgeValid") : tAccount("pendingVerification") },
    { id: "orders", label: tAccount("navOrderHistory"), icon: Package, target: "orders", badge: shownOrders.length > 0 ? String(shownOrders.length) : undefined },
    { id: "addresses", label: t("tabAddresses"), icon: Truck, target: "shipping" },
    { id: "documents", label: t("tabDocuments"), icon: FileText, href: "/compliance/sds" as const },
    { id: "security", label: tAccount("navSecurity"), icon: Lock, target: "security" },
  ];

  const goTo = (tab: (typeof tabs)[number]) => {
    setActiveTab(tab.id);
    if (tab.href) {
      router.push(tab.href);
      return;
    }
    document.getElementById(tab.target!)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOut({ redirect: false });
    toast.success(tAuth("toastSignedOut"));
    router.push("/");
    router.refresh();
  };

  const reorder = (order: UserOrder) => {
    for (const item of order.items) {
      addItem(
        { sku: item.sku, name: item.productName, variant: item.variant, price: item.priceAtPurchase },
        item.quantity
      );
    }
    setReordered((r) => [...r, order.id]);
  };

  const orderTone = (status: OrderStatus): "transit" | "done" | "pending" =>
    status === "DELIVERED" ? "done" : status === "IN_TRANSIT" ? "transit" : "pending";

  const statusLabel = (status: OrderStatus) =>
    status === "DELIVERED"
      ? tAccount("statusDelivered")
      : status === "IN_TRANSIT"
        ? tAccount("statusInTransit")
        : tAccount("statusPending");

  const fieldTile =
    "rounded-2xl border border-slate-900/[.07] bg-slate-50 px-3.5 py-[13px] dark:border-hairline dark:bg-surface-2";

  return (
    <div className="relative overflow-x-clip">
      {/* Ambient glows behind the whole dashboard — three floating radial
          cores masked to fade out by ~42% page height, exactly as designed. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1000px] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_0%,#000_42%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_42%,transparent_100%)]">
        <div className="absolute -top-[330px] left-[-13%] h-[900px] w-[900px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_66%)] opacity-[.34] blur-[120px] [animation:hc-float_26s_ease-in-out_infinite]" />
        <div className="absolute -top-[250px] right-[-11%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_66%)] opacity-30 blur-[120px] [animation:hc-float_32s_ease-in-out_infinite_reverse]" />
        <div className="absolute -top-[190px] left-[38%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_68%)] opacity-[.26] blur-[110px] [animation:hc-float_38s_ease-in-out_infinite]" />
      </div>

      <main className="relative mx-auto max-w-[1320px] px-8 pb-[120px] pt-11">
        {/* ── Heading row ── */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="show"
          variants={rise}
          className="mb-8 flex flex-wrap items-end justify-between gap-7"
        >
          <div>
            <div className="mb-3 text-xs tracking-[.09em] text-slate-400 dark:text-ink-muted">
              {tAccount("accountEyebrow")}
            </div>
            <h1 className="m-0 text-[44px] font-semibold leading-[1.04] tracking-[-.045em]">{displayName}</h1>
            <p className="mt-3 max-w-[520px] text-[15px] leading-[1.6] text-slate-600 dark:text-ink-muted">
              {t("subline")}
            </p>
          </div>
          <div className="flex gap-2.5">
            <Link
              href="/cylinders"
              className="flex h-11 items-center justify-center rounded-[14px] border border-slate-900/[.14] px-5 text-[13.5px] font-semibold tracking-[-.015em] transition-colors hover:bg-slate-900/[.05] dark:border-hairline-strong dark:hover:bg-white/10"
            >
              {tHome("browseCylinders")}
            </Link>
            <button
              type="button"
              className="flex h-11 items-center justify-center rounded-[14px] bg-blue-700 px-[22px] text-[13.5px] font-semibold tracking-[-.015em] text-white shadow-[0_18px_36px_-18px_rgba(29,78,216,.8)] transition-colors hover:bg-blue-800"
            >
              {t("editProfile")}
            </button>
          </div>
        </motion.div>

        <div className="grid grid-cols-12 items-start gap-[18px]">
          {/* ── Sticky glass sidebar ── */}
          <motion.aside
            custom={1}
            initial="hidden"
            animate="show"
            variants={rise}
            className="sticky top-[94px] col-span-3"
          >
            <div className="relative overflow-hidden rounded-[26px] border border-slate-900/[.14] bg-white/70 p-3.5 shadow-[0_30px_70px_-46px_rgba(2,4,10,.6)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline-strong dark:bg-glass">
              <div className="flex items-center gap-3 border-b border-slate-900/[.07] px-2 pb-4 pt-2 dark:border-hairline">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[linear-gradient(140deg,#2563eb,#7c3aed)] text-[13px] font-semibold text-white">
                  {initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold tracking-[-.02em]">{displayName}</span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-slate-400 dark:text-ink-muted">{email}</span>
                </span>
              </div>

              <nav className="flex flex-col gap-[3px] pt-3">
                {tabs.map((tab) => {
                  const on = tab.id === activeTab;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => goTo(tab)}
                      className={`relative flex h-11 w-full items-center gap-[11px] rounded-[14px] px-3 text-left text-[13.5px] tracking-[-.015em] transition-colors duration-200 ${
                        on
                          ? "bg-blue-700/[.08] font-semibold text-blue-700 dark:bg-blue-600/[.18] dark:text-blue-400"
                          : "font-medium text-slate-600 hover:bg-slate-900/[.05] dark:text-ink-muted dark:hover:bg-white/10"
                      }`}
                    >
                      <span
                        className={`absolute bottom-[11px] left-0 top-[11px] w-[3px] rounded-full bg-[linear-gradient(180deg,#2563eb,#7c3aed)] transition-[opacity,transform] duration-300 ${
                          on ? "opacity-100 shadow-[0_0_12px_1px_rgba(59,130,246,.7)]" : "scale-y-[.3] opacity-0"
                        }`}
                      />
                      <Icon size={17} strokeWidth={1.9} className="flex-none" />
                      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                      {tab.badge && (
                        <span
                          className={`inline-flex flex-none items-center rounded-full px-2 py-[3px] text-[10.5px] font-semibold ${
                            on
                              ? "bg-blue-700/[.16] text-blue-700 dark:text-blue-400"
                              : "bg-slate-100 text-slate-400 dark:bg-surface-3 dark:text-ink-muted"
                          }`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={preview ? () => router.push("/auth") : handleLogout}
                  disabled={signingOut}
                  className="relative flex h-11 w-full items-center gap-[11px] rounded-[14px] px-3 text-left text-[13.5px] font-medium tracking-[-.015em] text-red-500 transition-colors duration-200 hover:bg-red-500/[.07] disabled:opacity-50 dark:text-red-400"
                >
                  <LogOut size={17} strokeWidth={1.9} className="flex-none" />
                  {tProfile("logout")}
                </button>
              </nav>

              <div className="mt-3.5 rounded-[18px] border border-slate-900/[.07] bg-slate-100 p-3.5 dark:border-hairline dark:bg-surface-3">
                <div className="mb-2 text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                  {t("nextRenewal")}
                </div>
                <div className="text-[13.5px] font-semibold tracking-[-.02em]">
                  {certExpiryYear ? `F-Gas · ${certExpiryYear}` : tAccount("fgasNoCert")}
                </div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-slate-900/[.14] dark:bg-hairline-strong">
                  <motion.span
                    initial={{ width: 0 }}
                    animate={{ width: `${renewalProgress * 100}%` }}
                    transition={{ delay: 0.6, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                    className="block h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#22d3ee)]"
                  />
                </div>
              </div>
            </div>
          </motion.aside>

          {/* ── Bento field ── */}
          <div className="col-span-9 grid grid-cols-9 items-start gap-[18px]">
            {/* Identity */}
            <motion.div custom={2} initial="hidden" animate="show" variants={rise} className="col-span-9" id="identity">
              <motion.div
                whileHover={hoverLift}
                transition={hoverSpring}
                className={`relative overflow-hidden rounded-[28px] border border-slate-900/[.07] bg-white p-[30px] shadow-[0_26px_60px_-44px_rgba(2,4,10,.5)] dark:border-hairline dark:bg-surface ${GLOW_HOVER}`}
              >
                <div className="pointer-events-none absolute inset-0 opacity-50">
                  <div className="absolute -top-[190px] right-[-90px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_68%)] opacity-50 blur-[90px]" />
                </div>
                <div className="relative flex flex-wrap items-center gap-[22px]">
                  <span className="flex h-[86px] w-[86px] flex-none items-center justify-center rounded-full bg-[linear-gradient(140deg,#2563eb,#7c3aed)] text-[27px] font-semibold tracking-[-.02em] text-white shadow-[0_22px_44px_-22px_rgba(37,99,235,.7)]">
                    {initials}
                  </span>
                  <div className="min-w-[240px] flex-1">
                    <div className="mb-2 text-[11px] tracking-[.09em] text-slate-400 dark:text-ink-muted">
                      {t("identityEyebrow")}
                    </div>
                    <div className="text-2xl font-semibold tracking-[-.035em]">{displayName}</div>
                    <div className="mt-[7px] text-[13.5px] text-slate-600 dark:text-ink-muted">{email} · My Energy</div>
                  </div>
                  <div className="grid min-w-[260px] grid-cols-2 gap-3">
                    {identityFields.map((field) => (
                      <div key={field.label} className={fieldTile}>
                        <div className="mb-1.5 text-[10px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                          {field.label}
                        </div>
                        <div className="text-[13px] font-semibold tracking-[-.015em]">{field.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* F-Gas Certificate — always-dark navy hero */}
            <motion.div custom={3} initial="hidden" animate="show" variants={rise} className="col-span-5" id="certificate">
              <motion.div
                whileHover={hoverLift}
                transition={hoverSpring}
                className={`relative h-full overflow-hidden rounded-[28px] bg-[#0b1020] p-7 text-white shadow-[0_40px_80px_-46px_rgba(11,16,32,.9)] border border-transparent ${GLOW_HOVER}`}
              >
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -top-[42%] left-[-16%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_68%)] opacity-80 blur-[86px]" />
                  <div className="absolute -bottom-[40%] right-[-20%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_68%)] opacity-[.62] blur-[86px]" />
                  <div className="absolute -bottom-[34%] left-[46%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_70%)] opacity-50 blur-[78px]" />
                </div>
                <div className="relative">
                  <div className="flex items-center justify-between gap-3.5">
                    <span className="text-[11px] tracking-[.09em] text-white/60">{t("complianceEyebrow")}</span>
                    {fgasVerified ? (
                      <span className="flex items-center gap-[7px] rounded-full border border-green-400/[.34] bg-green-500/[.16] py-1.5 pl-[9px] pr-3 text-[11.5px] font-semibold text-green-300">
                        <span className="relative flex h-[7px] w-[7px]">
                          <motion.span
                            animate={{ scale: [1, 2.6], opacity: [0.5, 0] }}
                            transition={{ duration: 2.2, repeat: Infinity, ease: [0, 0, 0.2, 1] }}
                            className="absolute inset-0 rounded-full bg-green-400"
                          />
                          <span className="relative h-[7px] w-[7px] rounded-full bg-green-400" />
                        </span>
                        {tAccount("verified")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-[7px] rounded-full border border-amber-400/[.34] bg-amber-500/[.16] px-3 py-1.5 text-[11.5px] font-semibold text-amber-300">
                        {tAccount("pendingVerification")}
                      </span>
                    )}
                  </div>
                  <h2 className="m-0 mt-5 text-[27px] font-semibold leading-[1.14] tracking-[-.04em]">{t("certTitle")}</h2>
                  <p className="mt-3 max-w-[340px] text-[13.5px] leading-[1.62] text-white/70">
                    {t("certBody", { type: cert?.certType ?? "—" })}
                  </p>

                  <div className="mt-6 grid grid-cols-2 gap-[11px]">
                    {certFields.map((field) => (
                      <div
                        key={field.label}
                        className="rounded-2xl border border-white/[.12] bg-white/[.07] px-3.5 py-[13px]"
                      >
                        <div className="mb-1.5 text-[10px] tracking-[.08em] text-white/50">{field.label}</div>
                        <div className="truncate text-[13px] font-semibold tracking-[-.015em]">{field.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex gap-2.5">
                    <Link
                      href="/compliance/certifications"
                      className="flex h-11 items-center justify-center rounded-[14px] bg-white px-5 text-[13.5px] font-semibold tracking-[-.015em] text-[#0b1020] transition-transform active:scale-[.98]"
                    >
                      {t("viewCertificate")}
                    </Link>
                    <Link
                      href="/compliance/sds"
                      className="flex h-11 items-center justify-center rounded-[14px] border border-white/[.24] bg-white/[.06] px-5 text-[13.5px] font-semibold tracking-[-.015em] text-white transition-colors hover:bg-white/[.12]"
                    >
                      {t("downloadPdf")}
                    </Link>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* Stat tiles */}
            <motion.div custom={4} initial="hidden" animate="show" variants={rise} className="col-span-4 grid gap-[18px]">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    whileHover={hoverLift}
                    transition={hoverSpring}
                    className={`relative overflow-hidden rounded-3xl border border-slate-900/[.07] bg-white/70 p-[22px] shadow-[0_20px_48px_-40px_rgba(2,4,10,.5)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass ${GLOW_HOVER}`}
                  >
                    <div className="relative flex items-center gap-3.5">
                      <span
                        className={`flex h-11 w-11 flex-none items-center justify-center rounded-[15px] text-white shadow-[0_14px_28px_-14px_rgba(37,99,235,.6)] ${stat.grad}`}
                      >
                        <Icon size={19} strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                          {stat.label}
                        </span>
                        <span className="mt-[5px] block text-[23px] font-semibold tracking-[-.04em]">{stat.value}</span>
                        <span className="mt-[3px] block text-[11.5px] text-slate-400 dark:text-ink-muted">
                          {stat.note}
                        </span>
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Orders — glassmorphic accordion with live DHL timelines */}
            <motion.div custom={5} initial="hidden" animate="show" variants={rise} className="col-span-9" id="orders">
              <div className="relative overflow-hidden rounded-[28px] border border-slate-900/[.07] bg-white p-[26px] shadow-[0_26px_60px_-46px_rgba(2,4,10,.5)] dark:border-hairline dark:bg-surface">
                <div className="mb-5 flex items-baseline justify-between gap-5">
                  <h2 className="m-0 text-[13px] tracking-[.09em] text-slate-400 dark:text-ink-muted">
                    {t("ordersHeading")}
                  </h2>
                  <span className="text-[12.5px] font-semibold text-blue-700 dark:text-blue-400">
                    {t("allOrders")}
                  </span>
                </div>

                {shownOrders.length === 0 ? (
                  <div className="py-9 text-center text-[13px] text-slate-400 dark:text-ink-muted">
                    {tAccount("noOrdersYet")}
                  </div>
                ) : (
                  <motion.div
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.075, delayChildren: 0.12 } } }}
                    className="flex flex-col gap-3"
                  >
                    {shownOrders.map((order) => {
                      const tone = ORDER_TONES[orderTone(order.status)];
                      const done = order.status === "DELIVERED";
                      const open = openOrder === order.id;
                      const hasReordered = reordered.includes(order.id);
                      const OrderIcon = done ? Package : Truck;
                      const tracking = orderTracking[order.id];
                      const subtotal = order.items.reduce((n, i) => n + i.priceAtPurchase * i.quantity, 0);
                      return (
                        <motion.div
                          key={order.id}
                          variants={rowRise}
                          whileHover={{ scale: 1.01 }}
                          transition={hoverSpring}
                          className={`group relative overflow-hidden rounded-[22px] border bg-white/60 backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 dark:bg-surface/60 ${
                            open
                              ? "border-slate-900/[.14] dark:border-white/[.16]"
                              : "border-slate-900/[.07] hover:border-slate-900/[.14] dark:border-white/5 dark:hover:border-white/[.16]"
                          } ${tone.hoverGlow}`}
                        >
                          {/* tone-colored aura, brightening on hover/open */}
                          <div
                            className={`pointer-events-none absolute left-[-8%] top-[-160%] h-[420px] w-[420px] rounded-full blur-[70px] transition-all duration-500 group-hover:scale-[1.12] group-hover:opacity-30 ${tone.aura} ${
                              open ? "scale-[1.12] opacity-30" : "opacity-[.12]"
                            }`}
                          />

                          {/* collapsed row — click expands */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setOpenOrder(open ? null : order.id)}
                            onKeyDown={(e) => e.key === "Enter" && setOpenOrder(open ? null : order.id)}
                            className="relative flex cursor-pointer flex-wrap items-center gap-[18px] px-5 py-[18px]"
                          >
                            <span
                              className={`flex h-11 w-11 flex-none items-center justify-center rounded-[15px] border transition-shadow duration-300 ${tone.iconWrap} ${
                                open ? tone.ring : ""
                              }`}
                            >
                              <OrderIcon size={18} strokeWidth={1.9} className={tone.iconText} />
                            </span>

                            <span className="min-w-[150px] flex-[1_1_180px]">
                              <Link
                                href={`/profile/orders/${order.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="block text-sm font-semibold tracking-[-.025em] hover:text-blue-700 dark:hover:text-blue-400"
                              >
                                #{order.orderNumber}
                              </Link>
                              <span className="mt-1 block text-xs text-slate-400 dark:text-ink-muted">
                                {format.dateTime(new Date(order.createdAt), { month: "short", day: "numeric", year: "numeric" })}
                                {" · "}
                                {tCart("cylinderCountShort", { count: order.items.reduce((n, i) => n + i.quantity, 0) })}
                              </span>
                            </span>

                            <span className="min-w-0 flex-[1_1_210px]">
                              <span className="mb-[9px] flex items-center gap-[9px]">
                                <span
                                  className={`inline-flex items-center gap-[7px] rounded-full border py-[5px] pl-[9px] pr-[11px] text-[11px] font-semibold tracking-[-.005em] ${tone.badge}`}
                                >
                                  <motion.span
                                    animate={done ? { opacity: 1 } : { opacity: [1, 0.42, 1] }}
                                    transition={done ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                                    className={`h-1.5 w-1.5 flex-none rounded-full ${tone.dot}`}
                                  />
                                  {statusLabel(order.status)}
                                </span>
                                <span className="text-[11.5px] text-slate-400 dark:text-ink-muted">
                                  {done
                                    ? format.dateTime(new Date(order.estimatedDelivery), { month: "short", day: "numeric", year: "numeric" })
                                    : `DHL · ${format.dateTime(new Date(order.estimatedDelivery), { month: "short", day: "numeric" })}`}
                                </span>
                              </span>
                              <span className="block h-1 overflow-hidden rounded-full bg-slate-900/[.14] dark:bg-hairline-strong">
                                <motion.span
                                  initial={{ width: 0 }}
                                  animate={{ width: `${STATUS_PROGRESS[order.status] * 100}%` }}
                                  transition={{ delay: 0.6, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                  className={`block h-full rounded-full ${tone.bar}`}
                                />
                              </span>
                            </span>

                            <span className="min-w-[86px] text-right text-[15px] font-semibold tracking-[-.03em]">
                              {eur(order.totalAmount)}
                            </span>

                            <span className="flex flex-none items-center gap-[9px]">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  reorder(order);
                                }}
                                disabled={hasReordered}
                                className={`flex h-[38px] flex-none items-center justify-center rounded-xl px-4 text-[12.5px] font-semibold tracking-[-.01em] transition-colors duration-200 ${
                                  hasReordered
                                    ? "bg-green-600 text-white"
                                    : "border border-slate-900/[.14] text-slate-900 hover:border-slate-900/30 dark:border-hairline-strong dark:text-slate-50 dark:hover:border-white/30"
                                }`}
                              >
                                {hasReordered ? tAccount("added") : tAccount("reorder")}
                              </button>
                              <span
                                className={`flex h-8 w-8 flex-none items-center justify-center rounded-[10px] transition-colors duration-300 ${
                                  open ? "bg-slate-100 dark:bg-surface-3" : "bg-transparent"
                                }`}
                              >
                                <motion.span
                                  animate={{ rotate: open ? 180 : 0 }}
                                  transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                                  className="flex"
                                >
                                  <ChevronDown size={16} strokeWidth={2} className="text-slate-600 dark:text-ink-muted" />
                                </motion.span>
                              </span>
                            </span>
                          </div>

                          {/* expandable detail: items + live DHL timeline */}
                          <motion.div
                            initial={false}
                            animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                            className="relative overflow-hidden"
                          >
                            <div className="grid grid-cols-[1.1fr_1fr] gap-[22px] border-t border-slate-900/[.07] px-5 pb-5 pt-0 dark:border-hairline">
                              <div className="pt-[18px]">
                                <div className="mb-[13px] text-[10.5px] uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">
                                  {tCheckout("itemsTitle")}
                                </div>
                                <div className="flex flex-col gap-2.5">
                                  {order.items.map((item) => (
                                    <div key={item.id} className="flex items-center gap-3">
                                      <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-xl border border-slate-900/[.07] bg-slate-100 text-[11.5px] font-semibold text-slate-600 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted">
                                        {item.quantity}×
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-semibold tracking-[-.02em]">
                                          {item.productName}
                                        </span>
                                        <span className="mt-0.5 block text-[11.5px] text-slate-400 dark:text-ink-muted">
                                          {item.variant}
                                        </span>
                                      </span>
                                      <span className="text-[13px] font-semibold tracking-[-.02em]">
                                        {eur(item.priceAtPurchase * item.quantity)}
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                <div className="mt-4 flex flex-col gap-2 border-t border-slate-900/[.07] pt-3.5 dark:border-hairline">
                                  <div className="flex items-baseline justify-between gap-3.5">
                                    <span className="text-[12.5px] text-slate-400 dark:text-ink-muted">
                                      {tCart("subtotal")}
                                    </span>
                                    <span className="text-[12.5px] font-semibold tracking-[-.02em] text-slate-600 dark:text-ink-muted">
                                      {eur(subtotal)}
                                    </span>
                                  </div>
                                  <div className="flex items-baseline justify-between gap-3.5">
                                    <span className="text-[12.5px] text-slate-400 dark:text-ink-muted">
                                      {tCart("total")}
                                    </span>
                                    <span className="text-sm font-semibold tracking-[-.02em]">
                                      {eur(order.totalAmount)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="pt-[18px]">
                                <div className="mb-[15px] flex items-baseline justify-between gap-3">
                                  <span className="text-[10.5px] uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">
                                    {tCheckout("trackingTitle")}
                                  </span>
                                  <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-ink-muted">
                                    {order.trackingNumber ?? "—"}
                                  </span>
                                </div>
                                <div className="flex flex-col">
                                  {(tracking?.steps ?? []).map((step, idx, arr) => {
                                    const live = step.state === "current";
                                    const pendingStep = step.state === "upcoming";
                                    const last = idx === arr.length - 1;
                                    const at = step.timestamp
                                      ? format.dateTime(new Date(step.timestamp), { month: "short", day: "numeric", hour: "numeric", minute: "numeric" })
                                      : step.key === "delivered" && pendingStep
                                        ? format.dateTime(new Date(order.estimatedDelivery), { month: "short", day: "numeric" })
                                        : "";
                                    return (
                                      <div key={step.key} className="flex gap-3.5">
                                        <span className="relative flex w-[18px] flex-none flex-col items-center">
                                          <span
                                            className={`mt-1 flex-none rounded-full ${live ? "h-[11px] w-[11px]" : "h-[9px] w-[9px]"} ${
                                              pendingStep ? "bg-slate-900/[.14] dark:bg-hairline-strong" : tone.timelineDot
                                            } ${live ? tone.ring : ""}`}
                                          />
                                          {!last && (
                                            <span
                                              className={`mt-1 w-0.5 flex-1 rounded-full ${
                                                pendingStep
                                                  ? "bg-slate-900/[.07] dark:bg-hairline"
                                                  : "bg-slate-900/[.14] dark:bg-hairline-strong"
                                              }`}
                                              style={{ minHeight: 22 }}
                                            />
                                          )}
                                        </span>
                                        <span className={`block ${last ? "" : "pb-4"}`}>
                                          <span
                                            className={`block text-[12.5px] tracking-[-.015em] ${
                                              live ? "font-semibold" : "font-medium"
                                            } ${pendingStep ? "text-slate-400 dark:text-ink-muted" : ""}`}
                                          >
                                            {tCheckout(STEP_LABEL_KEY[step.key])}
                                          </span>
                                          <span className="mt-0.5 block text-[11.5px] text-slate-400 dark:text-ink-muted">
                                            {at}
                                          </span>
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            </motion.div>

            {/* Security + Shipping */}
            <motion.div
              custom={6}
              initial="hidden"
              animate="show"
              variants={rise}
              className="col-span-9 grid grid-cols-[1.35fr_1fr] items-stretch gap-[18px]"
            >
              <motion.div
                id="security"
                whileHover={hoverLift}
                transition={hoverSpring}
                className={`relative overflow-hidden rounded-[28px] border border-slate-900/[.07] bg-white p-[26px] shadow-[0_26px_60px_-46px_rgba(2,4,10,.5)] dark:border-hairline dark:bg-surface ${GLOW_HOVER}`}
              >
                <h2 className="m-0 mb-5 text-[13px] tracking-[.09em] text-slate-400 dark:text-ink-muted">
                  {tAccount("accountSecurityTitle")}
                </h2>
                <TwoFaRow label={tAccount("twoFaTitle")} body={t("twoFaBody")} />
                <div className="flex items-center justify-between gap-5 pt-[18px]">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold tracking-[-.025em]">
                      {tAccount("passwordTitle")}
                    </span>
                    <span className="mt-[5px] block text-[12.5px] text-slate-600 dark:text-ink-muted">
                      {tAccount("lastChanged")}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="flex h-11 items-center justify-center rounded-[14px] border border-slate-900/[.14] px-5 text-[13.5px] font-semibold tracking-[-.015em] transition-colors hover:bg-slate-900/[.05] dark:border-hairline-strong dark:hover:bg-white/10"
                  >
                    {tAccount("changePassword")}
                  </button>
                </div>
              </motion.div>

              <motion.div
                id="shipping"
                whileHover={hoverLift}
                transition={hoverSpring}
                className={`relative overflow-hidden rounded-[28px] border border-slate-900/[.14] bg-white/70 p-[26px] shadow-[0_26px_60px_-46px_rgba(2,4,10,.5)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline-strong dark:bg-glass ${GLOW_HOVER}`}
              >
                <h2 className="m-0 mb-[18px] text-[13px] tracking-[.09em] text-slate-400 dark:text-ink-muted">
                  {t("shippingEyebrow")}
                </h2>
                <div className="text-[15px] font-semibold tracking-[-.025em]">
                  {(preview ? "Office / Workspace" : profile?.defaultAddressTitle) ?? tAccount("fieldEmpty")}
                </div>
                <p className="m-0 mt-2.5 text-[13px] leading-[1.7] text-slate-600 dark:text-ink-muted">
                  {preview ? (
                    <>Dana Mercer<br />Mercer Mechanical<br />{ACCOUNT_PROFILE.fields[3].value}</>
                  ) : (
                    <>
                      {profile?.defaultAddressRecipient ?? displayName}
                      <br />
                      {company ?? "My Energy"}
                      <br />
                      {profile?.defaultAddress ?? tAccount("fieldEmpty")}
                    </>
                  )}
                </p>
                <div className="mt-[18px] flex flex-wrap gap-[9px]">
                  <span className="inline-flex items-center rounded-full bg-blue-700/[.08] px-[11px] py-[5px] text-[11px] font-semibold text-blue-700 dark:bg-blue-600/[.18] dark:text-blue-400">
                    {tCheckout("defaultBadge")}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-900/[.07] bg-slate-100 px-[11px] py-[5px] text-[11px] font-semibold text-slate-600 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted">
                    {t("adrChip")}
                  </span>
                </div>
                <span className="mt-5 inline-flex text-[12.5px] font-semibold text-blue-700 dark:text-blue-400">
                  {t("manageAddresses")}
                </span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* 2FA toggle row — cosmetic local state, matching the design's switch. */
function TwoFaRow({ label, body }: { label: string; body: string }) {
  const [on, setOn] = useState(true);
  return (
    <div className="flex items-center justify-between gap-5 border-b border-slate-900/[.07] pb-[18px] dark:border-hairline">
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold tracking-[-.025em]">{label}</span>
        <span className="mt-[5px] block max-w-[340px] text-[12.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">
          {body}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn((v) => !v)}
        className={`relative h-8 w-[52px] flex-none rounded-full transition-colors duration-300 ${
          on ? "bg-green-600" : "bg-slate-900/[.14] dark:bg-hairline-strong"
        }`}
      >
        <motion.span
          animate={{ x: on ? 20 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="absolute left-[3px] top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,.3)]"
        />
      </button>
    </div>
  );
}
