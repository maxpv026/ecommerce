"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, BellRing, Check, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MicroBadge, ROW_ACTION_GHOST, ROW_ACTION_PRIMARY, SURFACE } from "@/components/home/ui";
import { HFC_QUOTA, REGULATION_SOURCE } from "@/lib/regulation";
import { deletePriceAlert, savePriceAlert } from "@/lib/actions/hub";
import type { GasIndex, PricePoint } from "@/lib/priceHistory";
import type { HubAlert } from "@/lib/hubData";
import { chip } from "./shared";

/**
 * Tab 1's terminal: the price-index line for the selected gas over 1M / 3M /
 * 1Y — drawn ONLY from recorded snapshots (lib/priceHistory), so a young
 * record shows as a short line with its start date, never a made-up curve —
 * and the EU HFC quota schedule (Annex VII, the legal cap, not a forecast).
 * Below: the target-price alert and the buy link at today's index.
 */

const FRAMES = [
  { id: "1m", days: 31 },
  { id: "3m", days: 92 },
  { id: "1y", days: 366 },
  { id: "quota", days: 0 },
] as const;
type Frame = (typeof FRAMES)[number]["id"];

const H = 228;
const PAD = { top: 16, right: 14, bottom: 26, left: 52 };
/** Left gutter wide enough for the longest y-axis label ("15,60 EUR", "42,9 млн т") at 11px. */
const gutter = (labels: string[]) => Math.max(PAD.left, Math.ceil(Math.max(...labels.map((l) => l.length)) * 6.6) + 14);

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export default function PriceTerminal({
  index,
  history,
  historyStart,
  selected,
  alerts,
  signedIn,
  onNeedSignIn,
  onAlertsChange,
  alertRef,
}: {
  index: GasIndex[];
  history: Record<string, PricePoint[]>;
  historyStart: string | null;
  selected: string;
  alerts: HubAlert[];
  signedIn: boolean;
  onNeedSignIn: () => void;
  onAlertsChange: (next: HubAlert[]) => void;
  alertRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const [frame, setFrame] = useState<Frame>("1m");
  const gas = index.find((g) => g.mark === selected) ?? index[0];
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  if (!gas) return null;
  const series = history[gas.mark] ?? [];

  return (
    <div className={SURFACE} data-hub-terminal={gas.mark}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-900/[.06] px-5 py-4 dark:border-white/[.06]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[17px] font-semibold tracking-[-.025em]">{t("terminalTitle", { gas: gas.label })}</h2>
            <MicroBadge tone={gas.available ? "ok" : "muted"}>{gas.available ? t("available") : t("unavailable")}</MicroBadge>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-slate-500 dark:text-ink-muted">
            <span className="text-[26px] font-semibold tracking-[-.03em] text-slate-900 tabular-nums dark:text-white" data-hub-index-price>
              {eur(gas.perKg)}
            </span>
            <span className="text-[12.5px]">{t("perKgFrom", { sizes: gas.sizes })}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("timeframe")} data-hub-frames>
          {FRAMES.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={frame === f.id} onClick={() => setFrame(f.id)} className={chip(frame === f.id)} data-hub-frame={f.id}>
              {t(`frame_${f.id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="hub-viz px-3 pb-2 pt-3 sm:px-4">
        {frame === "quota" ? (
          <QuotaChart />
        ) : (
          <PriceLine points={series} days={FRAMES.find((f) => f.id === frame)!.days} eur={eur} day={day} historyStart={historyStart} current={gas.perKg} />
        )}
      </div>

      <div className="border-t border-slate-900/[.06] px-5 py-2.5 text-[11.5px] leading-[1.5] text-slate-500 dark:border-white/[.06] dark:text-ink-muted" data-hub-chart-note>
        {frame === "quota" ? (
          <>
            {t("quotaNote")}{" "}
            <a href={REGULATION_SOURCE} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 hover:underline dark:text-blue-400">
              EUR-Lex 2024/573
            </a>
          </>
        ) : historyStart ? (
          t("historyNote", { date: day(historyStart) })
        ) : (
          t("historyNone")
        )}
      </div>

      <AlertRow gas={gas} alerts={alerts} signedIn={signedIn} onNeedSignIn={onNeedSignIn} onAlertsChange={onAlertsChange} alertRef={alertRef} eur={eur} />
    </div>
  );
}

function PriceLine({ points, days, eur, day, historyStart, current }: { points: PricePoint[]; days: number; eur: (n: number) => string; day: (iso: string) => string; historyStart: string | null; current: number }) {
  const t = useTranslations("MarketHub");
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  // The window ends at the latest recorded day (the cron records daily), so
  // the render is the same on the server and in the browser.
  const shown = useMemo(() => {
    const last = points[points.length - 1];
    if (!last) return [];
    const since = new Date(Date.parse(`${last.day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
    return points.filter((p) => p.day >= since);
  }, [points, days]);

  const values = shown.length ? shown.map((p) => p.perKg) : [current];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 0.01) {
    lo = lo * 0.95;
    hi = hi * 1.05;
  } else {
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
  }
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
  const left = gutter(ticks.map(eur));
  const innerW = Math.max(0, width - left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => left + (shown.length <= 1 ? innerW / 2 : (i / (shown.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;
  const path = shown.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.perKg).toFixed(1)}`).join(" ");
  const hp = hover !== null ? shown[hover] : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (shown.length === 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - box.left) / Math.max(1, box.width);
    setHover(Math.max(0, Math.min(shown.length - 1, Math.round(rel * (shown.length - 1)))));
  };

  return (
    <div ref={ref} className="relative" style={{ height: H }} data-hub-chart="price" data-points={shown.length}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={t("chartAria", { n: shown.length })} className="block">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--hv-grid)" />
              <text x={left - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--hv-axis)" className="tabular-nums">
                {eur(v)}
              </text>
            </g>
          ))}
          {shown.length > 1 && <path d={path} fill="none" stroke="var(--hv-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {shown.length === 1 && <circle cx={x(0)} cy={y(shown[0]!.perKg)} r={5} fill="var(--hv-1)" stroke="var(--surface-1, #fff)" strokeWidth={2} />}
          {shown.length > 0 && (
            <>
              <text x={left} y={H - 6} fontSize="11" fill="var(--hv-axis)">
                {day(shown[0]!.day)}
              </text>
              {shown.length > 1 && (
                <text x={width - PAD.right} y={H - 6} fontSize="11" fill="var(--hv-axis)" textAnchor="end">
                  {day(shown[shown.length - 1]!.day)}
                </text>
              )}
            </>
          )}
          {hp && hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--hv-axis)" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(hp.perKg)} r={5} fill="var(--hv-1)" stroke="#fff" strokeWidth={2} />
            </g>
          )}
          <rect x={left} y={PAD.top} width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hp && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-[10px] border border-slate-900/[.1] bg-white px-2.5 py-1.5 text-[12px] shadow-lg dark:border-white/[.12] dark:bg-[#151821]"
          style={{ left: Math.min(Math.max(x(hover), 70), width - 70) }}
          data-hub-tooltip
        >
          <div className="text-slate-500 dark:text-ink-muted">{day(hp.day)}</div>
          <div className="font-semibold tabular-nums">{t("perKgValue", { value: eur(hp.perKg) })}</div>
        </div>
      )}
      {shown.length < 2 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-9 flex justify-center px-4">
          <p className="m-0 max-w-[46ch] rounded-full border border-slate-900/[.08] bg-white/85 px-3 py-1.5 text-center text-[12px] text-slate-600 backdrop-blur dark:border-white/[.1] dark:bg-black/40 dark:text-slate-300" data-hub-chart-young>
            {historyStart ? t("historyYoung", { date: day(historyStart), n: shown.length }) : t("historyNone")}
          </p>
        </div>
      )}
    </div>
  );
}

function QuotaChart() {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const year = new Date().getUTCFullYear();
  const max = HFC_QUOTA[0]!.tonnes;
  const mt = (n: number) => format.number(n / 1e6, { maximumFractionDigits: 1 });
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const left = gutter(ticks.map((v) => t("mtShort", { value: mt(v) })));
  const innerW = Math.max(0, width - left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / HFC_QUOTA.length;
  const barW = Math.max(6, Math.min(44, band - 6));
  const label = (q: (typeof HFC_QUOTA)[number]) => (q.from === q.to ? `${q.from}+` : `${q.from}–${String(q.to).slice(2)}`);
  const h = hover !== null ? HFC_QUOTA[hover] : null;

  return (
    <div ref={ref} className="relative" style={{ height: H }} data-hub-chart="quota">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={t("quotaAria")} className="block">
          {ticks.map((v) => {
            const yy = PAD.top + innerH - (v / max) * innerH;
            return (
              <g key={v}>
                <line x1={left} x2={width - PAD.right} y1={yy} y2={yy} stroke="var(--hv-grid)" />
                <text x={left - 8} y={yy} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--hv-axis)">
                  {t("mtShort", { value: mt(v) })}
                </text>
              </g>
            );
          })}
          {HFC_QUOTA.map((q, i) => {
            const bh = Math.max(q.tonnes > 0 ? 2 : 0, (q.tonnes / max) * innerH);
            const cx = left + band * i + band / 2;
            const now = year >= q.from && year <= q.to;
            const showLabel = now || q.from === 2027 || q.from === 2030 || q.tonnes === 0;
            return (
              <g key={q.from} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
                {bh > 0 && <path d={roundedTop(cx - barW / 2, PAD.top + innerH - bh, barW, bh, 4)} fill="var(--hv-1)" opacity={now || hover === i ? 1 : 0.55} />}
                {showLabel && (
                  <text x={cx} y={PAD.top + innerH - bh - 6} textAnchor="middle" fontSize="11" fontWeight={600} fill="currentColor" className="tabular-nums">
                    {q.tonnes === 0 ? "0" : mt(q.tonnes)}
                  </text>
                )}
                {(width > 520 || i % 2 === 0) && (
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--hv-axis)">
                    {label(q)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-[10px] border border-slate-900/[.1] bg-white px-2.5 py-1.5 text-[12px] shadow-lg dark:border-white/[.12] dark:bg-[#151821]"
          style={{ left: Math.min(Math.max(left + band * hover + band / 2, 80), width - 80) }}
        >
          <div className="text-slate-500 dark:text-ink-muted">{h.from === h.to ? t("quotaFrom", { year: h.from }) : `${h.from}–${h.to}`}</div>
          <div className="font-semibold tabular-nums">{t("tonnesCo2e", { value: format.number(h.tonnes) })}</div>
        </div>
      )}
    </div>
  );
}

/** A bar with 4px rounded top corners, square at the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function AlertRow({
  gas,
  alerts,
  signedIn,
  onNeedSignIn,
  onAlertsChange,
  alertRef,
  eur,
}: {
  gas: GasIndex;
  alerts: HubAlert[];
  signedIn: boolean;
  onNeedSignIn: () => void;
  onAlertsChange: (next: HubAlert[]) => void;
  alertRef: React.RefObject<HTMLDivElement | null>;
  eur: (n: number) => string;
}) {
  const t = useTranslations("MarketHub");
  const existing = alerts.find((a) => a.mark === gas.mark) ?? null;
  const min = Math.floor(gas.perKg * 0.6 * 10) / 10;
  const max = Math.ceil(gas.perKg * 1.1 * 10) / 10;
  const [draft, setDraft] = useState<{ mark: string; value: number } | null>(null);
  const value = draft?.mark === gas.mark ? draft.value : (existing?.targetPerKg ?? Math.round(gas.perKg * 0.9 * 10) / 10);
  const [pending, start] = useTransition();
  const pct = Math.round(((value - gas.perKg) / gas.perKg) * 100);
  const fill = ((value - min) / Math.max(0.01, max - min)) * 100;
  const saved = existing && Math.abs(existing.targetPerKg - value) < 0.005 && !existing.triggeredAt;

  const save = () => {
    if (!signedIn) return onNeedSignIn();
    start(async () => {
      const res = await savePriceAlert({ mark: gas.mark, targetPerKg: value });
      if (!res.ok) {
        toast.error(t("alertError"));
        return;
      }
      onAlertsChange([...alerts.filter((a) => a.mark !== gas.mark), { mark: gas.mark, targetPerKg: res.targetPerKg, triggeredAt: null }]);
      toast.success(t("alertSaved", { gas: gas.label, price: eur(res.targetPerKg) }));
    });
  };
  const remove = () =>
    start(async () => {
      const res = await deletePriceAlert(gas.mark);
      if (res.ok) {
        onAlertsChange(alerts.filter((a) => a.mark !== gas.mark));
        setDraft(null);
      }
    });

  return (
    <div ref={alertRef} className="scroll-mt-28 border-t border-slate-900/[.06] px-5 py-4 dark:border-white/[.06]" data-hub-alert={gas.mark}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[-.015em]">
          <BellRing size={15} strokeWidth={2} className="text-blue-700 dark:text-blue-400" />
          {t("alertTitle")}
        </div>
        {existing && (
          <MicroBadge tone={existing.triggeredAt ? "ok" : "info"} data-hub-alert-state={existing.triggeredAt ? "reached" : "armed"}>
            {existing.triggeredAt ? t("alertReached", { price: eur(existing.targetPerKg) }) : t("alertArmed", { price: eur(existing.targetPerKg) })}
          </MicroBadge>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-[220px] flex-1">
          <input
            type="range"
            min={min}
            max={max}
            step={0.1}
            value={value}
            onChange={(e) => setDraft({ mark: gas.mark, value: Number(e.target.value) })}
            aria-label={t("alertSliderAria", { gas: gas.label })}
            className="hc-range w-full"
            style={{ background: `linear-gradient(90deg, var(--brand-700, #1d4ed8) ${fill}%, rgba(100,116,139,.25) ${fill}%)` }}
            data-hub-alert-slider
          />
          <div className="mt-1.5 text-[12.5px] text-slate-600 tabular-nums dark:text-slate-300" data-hub-alert-text>
            {t("alertWhen", { gas: gas.label, price: eur(value), pct: `${pct > 0 ? "+" : ""}${pct}` })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={save} disabled={pending || Boolean(saved)} className={saved ? `${ROW_ACTION_GHOST} opacity-80` : ROW_ACTION_PRIMARY} data-hub-alert-save>
            {saved ? <Check size={14} strokeWidth={2.4} /> : <BellRing size={14} strokeWidth={2.2} />}
            {saved ? t("alertSavedShort") : t("alertSave")}
          </button>
          {existing && (
            <button type="button" onClick={remove} disabled={pending} className={ROW_ACTION_GHOST} aria-label={t("alertRemove")} data-hub-alert-remove>
              <Trash2 size={14} strokeWidth={2.2} />
            </button>
          )}
          <Link href={`/products/${gas.productId}`} className={ROW_ACTION_GHOST} data-hub-buy>
            {t("buyNow", { price: eur(gas.perKg) })}
            <ArrowRight size={14} strokeWidth={2.4} />
          </Link>
        </div>
      </div>
    </div>
  );
}
