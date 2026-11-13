"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Check, CircleAlert, CircleCheck, CircleX, Loader2, Search, ShoppingCart, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EYEBROW, MicroBadge, PRIMARY, SUMMARY_CARD, SURFACE, safetyTone, type BadgeTone } from "@/components/home/ui";
import { SurfaceHead } from "@/components/profile/hub/parts";
import { useCartStore } from "@/lib/store/cart";
import { PT_BY_LABEL } from "@/lib/refrigerantPT";
import { regulationStatus } from "@/lib/regulation";
import {
  COMPARE_GASES,
  GWP_REFERENCE,
  RETROFIT_GWP,
  SAFETY,
  SYSTEM_PRESETS,
  identifySystem,
  oilFor,
  pressureAt45,
  profileFromClassification,
  verdictFor,
  type CompareGas,
  type SystemProfile,
  type Verdict,
} from "@/lib/systemCompat";
import { classifySystem } from "@/lib/actions/hub";
import type { GasIndex } from "@/lib/priceHistory";
import { chip, labelMark } from "./shared";

/**
 * Tab 2: compare refrigerants and match them to a vehicle or system.
 *
 * Every verdict comes from lib/systemCompat's rules, computed in the browser
 * as the buyer types (0 tokens). Only a description those rules can't place
 * is sent — on Enter / the button, never per keystroke — to the cached
 * classifier, and even then the model only names the kind of system; the
 * verdicts are still the rules.
 */

const DEFAULT_GASES: CompareGas[] = ["R-1234yf", "R-134a", "R-32", "R-410A", "R-404A"];
const MAX_GASES = 5;

const VERDICT_TONE: Record<Verdict, BadgeTone> = { ok: "ok", conditional: "warn", no: "bad", unknown: "muted" };
const VerdictIcon = ({ v }: { v: Verdict }) =>
  v === "ok" ? (
    <CircleCheck size={18} strokeWidth={2.2} className="text-emerald-600 dark:text-emerald-400" />
  ) : v === "conditional" ? (
    <CircleAlert size={18} strokeWidth={2.2} className="text-amber-600 dark:text-amber-400" />
  ) : (
    <CircleX size={18} strokeWidth={2.2} className="text-red-600 dark:text-red-400" />
  );

const STATUS_TONE: Record<ReturnType<typeof regulationStatus>, BadgeTone> = { banned2025: "bad", restricted: "warn", phaseout: "info", ok: "ok", unknown: "muted" };

export default function CompareView({ index, initialText = "" }: { index: GasIndex[]; initialText?: string }) {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);
  const [gases, setGases] = useState<CompareGas[]>(DEFAULT_GASES);
  const [text, setText] = useState(initialText);
  const [presetText, setPresetText] = useState<string | null>(null);
  const [ai, setAi] = useState<{ text: string; profile: SystemProfile | null } | null>(null);
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<string | null>(null);

  const query = presetText ?? text;
  const local = useMemo(() => identifySystem(query), [query]);
  const profile = local ?? (ai && ai.text === query ? ai.profile : null);
  const aiMiss = !local && ai?.text === query && ai.profile === null;
  const stock = (gas: string) => index.find((g) => g.mark === labelMark(gas)) ?? null;
  const gwpOf = (gas: string) => stock(gas)?.gwp ?? GWP_REFERENCE[gas as CompareGas] ?? RETROFIT_GWP[gas] ?? null;
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n1 = (n: number) => format.number(n, { maximumFractionDigits: 1 });
  // Small quotas (a car's R-1234yf charge is ~0.002 t CO₂e) keep two significant digits rather than rounding to 0.
  const n2 = (n: number) => (n > 0 && n < 0.1 ? format.number(n, { maximumSignificantDigits: 2 }) : format.number(n, { maximumFractionDigits: 2 }));

  const toggleGas = (g: CompareGas) =>
    setGases((cur) => {
      if (cur.includes(g)) return cur.length <= 2 ? cur : cur.filter((x) => x !== g);
      if (cur.length >= MAX_GASES) {
        toast.message(t("maxGases", { n: MAX_GASES }));
        return cur;
      }
      return COMPARE_GASES.filter((x) => x === g || cur.includes(x));
    });

  const recognise = () => {
    if (local || query.trim().length < 3) return;
    start(async () => {
      const res = await classifySystem(query);
      if (!res.ok) {
        toast.error(res.code === "RATE_LIMITED" ? t("aiRateLimited") : t("aiUnavailable"));
        setAi({ text: query, profile: null });
        return;
      }
      setAi({ text: query, profile: res.value ? profileFromClassification(query, res.value) : null });
    });
  };

  const verdicts = profile ? gases.map((g) => verdictFor(g, profile)) : [];
  const why = (v: ReturnType<typeof verdictFor>) => {
    const values: Record<string, string | number> = { ...v.values, p: n1(Number(v.values.p)), ref: n1(Number(v.values.ref)), ratio: n1(Number(v.values.ratio ?? 0)), oil: t(v.oil) };
    return t(v.why, values);
  };

  // ── Recommendation: the factory gas(es), then the retrofit route ──
  const recs = profile ? [...profile.oem, ...profile.retrofitTo].slice(0, 3) : [];
  const perSystem = (gas: string) => {
    const gwp = gwpOf(gas);
    return profile && gwp !== null ? [(profile.chargeKg[0] * gwp) / 1000, (profile.chargeKg[1] * gwp) / 1000] : null;
  };
  // The cylinder a technician would take: the smallest buyable size (the index size can be an isotank).
  const firstStocked = recs.map((g) => ({ g, s: stock(g)?.service ?? null })).find((x) => x.s) ?? null;

  const addToCart = () => {
    if (!firstStocked?.s) return;
    const s = firstStocked.s;
    addItem({ sku: s.sku, name: s.name, variant: s.variant, pricePerKg: s.perKg, weightKg: s.weightKg, deposit: s.deposit }, 1);
    setAdded(s.sku);
    toast.success(t("addedToCart", { name: s.name }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          <div className={SURFACE} data-hub-compare>
            <SurfaceHead title={t("compareTitle")} meta={[t("compareMeta"), t("compareZeroTokens")]} id="compare" />

            {/* Gases */}
            <div className="border-b border-slate-900/[.06] px-5 py-3.5 dark:border-white/[.06]">
              <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.07em] text-slate-500 dark:text-ink-muted">{t("pickGases", { min: 2, max: MAX_GASES })}</div>
              <div className="flex flex-wrap gap-1.5" data-hub-compare-gases>
                {COMPARE_GASES.map((g) => (
                  <button key={g} type="button" aria-pressed={gases.includes(g)} onClick={() => toggleGas(g)} className={chip(gases.includes(g))} data-hub-gas={g}>
                    {gases.includes(g) && <Check size={12} strokeWidth={2.6} />}
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* System */}
            <div className="border-b border-slate-900/[.06] px-5 py-4 dark:border-white/[.06]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  recognise();
                }}
                className="flex items-center gap-2"
              >
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">{t("systemLabel")}</span>
                  <Search size={16} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setPresetText(null);
                    }}
                    placeholder={t("systemPlaceholder")}
                    maxLength={160}
                    className="h-11 w-full rounded-[14px] border border-slate-900/[.12] bg-white/80 pl-10 pr-3 text-[14px] outline-none transition-colors placeholder:text-slate-400 focus:border-blue-600 dark:border-white/[.14] dark:bg-white/[.04] dark:focus:border-blue-400"
                    data-hub-system-input
                    id="hub-system-input"
                  />
                </label>
                {!local && query.trim().length >= 3 && (
                  <button type="submit" disabled={pending} className="inline-flex h-11 flex-none items-center gap-1.5 rounded-[14px] bg-blue-700 px-4 text-[13px] font-semibold text-white hover:bg-blue-800 disabled:opacity-60" data-hub-ai-recognise>
                    {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} strokeWidth={2.2} />}
                    {t("recognise")}
                  </button>
                )}
              </form>
              <div className="mt-2.5 flex flex-wrap gap-1.5" data-hub-presets>
                {SYSTEM_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setText(t(p.key));
                      setPresetText(p.text);
                    }}
                    className={chip(presetText === p.text)}
                    data-hub-preset={p.key}
                  >
                    {t(p.key)}
                  </button>
                ))}
              </div>
              {profile && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-600 dark:text-slate-300" data-hub-system={profile.kind} data-hub-oem={profile.oem.join(",")}>
                  <MicroBadge tone="info">{t(`kind_${profile.kind}`)}</MicroBadge>
                  <span className="font-semibold">{profile.label}</span>
                  <span className="text-slate-500 dark:text-ink-muted">· {t("factoryGas", { gases: profile.oem.join(" / ") })}</span>
                  <MicroBadge tone="muted">{profile.via === "rules" ? t("viaRules") : t("viaAi")}</MicroBadge>
                </div>
              )}
              {profile?.generationKey && (
                <p className="m-0 mt-2 text-[12.5px] leading-[1.5] text-slate-600 dark:text-slate-300" data-hub-generation>
                  {t(profile.generationKey, { label: profile.label })}
                </p>
              )}
              {!profile && query.trim().length >= 3 && (
                <p className="m-0 mt-3 text-[12.5px] text-slate-500 dark:text-ink-muted" data-hub-unknown>
                  {aiMiss ? t("systemNotFound") : t("systemUnknown")}
                </p>
              )}
            </div>

            {/* Verdicts */}
            {profile ? (
              verdicts.map((v) => (
                <div key={v.gas} className="flex gap-3 border-b border-slate-900/[.06] px-5 py-3.5 last:border-b-0 dark:border-white/[.06]" data-hub-verdict={v.gas} data-verdict={v.verdict}>
                  <span className="mt-0.5 flex-none">
                    <VerdictIcon v={v.verdict} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold tracking-[-.015em]">{v.gas}</span>
                      <MicroBadge tone={VERDICT_TONE[v.verdict]}>{t(`verdict_${v.verdict}`)}</MicroBadge>
                      <span className="text-[11.5px] text-slate-500 dark:text-ink-muted">{t(v.oil)}</span>
                    </div>
                    <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-slate-600 dark:text-slate-300">{why(v)}</p>
                    {v.verdict === "ok" && profile && <ChargeLine gas={v.gas} profile={profile} cylinder={stock(v.gas)?.service ?? null} />}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-5 py-6 text-center text-[13px] text-slate-500 dark:text-ink-muted" data-hub-verdict-empty>
                {t("verdictPrompt")}
              </div>
            )}
          </div>

        </div>

        {/* Recommendation card */}
        <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4" data-hub-recommend>
          <div className={SUMMARY_CARD}>
            <h2 className={EYEBROW}>{t("recEyebrow")}</h2>
            {!profile ? (
              <p className="m-0 mt-3 text-[13px] leading-[1.55] text-slate-600 dark:text-slate-300">{t("recEmpty")}</p>
            ) : (
              <>
                <div className="mt-2 text-[15px] font-semibold tracking-[-.02em]">{profile.label}</div>
                <div className="mt-0.5 text-[12px] text-slate-500 dark:text-ink-muted">
                  {t("typicalCharge", { min: n1(profile.chargeKg[0]), max: n1(profile.chargeKg[1]) })}
                </div>
                <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
                  {recs.map((g, i) => {
                    const s = stock(g)?.service ?? null;
                    const tons = perSystem(g);
                    const retrofit = i >= profile.oem.length;
                    return (
                      <li key={g} className="rounded-[14px] border border-slate-900/[.07] bg-white/60 px-3 py-2.5 dark:border-white/[.08] dark:bg-white/[.03]" data-hub-rec={g}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-semibold">{g}</span>
                          <MicroBadge tone={retrofit ? "warn" : "ok"}>{retrofit ? t("recRetrofit") : t("recFactory")}</MicroBadge>
                          {s ? (
                            <span className="ml-auto text-[12px] font-semibold tabular-nums">{t("cylinderPrice", { kg: n1(s.weightKg), price: eur(s.perKg) })}</span>
                          ) : (
                            <span className="ml-auto text-[11.5px] text-slate-500 dark:text-ink-muted">{stock(g) ? t("unavailable") : t("notStocked")}</span>
                          )}
                        </div>
                        <dl className="m-0 mt-1.5 grid gap-1 text-[12px]">
                          {s && (
                            <div className="flex justify-between gap-2" data-hub-rec-systems>
                              <dt className="text-slate-500 dark:text-ink-muted">{t("systemsPerCylinder", { kg: n1(s.weightKg) })}</dt>
                              <dd className="m-0 font-semibold tabular-nums">
                                {Math.floor(s.weightKg / profile.chargeKg[1])}–{Math.floor(s.weightKg / profile.chargeKg[0])}
                              </dd>
                            </div>
                          )}
                          {tons && (
                            <div className="flex justify-between gap-2" data-hub-rec-quota>
                              <dt className="text-slate-500 dark:text-ink-muted">{t("quotaPerSystem")}</dt>
                              <dd className="m-0 font-semibold tabular-nums">{t("tonnesRange", { min: n2(tons[0]), max: n2(tons[1]) })}</dd>
                            </div>
                          )}
                        </dl>
                      </li>
                    );
                  })}
                </ul>
                {firstStocked?.s ? (
                  <button type="button" onClick={addToCart} className={`${PRIMARY} mt-4 h-auto min-h-12 px-4 py-2.5 text-center leading-[1.3]`} data-hub-add-cart={firstStocked.s.sku}>
                    {added === firstStocked.s.sku ? <Check size={16} strokeWidth={2.4} /> : <ShoppingCart size={16} strokeWidth={2.2} />}
                    {added === firstStocked.s.sku ? t("addedShort", { gas: firstStocked.g, kg: n1(firstStocked.s.weightKg) }) : t("addCylinder", { gas: firstStocked.g, kg: n1(firstStocked.s.weightKg) })}
                  </button>
                ) : (
                  <Link href="/products" className={`${PRIMARY} mt-4`} data-hub-rec-catalog>
                    {t("toCatalog")}
                    <ArrowRight size={16} strokeWidth={2.4} />
                  </Link>
                )}
                <p className="m-0 mt-3 text-[11.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">{t("recNote")}</p>
              </>
            )}
          </div>
        </aside>
      </div>
      {/* Comparison table: full width under the 8 + 4 grid — nine columns need it */}
      <div className={SURFACE} data-hub-compare-table>
        <SurfaceHead title={t("tableTitle")} meta={[t("tableMeta")]} id="compare-table" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-900/[.06] text-[11px] uppercase tracking-[.06em] text-slate-500 dark:border-white/[.06] dark:text-ink-muted">
                {["colGas", "colCompat", "colSafety", "colGwp", "colPressure", "colBoiling", "colOil", "colEu", "colPrice"].map((k) => (
                  <th key={k} className="px-3 py-2.5 font-semibold first:pl-5 last:pr-5">
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gases.map((g) => {
                const v = profile ? verdictFor(g, profile) : null;
                const s = stock(g);
                const gwp = gwpOf(g);
                const status = regulationStatus(gwp);
                const pt = PT_BY_LABEL[g];
                return (
                  <tr key={g} className="border-b border-slate-900/[.06] last:border-b-0 dark:border-white/[.06]" data-hub-row={g}>
                    <td className="whitespace-nowrap px-3 py-3 pl-5 text-[13.5px] font-semibold">{g}</td>
                    <td className="px-3 py-3">{v ? <MicroBadge tone={VERDICT_TONE[v.verdict]}>{t(`verdictShort_${v.verdict}`)}</MicroBadge> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-3">
                      <MicroBadge tone={safetyTone(SAFETY[g])}>{SAFETY[g]}</MicroBadge>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{gwp !== null ? format.number(gwp) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{t("barG", { value: n1(pressureAt45(g) ?? 0) })}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{pt ? `${n1(pt.nbpC)} °C` : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3">{t(oilFor(g, profile?.kind ?? null))}</td>
                    <td className="px-3 py-3">
                      <MicroBadge tone={STATUS_TONE[status]}>{t(`eu_${status}`)}</MicroBadge>
                    </td>
                    <td className="px-3 py-3 pr-5">
                      <div className="whitespace-nowrap tabular-nums">{s ? t("fromPerKg", { price: eur(s.perKg) }) : <span className="text-slate-400">{t("notStocked")}</span>}</div>
                      {s && (
                        <Link href={`/products/${s.service?.productId ?? s.productId}`} className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold leading-[1.35] text-blue-700 hover:underline dark:text-blue-400" data-hub-row-cta>
                          {t("pickCylinder")}
                          <ArrowRight size={13} strokeWidth={2.4} />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 border-t border-slate-900/[.06] px-5 py-2.5 text-[11.5px] leading-[1.5] text-slate-500 dark:border-white/[.06] dark:text-ink-muted">{t("tableNote")}</p>
      </div>
    </div>
  );
}

function ChargeLine({ gas, profile, cylinder }: { gas: string; profile: SystemProfile; cylinder: GasIndex["service"] }) {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const n1 = (n: number) => format.number(n, { maximumFractionDigits: 1 });
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px]" data-hub-charge={gas}>
      <MicroBadge tone="muted">{t("typicalCharge", { min: n1(profile.chargeKg[0]), max: n1(profile.chargeKg[1]) })}</MicroBadge>
      {cylinder ? (
        <MicroBadge tone="info" data-hub-charge-systems="">
          {t("cylinderServes", { kg: n1(cylinder.weightKg), min: Math.floor(cylinder.weightKg / profile.chargeKg[1]), max: Math.floor(cylinder.weightKg / profile.chargeKg[0]) })}
        </MicroBadge>
      ) : (
        <MicroBadge tone="muted">{t("notStocked")}</MicroBadge>
      )}
    </div>
  );
}
