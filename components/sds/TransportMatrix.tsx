"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, ClipboardList, FileCheck2, FileText, Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ICON_TILE, MicroBadge, SURFACE, safetyTone } from "@/components/home/ui";
import { normalizeMark } from "@/lib/gasMarks";
import { adrFor, co2eTonnes, type SdsRow } from "@/lib/sdsLibrary";
import { AdrDiamond, EU_TONE } from "./SdsDirectoryRow";

/**
 * The "ADR transport & F-Gas" mode: every gas on one line with what a
 * consignor fills in (UN, class, classification code, tunnel code, label)
 * beside what the F-Gas logbook needs (GWP, EU 2024/573 status, t CO₂e per
 * 10 kg cylinder). Below it, the shipment paperwork — named for what it is:
 * ADR documents are per consignment and the CoA per lot, so they come with
 * the order, not as a download per gas (lib/productDocuments explains why).
 */

const TH = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[.06em] text-slate-500 dark:text-ink-muted";
const TD = "px-3 py-2.5 align-middle";

export default function TransportMatrix({ rows, purchased }: { rows: SdsRow[]; purchased: ReadonlySet<string> }) {
  const t = useTranslations("SdsLibrary");
  const tHub = useTranslations("MarketHub");
  const format = useFormatter();

  const docs = [
    { icon: Truck, title: t("docAdrWritten"), body: t("docAdrWrittenBody"), href: null },
    { icon: ClipboardList, title: t("docAdrTransport"), body: t("docAdrTransportBody"), href: { to: "/profile?tab=orders", label: t("docAdrTransportLink") } },
    { icon: FileCheck2, title: t("docCoa"), body: t("docCoaBody"), href: null },
    { icon: FileText, title: t("docFgasLog"), body: t("docFgasLogBody"), href: { to: "/profile?tab=fgas", label: t("docFgasLogLink") } },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className={SURFACE} data-sds-matrix>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-900/[.06] px-5 py-3.5 dark:border-white/[.06]">
          <h2 className="m-0 text-[15px] font-semibold tracking-[-.02em]">{t("matrixTitle")}</h2>
          <span className="text-[12.5px] text-slate-500 dark:text-ink-muted">{t("matrixMeta")}</span>
        </div>
        {rows.length === 0 ? (
          <p className="m-0 px-5 py-12 text-center text-[13px] text-slate-500 dark:text-ink-muted">{t("emptyMatrix")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[12.5px] tabular-nums">
              <thead className="border-b border-slate-900/[.06] dark:border-white/[.06]">
                <tr>
                  <th className={`${TH} pl-5`}>{t("colGas")}</th>
                  <th className={TH}>UN</th>
                  <th className={TH}>{t("colClass")}</th>
                  <th className={TH}>{t("colTunnel")}</th>
                  <th className={TH}>GWP</th>
                  <th className={TH}>{t("colEu")}</th>
                  <th className={`${TH} pr-5 text-right`}>{t("colCo2e")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/[.06] dark:divide-white/[.06]">
                {rows.map((r) => {
                  const adr = adrFor(r);
                  return (
                    <tr key={r.key} data-matrix-row={r.label}>
                      <td className={`${TD} pl-5`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold">{r.label}</span>
                          <MicroBadge tone={safetyTone(r.safety)}>{r.safety}</MicroBadge>
                          {purchased.has(normalizeMark(r.key)) && <MicroBadge tone="ok">{t("purchased")}</MicroBadge>}
                        </div>
                      </td>
                      <td className={`${TD} font-semibold`} data-matrix-un>
                        {r.un}
                      </td>
                      <td className={TD}>
                        <span className="inline-flex items-center gap-2">
                          <AdrDiamond adrClass={adr.adrClass} />
                          {adr.adrClass} <span className="text-slate-500 dark:text-ink-muted">{adr.classCode}</span>
                        </span>
                      </td>
                      <td className={TD}>{adr.tunnel}</td>
                      <td className={TD}>{format.number(r.gwpShown)}</td>
                      <td className={TD}>
                        <MicroBadge tone={EU_TONE[r.eu]}>{tHub(`eu_${r.eu}`)}</MicroBadge>
                      </td>
                      <td className={`${TD} pr-5 text-right font-semibold`}>{format.number(co2eTonnes(r.gwpShown, 10), { maximumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={SURFACE} data-sds-transport-docs>
        <div className="border-b border-slate-900/[.06] px-5 py-3.5 dark:border-white/[.06]">
          <h2 className="m-0 text-[15px] font-semibold tracking-[-.02em]">{t("docsTitle")}</h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{t("docsMeta")}</p>
        </div>
        <ul className="m-0 list-none divide-y divide-slate-900/[.06] p-0 dark:divide-white/[.06]">
          {docs.map(({ icon: Icon, title, body, href }) => (
            <li key={title} className="flex items-start gap-3.5 px-5 py-3.5">
              <span className={ICON_TILE}>
                <Icon size={16} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13.5px] font-semibold">{title}</p>
                <p className="m-0 mt-0.5 text-[12.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">{body}</p>
              </div>
              {href && (
                <Link href={href.to} className="inline-flex flex-none items-center gap-1 self-center text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
                  {href.label}
                  <ArrowRight size={13} strokeWidth={2.4} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
