import { getFormatter, getTranslations } from "next-intl/server";
import { getTickerRows, type TickerRow } from "@/lib/marketInsights";

/**
 * The rate board across the top of the hub.
 *
 * ── Why there are no arrows and no percentages ──────────────────────────
 *
 * A ticker is a strong visual promise: green up, red down, a number that
 * moved. This one cannot keep it. `Product.pricePerKg` is a single current
 * value — there is no price history table, no snapshot job, nothing to diff
 * against — so "R-404A ▲ 4.2%" would be a number we made up, printed in the
 * one place on the page a buyer would take it literally and act on it.
 *
 * So the promise is scaled to what the data supports: today's rate per kg,
 * the GWP, whether it is at the Art. 13 limit, and whether it is in stock.
 * All four are live facts. The heading says "rates", not "market", for the
 * same reason.
 *
 * Storing a daily price snapshot is the missing input. With one, the arrows
 * become real and this component gets a `change` field — until then it stays
 * a rate board.
 *
 * ── Formatting ─────────────────────────────────────────────────────────
 *
 * Money and figures go through next-intl's formatter rather than a hardcoded
 * "en-IE": "€58.40" is written "58,40 €" in most of the twenty-nine locales
 * this ships in, and a price board that punctuates numbers the reader's way
 * is the difference between a live desk and a translated brochure.
 */

/**
 * Enough copies that the strip is wider than any viewport.
 *
 * The marquee translates by exactly -50%, which is seamless only when the
 * track is two identical halves. With a short catalogue one half can be
 * narrower than the screen, and the loop then drags a visible gap across the
 * card, so the base list is repeated until a half is long enough first.
 */
function buildTrack(rows: TickerRow[]): TickerRow[] {
  if (rows.length === 0) return [];
  const half: TickerRow[] = [];
  while (half.length < 10) half.push(...rows);
  return half;
}

export default async function MarketTicker() {
  const [rows, t, format] = await Promise.all([
    getTickerRows(),
    getTranslations("Hub"),
    getFormatter(),
  ]);
  const half = buildTrack(rows);

  const money = (value: number) =>
    format.number(value, { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

  return (
    <section
      data-hub-ticker
      className="overflow-hidden rounded-[22px] border border-slate-900/[.08] bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass"
      aria-label={t("tickerAria")}
    >
      <header className="flex items-center gap-2.5 border-b border-slate-900/[.05] px-4 py-2.5 dark:border-hairline">
        <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#34d399] shadow-[0_0_8px_1px_#34d399] [animation:hc-glow_2.2s_ease-in-out_infinite] motion-reduce:[animation:none]" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[.09em] text-slate-400 dark:text-ink-muted">
          {t("tickerKicker")}
        </span>
        <span className="ml-auto text-[10.5px] tracking-[.04em] text-slate-400 dark:text-ink-muted">
          {t("tickerUnit")}
        </span>
      </header>

      {half.length > 0 ? (
        /* The mask fades both ends so entries appear and leave rather than
           being visibly clipped at a hard edge. Reduced motion turns the
           animation off and hands the strip over to normal scrolling — with
           the animation gone, `overflow-hidden` alone would simply amputate
           the second half. */
        <div className="overflow-hidden py-2.5 [mask-image:linear-gradient(90deg,transparent,#000_5%,#000_95%,transparent)] motion-reduce:overflow-x-auto [-webkit-mask-image:linear-gradient(90deg,transparent,#000_5%,#000_95%,transparent)]">
          <div className="flex w-max [animation:hc-marquee_44s_linear_infinite] motion-reduce:[animation:none]">
            {[0, 1].map((copy) => (
              /* The second half is the seam, not content — a screen reader
                 should not read the whole board twice. */
              <div key={copy} className="flex w-max" aria-hidden={copy === 1 || undefined}>
                {half.map((row, i) => (
                  <span
                    key={`${copy}-${row.refrigerant}-${i}`}
                    className="flex flex-none items-baseline gap-2 border-r border-slate-900/[.06] px-4 dark:border-hairline"
                  >
                    <span className="text-[12px] font-semibold tracking-[-.015em]">
                      {row.refrigerant}
                    </span>
                    <span className="text-[12px] font-semibold tabular-nums tracking-[-.015em] text-slate-600 dark:text-slate-300">
                      {money(row.pricePerKg)}
                    </span>

                    {row.gwp !== null ? (
                      <span
                        className={`text-[10.5px] font-semibold tabular-nums tracking-[.02em] ${
                          row.highGwp
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-slate-400 dark:text-ink-muted"
                        }`}
                        title={row.highGwp ? t("tickerHighGwpTitle") : t("tickerGwpTitle")}
                      >
                        {t("gwpValue", { value: format.number(row.gwp) })}
                      </span>
                    ) : null}

                    {/* Stated rather than implied: a rate for something we
                        cannot ship today is not an offer, and a buyer reading
                        a price board deserves to know which is which. */}
                    {!row.available ? (
                      <span className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-slate-400 dark:text-ink-muted">
                        {t("tickerUnavailable")}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="m-0 px-4 py-3 text-[12px] text-slate-400 dark:text-ink-muted">
          {t("tickerEmpty")}
        </p>
      )}
    </section>
  );
}
