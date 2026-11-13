"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, BellRing, Scale } from "lucide-react";
import { Link } from "@/i18n/navigation";
import AuthModal from "@/components/AuthModal";
import { PILL } from "@/components/home/ui";
import type { HubAlert, HubData, HubInsight } from "@/lib/hubData";
import { HUB_TABS, type HubTab } from "@/lib/hubTabs";
import Ticker from "./Ticker";
import PriceTerminal from "./PriceTerminal";
import DigestFeed from "./DigestFeed";
import PortfolioCard from "./PortfolioCard";
import CompareView from "./CompareView";
import ChallengeView from "./ChallengeView";
import { TAB_OFF, TAB_ON } from "./shared";

/**
 * /hub — the market hub, in the Cart / Profile design language: the cart's
 * header bar, one row of mode tabs (the mode lives in ?tab=), then each mode
 * as an 8 + 4 workspace.
 */


export default function HubShell({ data, initialTab, initialGas, initialSystem }: { data: HubData; initialTab: HubTab; initialGas?: string; initialSystem?: string }) {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const [tab, setTab] = useState<HubTab>(initialTab);
  const [selected, setSelected] = useState(() => data.index.find((g) => g.mark === initialGas)?.mark ?? data.index.find((g) => g.available)?.mark ?? data.index[0]?.mark ?? "");
  const [alerts, setAlerts] = useState<HubAlert[]>(data.alerts);
  const [insights, setInsights] = useState<HubInsight[]>(data.insights);
  const [authOpen, setAuthOpen] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const [focusAlert, setFocusAlert] = useState(false);

  // The mode in the URL, without a navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (tab === "exchange") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [tab]);

  // "Set up price alerts": open the exchange view, then bring the alert row into view.
  useEffect(() => {
    if (!focusAlert || tab !== "exchange") return;
    const id = window.setTimeout(() => {
      alertRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      alertRef.current?.querySelector<HTMLInputElement>("input[type=range]")?.focus({ preventScroll: true });
      setFocusAlert(false);
    }, 60);
    return () => window.clearTimeout(id);
  }, [focusAlert, tab]);

  const goCompare = () => {
    setTab("compare");
    window.setTimeout(() => document.getElementById("hub-system-input")?.focus(), 60);
  };

  const meta = [
    t("metaIndices"),
    t("metaRegulation"),
    t("metaCompare"),
    data.portfolio ? t("metaPortfolio", { value: format.number(data.portfolio.co2eTonnes, { maximumFractionDigits: 2 }) }) : null,
  ].filter(Boolean);
  const needSignIn = () => setAuthOpen(true);

  return (
    <div className="relative overflow-x-clip">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[220px] right-[-8%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_66%)] opacity-[.2] blur-[120px]" />
        <div className="absolute left-[-10%] top-[180px] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,var(--orb-violet),rgba(124,58,237,0)_66%)] opacity-[.16] blur-[120px]" />
      </div>

      <main className="relative mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-8 md:pb-24 md:pt-9" data-market-hub>
        {/* ── Header bar (cart layout) ── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 lg:flex-nowrap" data-hub-header>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-.04em] sm:text-[34px]">{t("title")}</h1>
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-slate-500 tabular-nums dark:text-ink-muted" data-hub-meta>
              {meta.join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full sm:flex-none lg:pt-1">
            <button
              type="button"
              className={PILL}
              onClick={() => {
                setTab("exchange");
                setFocusAlert(true);
              }}
              data-hub-action="alerts"
            >
              <BellRing size={14} strokeWidth={2.2} />
              {t("actionAlerts")}
            </button>
            <button type="button" className={PILL} onClick={goCompare} data-hub-action="compare">
              <Scale size={14} strokeWidth={2.2} />
              {t("actionCompare")}
            </button>
            <Link href="/products" className={PILL} data-hub-action="catalog">
              {t("toCatalog")}
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
          </div>
        </div>

        {/* ── Mode tabs: one row; scrolls sideways rather than wrapping ── */}
        <nav className="-mx-1 mb-6 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={t("modesLabel")} data-hub-tabs>
          {HUB_TABS.map((id) => {
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                data-hub-tab={id}
                className={`inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold tracking-[-.01em] transition-colors ${tab === id ? TAB_ON : TAB_OFF}`}
              >
                {t(`tab_${id}`)}
              </button>
            );
          })}
        </nav>

        <div role="tabpanel" data-hub-view={tab}>
          {tab === "exchange" && (
            <div className="flex flex-col gap-6">
              {data.index.length > 0 ? (
                <Ticker index={data.index} history={data.history} selected={selected} onSelect={setSelected} />
              ) : (
                <p className="m-0 text-[13px] text-slate-500">{t("tickerEmpty")}</p>
              )}
              <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
                <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
                  <PriceTerminal
                    index={data.index}
                    history={data.history}
                    historyStart={data.historyStart}
                    selected={selected}
                    alerts={alerts}
                    signedIn={data.signedIn}
                    onNeedSignIn={needSignIn}
                    onAlertsChange={setAlerts}
                    alertRef={alertRef}
                  />
                  <DigestFeed data={data} insights={insights} onInsights={setInsights} limit={4} onShowAll={() => setTab("digest")} onNeedSignIn={needSignIn} compact />
                </div>
                <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4">
                  <PortfolioCard portfolio={data.portfolio} signedIn={data.signedIn} history={data.history} onCompare={goCompare} onNeedSignIn={needSignIn} />
                </aside>
              </div>
            </div>
          )}
          {tab === "compare" && <CompareView index={data.index} initialText={initialSystem} />}
          {tab === "challenge" && <ChallengeView />}
          {tab === "digest" && (
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
              <div className="min-w-0 lg:col-span-8">
                <DigestFeed data={data} insights={insights} onInsights={setInsights} onNeedSignIn={needSignIn} />
              </div>
              <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4">
                <PortfolioCard portfolio={data.portfolio} signedIn={data.signedIn} history={data.history} onCompare={goCompare} onNeedSignIn={needSignIn} />
              </aside>
            </div>
          )}
        </div>
      </main>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} callbackUrl="/hub" />
    </div>
  );
}
