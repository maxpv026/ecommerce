"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { ArrowRight, Box, Cylinder, FileText, Heart, LayoutDashboard, MapPin, Package, Receipt, Settings, ShieldCheck } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import SmartOrderButton from "@/components/smartOrder/SmartOrderButton";
import { Avatar } from "@/components/AvatarUploader";
import AddressModal from "@/components/AddressModal";
import { PILL, PILL_ON, PRIMARY, SECONDARY, SUMMARY_CARD, EYEBROW, TrustChips } from "@/components/home/ui";
import type { ProfileDashboardData, UserAddress, UserOrder, UserProfileData } from "@/lib/data";
import type { OrderTrackingView } from "@/lib/tracking";
import type { ProfileHubData } from "@/lib/profileHub";
import { PROFILE_TABS, type ProfileTab } from "@/lib/profileTabs";
import OverviewView from "./OverviewView";
import OrdersView from "./OrdersView";
import CylindersView from "./CylindersView";
import AddressesView from "./AddressesView";
import FgasView from "./FgasView";
import QuotesView from "./QuotesView";
import WishlistView from "./WishlistView";
import SecurityView from "./SecurityView";
import ProfileEditor from "./ProfileEditor";

/**
 * /profile on desktop — the buyer's hub, in the Cart / Settings design
 * language: the cart's header bar, then one focused view at a time in the
 * 8 + 4 workspace (the view on the left, the account summary card on the
 * right). Every module is a real one — no preview data, no duplicate blocks.
 * The view lives in the URL (?tab=), so a link can open any of them:
 * /profile?tab=addresses replaces the old /profile#addresses.
 */

export { PROFILE_TABS, type ProfileTab } from "@/lib/profileTabs";

export interface LogbookSummary {
  year: number;
  massKg: number;
  co2eTonnes: number;
  lines: number;
}

export interface ProfileHubProps {
  profile: UserProfileData;
  orders: UserOrder[];
  orderTracking: Record<string, OrderTrackingView>;
  addresses: UserAddress[];
  dashboard: ProfileDashboardData | null;
  logbook: LogbookSummary | null;
  hub: ProfileHubData;
  initialTab: ProfileTab;
}

const TAB_ICON: Record<ProfileTab, typeof Box> = {
  overview: LayoutDashboard,
  orders: Package,
  cylinders: Cylinder,
  addresses: MapPin,
  fgas: ShieldCheck,
  quotes: Receipt,
  favorites: Heart,
  security: Settings,
};

export default function ProfileHub({ profile, orders, orderTracking, addresses, dashboard, logbook, hub, initialTab }: ProfileHubProps) {
  const t = useTranslations("ProfileHub");
  const format = useFormatter();
  const router = useRouter();
  const { data: session } = useSession();
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [editorOpen, setEditorOpen] = useState(false);
  const [addressModal, setAddressModal] = useState<{ address: UserAddress | null } | null>(null);

  // Older links say /profile#addresses (the hash never reaches the server):
  // open that view and mark it for a moment. Deferred a tick — a setState in
  // a timer, not in the effect body.
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!(PROFILE_TABS as readonly string[]).includes(hash)) return;
    const open = window.setTimeout(() => {
      setTab(hash as ProfileTab);
      setHighlight(true);
      document.getElementById("profile-view")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    const done = window.setTimeout(() => setHighlight(false), 2600);
    return () => {
      window.clearTimeout(open);
      window.clearTimeout(done);
    };
  }, []);

  // The view in the URL, without a navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (tab === "overview") params.delete("tab");
    else params.set("tab", tab);
    params.delete("section");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash === `#${tab}` ? window.location.hash : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
  }, [tab]);

  const name = profile.name || session?.user?.name || profile.email || "";
  const initials = hub.preferences.avatarInitials || name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "•";
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const inTransit = dashboard?.activeShipments ?? orders.filter((o) => o.status === "IN_TRANSIT").length;
  const fgasId = profile.fgas?.status === "VERIFIED" ? profile.fgas.certificateNumber : null;
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });

  const meta = [
    profile.email,
    profile.companyName || (fgasId ? `F-Gas ${fgasId}` : null),
    t("metaDelivered", { count: delivered }),
    t("metaCylinders", { count: hub.fleet.inPossession }),
    "EUR (€)",
  ].filter(Boolean);

  const counts: Partial<Record<ProfileTab, number>> = {
    orders: orders.length,
    cylinders: hub.fleet.inPossession,
    addresses: addresses.length,
    quotes: hub.quotes.length,
    favorites: hub.favorites.length,
  };

  const onSaved = () => {
    toast.success(t("savedToast"));
    router.refresh();
  };

  return (
    <div className="relative overflow-x-clip">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[220px] right-[-8%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_66%)] opacity-[.2] blur-[120px]" />
        <div className="absolute left-[-10%] top-[180px] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,var(--orb-violet),rgba(124,58,237,0)_66%)] opacity-[.16] blur-[120px]" />
      </div>

      <main className="relative mx-auto max-w-7xl px-8 pb-24 pt-9" data-profile-hub>
        {/* ── Header bar (cart layout) ── */}
        {/* Title and pills share the row; the meta line wraps inside its column rather than pushing the pills down. */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 lg:flex-nowrap" data-profile-header>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[34px] font-semibold leading-[1.1] tracking-[-.04em]">{t("title", { name })}</h1>
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-slate-500 tabular-nums dark:text-ink-muted" data-profile-meta>
              {meta.join(" · ")}
            </p>
          </div>
          <div className="flex flex-none flex-wrap items-center gap-2 lg:pt-1">
            <Link href="/notifications" className={PILL} data-profile-action="settings">
              {t("settingsSecurity")}
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
            <SmartOrderButton variant="pill" source="dashboard" label={t("importBom")} className="min-h-[38px] px-3.5" />
            <Link href="/products" className={PILL} data-profile-action="catalog">
              {t("toCatalog")}
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
          </div>
        </div>

        {/* ── Section tabs ── */}
        <nav className="mb-6 flex flex-wrap items-center gap-2" role="tablist" aria-label={t("sectionsLabel")} data-profile-tabs>
          {PROFILE_TABS.map((id) => {
            const Icon = TAB_ICON[id];
            const on = tab === id;
            const n = counts[id];
            return (
              <button key={id} type="button" role="tab" aria-selected={on} onClick={() => setTab(id)} data-profile-tab={id} className={on ? PILL_ON : PILL}>
                <Icon size={15} strokeWidth={2} />
                {t(`tab_${id}`)}
                {n !== undefined && n > 0 && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-white/15 dark:bg-slate-900/10" : "bg-slate-900/[.06] dark:bg-white/[.08]"}`}>{n}</span>}
              </button>
            );
          })}
          <Link href="/profile/docs" className={PILL} data-profile-tab="documents">
            <FileText size={15} strokeWidth={2} />
            {t("tab_documents")}
            <ArrowRight size={13} strokeWidth={2.2} />
          </Link>
        </nav>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <section
            id="profile-view"
            className={`min-w-0 scroll-mt-24 rounded-[22px] transition-shadow duration-500 lg:col-span-8 ${highlight ? "ring-2 ring-blue-500/60 ring-offset-2 ring-offset-transparent" : ""}`}
            role="tabpanel"
            data-profile-view={tab}
            data-highlight={highlight ? "1" : undefined}
          >
            {/* The view's own anchor: /profile#addresses lands here once the view is open. */}
            <div id={tab} className="scroll-mt-24" />
            {tab === "overview" && <OverviewView profile={profile} prefs={hub.preferences} onEdit={() => setEditorOpen(true)} />}
            {tab === "orders" && <OrdersView orders={orders} tracking={orderTracking} />}
            {tab === "cylinders" && <CylindersView fleet={hub.fleet} addresses={addresses} pickup={hub.pickup} iban={hub.preferences.depositIban} onEdit={() => setEditorOpen(true)} />}
            {tab === "addresses" && <AddressesView addresses={addresses} onEdit={(address) => setAddressModal({ address })} />}
            {tab === "fgas" && <FgasView profile={profile} logbook={logbook} />}
            {tab === "quotes" && <QuotesView quotes={hub.quotes} />}
            {tab === "favorites" && <WishlistView products={hub.favorites} />}
            {tab === "security" && <SecurityView security={hub.security} />}
          </section>

          {/* ── Account summary (the cart's summary card) ── */}
          <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4" data-profile-summary>
            <div className={SUMMARY_CARD}>
              <div className="flex items-center gap-3">
                <Avatar avatarUrl={profile.avatarUrl ?? null} initials={initials} tone={hub.preferences.avatarTone} size={48} className="text-[15px]" />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold tracking-[-.02em]">{name}</div>
                  <div className="truncate text-[12px] text-slate-500 dark:text-ink-muted">{[profile.jobTitle, profile.companyName].filter(Boolean).join(" · ") || profile.email}</div>
                </div>
              </div>
              <h2 className={`${EYEBROW} mt-5`}>{t("summaryEyebrow")}</h2>
              <dl className="m-0 mt-3 flex flex-col gap-2.5 text-[13px]">
                {[
                  { k: "delivered", label: t("sumDelivered"), value: String(delivered) },
                  { k: "transit", label: t("sumTransit"), value: String(inTransit) },
                  { k: "cylinders", label: t("sumCylinders"), value: hub.fleet.inPossession > 0 ? `${hub.fleet.inPossession} · ${hub.fleet.refundableIsEstimate ? "≈ " : ""}${eur(hub.fleet.refundable)}` : "0" },
                  { k: "co2e", label: t("sumCo2e", { year: logbook?.year ?? new Date().getUTCFullYear() }), value: logbook ? t("tonnes", { value: format.number(logbook.co2eTonnes, { maximumFractionDigits: 2 }) }) : "—" },
                ].map((row) => (
                  <div key={row.k} className="flex items-baseline justify-between gap-3" data-summary-row={row.k}>
                    <dt className="text-slate-600 dark:text-ink-muted">{row.label}</dt>
                    <dd className="m-0 font-semibold tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4">
                {profile.fgas?.status === "VERIFIED" ? (
                  <button type="button" onClick={() => setTab("fgas")} role="status" data-fgas-verified className="flex w-full items-start gap-2 rounded-[16px] border border-emerald-500/30 bg-emerald-500/10 py-2.5 pl-3 pr-3.5 text-left text-[11.5px] font-semibold leading-[1.45] text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck size={13} strokeWidth={2.2} className="mt-[2px] flex-none" />
                    <span className="min-w-0 flex-1">
                      {profile.fgas.certificateNumber && profile.fgas.expiresAt
                        ? t("fgasVerifiedUntil", { number: profile.fgas.certificateNumber, date: format.dateTime(new Date(profile.fgas.expiresAt), { dateStyle: "medium", timeZone: "UTC" }) })
                        : t("fgasVerified")}
                    </span>
                  </button>
                ) : (
                  <button type="button" onClick={() => setTab("fgas")} data-fgas-attention className="flex w-full items-start gap-2 rounded-[16px] border border-amber-500/30 bg-amber-500/10 py-2.5 pl-3 pr-3.5 text-left text-[11.5px] font-semibold leading-[1.45] text-amber-800 dark:text-amber-300">
                    <ShieldCheck size={13} strokeWidth={2.2} className="mt-[2px] flex-none" />
                    <span className="min-w-0 flex-1">{t("fgasAttention")}</span>
                  </button>
                )}
              </div>

              <Link href="/products" className={`mt-4 ${PRIMARY}`} data-summary-catalog>
                {t("toCatalog")}
                <ArrowRight size={17} strokeWidth={2} />
              </Link>
              <button type="button" onClick={() => setEditorOpen(true)} className={`mt-2 ${SECONDARY}`} data-edit-profile>
                {t("editProfile")}
              </button>
              <TrustChips />
            </div>
          </aside>
        </div>
      </main>

      {editorOpen && <ProfileEditor profile={profile} prefs={hub.preferences} initials={initials} onClose={() => setEditorOpen(false)} onSaved={onSaved} />}
      <AddressModal
        key={addressModal ? (addressModal.address?.id ?? "new") : "closed"}
        open={addressModal !== null}
        address={addressModal?.address ?? null}
        onClose={() => setAddressModal(null)}
        onSaved={() => {
          setAddressModal(null);
          onSaved();
        }}
      />
    </div>
  );
}
