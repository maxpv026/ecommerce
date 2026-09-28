import { getFormatter, getTranslations } from "next-intl/server";
import { getUserGWPFootprint } from "@/lib/user/analytics";
import { EmptyRow, Panel } from "./primitives";
import GWPFootprintChartMount from "./GWPFootprintChartMount";

/**
 * Which gases make up the account's carbon, as a donut.
 *
 * All-time, matching getUserGWPFootprint: a buyer showing this to management
 * wants their whole history, and a year-to-date slice viewed in January would
 * read as near-zero emissions.
 *
 * The figures come from the same engine as the signed audit PDF, so the chart
 * and the document can never disagree.
 */
export default async function GWPFootprintChart() {
  const [f, t, format] = await Promise.all([
    getUserGWPFootprint(),
    getTranslations("Analytics"),
    getFormatter(),
  ]);

  const slices = f.byRefrigerant.filter((r) => r.co2eTonnes > 0);

  return (
    <Panel
      title={t("carbonTitle")}
      hint={
        slices.length > 0
          ? t("carbonHint", { mass: format.number(f.totalMassKg) })
          : undefined
      }
    >
      {slices.length > 0 ? (
        <>
          <GWPFootprintChartMount
            data={slices.map((r) => ({
              refrigerant: r.refrigerant,
              gwp: r.gwp,
              massKg: r.massKg,
              co2eTonnes: r.co2eTonnes,
              share: r.share,
              highGwp: r.highGwp,
            }))}
            totalTonnes={f.totalCo2eTonnes}
          />
          {f.unknownGwpLines > 0 ? (
            <p className="m-0 border-t border-slate-900/[.06] px-5 py-3 text-[11.5px] leading-[1.55] text-amber-700 dark:border-hairline dark:text-amber-500">
              {t("carbonUnknownNote", { count: f.unknownGwpLines })}
            </p>
          ) : null}
        </>
      ) : (
        <EmptyRow>{t("carbonEmpty")}</EmptyRow>
      )}
    </Panel>
  );
}
