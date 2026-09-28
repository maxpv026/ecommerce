import { getFormatter, getTranslations } from "next-intl/server";
import { getUserSpendTrend } from "@/lib/user/analytics";
import { EmptyRow, Panel } from "./primitives";
import UserSpendChartMount from "./UserSpendChartMount";

/**
 * Monthly spend for the signed-in buyer. Server component: it fetches, then
 * hands plain data to the client canvas.
 *
 * `getUserSpendTrend` resolves the session itself, so there is no user id to
 * pass — and therefore none to pass wrong.
 *
 * Months with no orders are kept in the series rather than filtered out. A bar
 * chart that omits empty months compresses its own time axis and makes a quiet
 * quarter look like a busy one.
 */
export default async function UserSpendChart({ months = 12 }: { months?: number }) {
  const [data, t, format] = await Promise.all([
    getUserSpendTrend(months),
    getTranslations("Analytics"),
    getFormatter(),
  ]);

  const total = data.reduce((n, p) => n + p.spend, 0);
  const orders = data.reduce((n, p) => n + p.orders, 0);
  const active = data.some((p) => p.spend > 0);

  return (
    <Panel
      title={t("spendTitle", { months })}
      hint={
        active
          ? t("spendHint", {
              total: format.number(total, {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              }),
              count: orders,
            })
          : undefined
      }
    >
      {active ? (
        <UserSpendChartMount data={data} />
      ) : (
        <EmptyRow>{t("spendEmpty")}</EmptyRow>
      )}
    </Panel>
  );
}
