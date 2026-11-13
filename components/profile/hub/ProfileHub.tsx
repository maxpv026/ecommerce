"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Box, Cylinder, FileText, Heart, LayoutDashboard, MapPin, Package, Receipt, Settings, ShieldCheck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import AddressModal from "@/components/AddressModal";
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
import DocumentsView, { DOC_FILTERS, documentCount, type DocFilter } from "./DocumentsView";
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
  /** ?docs= — which document group the Documents tab opens on. */
  initialDocFilter?: string;
}

const TAB_ICON: Record<ProfileTab, typeof Box> = {
  overview: LayoutDashboard,
  orders: Package,
  cylinders: Cylinder,
  addresses: MapPin,
  fgas: ShieldCheck,
  quotes: Receipt,
  favorites: Heart,
  documents: FileText,
  security: Settings,
};

export default function ProfileHub({ profile, orders, orderTracking, addresses, dashboard, logbook, hub, initialTab, initialDocFilter }: ProfileHubProps) {
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
    if (tab !== "documents") params.delete("docs");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash === `#${tab}` ? window.location.hash : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
  }, [tab]);

  const name = profile.name || session?.user?.name || profile.email || "";
  const initials = hub.preferences.avatarInitials || name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "•";
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const inTransit = dashboard?.activeShipments ?? orders.filter((o) => o.status === "IN_TRANSIT").length;
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });


  const counts: Partial<Record<ProfileTab, number>> = {
    orders: orders.length,
    cylinders: hub.fleet.inPossession,
    addresses: addresses.length,
    quotes: hub.quotes.length,
    favorites: hub.favorites.length,
    documents: documentCount(hub.documents, Boolean(profile.certificateDocumentHref)),
  };
  const docFilter: DocFilter = (DOC_FILTERS as readonly string[]).includes(initialDocFilter ?? "") ? (initialDocFilter as DocFilter) : "all";

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
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-slate-500 dark:text-ink-muted" data-profile-meta>
              {t("lead")}
            </p>
          </div>
          {/* No header action: "Edit profile" sits in the Overview panel, where the details it edits are. */}
        </div>

        {/* ── Section tabs ── */}
        {/* One row: all nine views. Never wraps — on a narrow window it scrolls sideways instead. */}
        <nav className="-mx-1 mb-6 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={t("sectionsLabel")} data-profile-tabs>
          {PROFILE_TABS.map((id) => {
            const Icon = TAB_ICON[id];
            const on = tab === id;
            const n = counts[id];
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(id)}
                data-profile-tab={id}
                className={`inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold tracking-[-.01em] transition-colors ${
                  on
                    ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900"
                    : "border-slate-900/[.12] bg-white/70 text-slate-800 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 dark:hover:bg-white/[.09]"
                }`}
              >
                <Icon size={14} strokeWidth={2} />
                {t(`tab_${id}`)}
                {n !== undefined && n > 0 && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-white/15 dark:bg-slate-900/10" : "bg-slate-900/[.06] dark:bg-white/[.08]"}`}>{n}</span>}
              </button>
            );
          })}
        </nav>

        {/* Full width: the account numbers live in the Overview tab only — the buyer's
            summary card (F-Gas status, trust chips, checkout) belongs to /cart. */}
        <section
          id="profile-view"
          className={`min-w-0 scroll-mt-24 rounded-[22px] transition-shadow duration-500 ${highlight ? "ring-2 ring-blue-500/60 ring-offset-2 ring-offset-transparent" : ""}`}
          role="tabpanel"
          data-profile-view={tab}
          data-highlight={highlight ? "1" : undefined}
        >
          {/* The view's own anchor: /profile#addresses lands here once the view is open. */}
          <div id={tab} className="scroll-mt-24" />
          {tab === "overview" && (
            <dl className="m-0 mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4" data-profile-stats>
              {[
                { k: "delivered", label: t("sumDelivered"), value: String(delivered) },
                { k: "transit", label: t("sumTransit"), value: String(inTransit) },
                { k: "cylinders", label: t("sumCylinders"), value: hub.fleet.inPossession > 0 ? `${hub.fleet.inPossession} · ${hub.fleet.refundableIsEstimate ? "≈ " : ""}${eur(hub.fleet.refundable)}` : "0" },
                { k: "co2e", label: t("sumCo2e", { year: logbook?.year ?? new Date().getUTCFullYear() }), value: logbook ? t("tonnes", { value: format.number(logbook.co2eTonnes, { maximumFractionDigits: 2 }) }) : "—" },
              ].map((row) => (
                <div key={row.k} className="rounded-[22px] border border-slate-900/[.08] bg-white/75 p-5 dark:border-white/[.08] dark:bg-white/[.03]" data-summary-row={row.k}>
                  <dt className="text-[12.5px] text-slate-500 dark:text-ink-muted">{row.label}</dt>
                  <dd className="m-0 mt-1.5 text-[22px] font-semibold tracking-[-.03em] tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {tab === "overview" && <OverviewView profile={profile} prefs={hub.preferences} onEdit={() => setEditorOpen(true)} />}
          {tab === "orders" && <OrdersView orders={orders} tracking={orderTracking} />}
          {tab === "cylinders" && <CylindersView fleet={hub.fleet} addresses={addresses} pickup={hub.pickup} iban={hub.preferences.depositIban} onEdit={() => setEditorOpen(true)} />}
          {tab === "addresses" && <AddressesView addresses={addresses} onEdit={(address) => setAddressModal({ address })} />}
          {tab === "fgas" && <FgasView profile={profile} logbook={logbook} />}
          {tab === "quotes" && <QuotesView quotes={hub.quotes} />}
          {tab === "favorites" && <WishlistView products={hub.favorites} />}
          {tab === "documents" && <DocumentsView docs={hub.documents} profile={profile} logbook={logbook} initialFilter={docFilter} />}
          {tab === "security" && <SecurityView security={hub.security} />}
        </section>
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
