"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, ChevronDown, Download, FileText, LifeBuoy, Mail } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ICON_TILE, MicroBadge, ROW_ACTION_GHOST, ROW_ACTION_PRIMARY, safetyTone, type BadgeTone } from "@/components/home/ui";
import { adrFor, clpFor, firstAidKeys, pKey, type SdsRow } from "@/lib/sdsLibrary";

/**
 * One gas in the SDS directory: the cart-row header (tile, gas, composition,
 * technical micro-badges, actions) and an inline drawer with the ADR, CLP and
 * first-aid quick spec — all from lib/sdsLibrary, nothing fetched.
 */

export const EU_TONE: Record<SdsRow["eu"], BadgeTone> = { banned2025: "bad", restricted: "warn", phaseout: "info", ok: "ok", unknown: "muted" };

/** ADR hazard label as a small diamond: red for 2.1 (flammable gas), green for 2.2. */
export function AdrDiamond({ adrClass }: { adrClass: "2.1" | "2.2" }) {
  return (
    <span aria-hidden className={`inline-flex h-[18px] w-[18px] flex-none rotate-45 items-center justify-center rounded-[3px] ${adrClass === "2.1" ? "bg-red-600" : "bg-emerald-600"}`}>
      <span className="-rotate-45 text-[9.5px] font-bold leading-none text-white">2</span>
    </span>
  );
}

export function composition(row: SdsRow, t: ReturnType<typeof useTranslations>) {
  return row.blend ? t("blendOf", { parts: row.blend.parts, shares: row.blend.shares }) : t("substanceOf", { formula: row.formula ?? "" });
}

export default function SdsDirectoryRow({ row, purchased, open, onToggle, onConsult, requestEmail }: { row: SdsRow; purchased: boolean; open: boolean; onToggle: () => void; onConsult: () => void; requestEmail: string | null }) {
  const t = useTranslations("SdsLibrary");
  const tHub = useTranslations("MarketHub");
  const format = useFormatter();
  const adr = adrFor(row);
  const clp = clpFor(row);
  const drawerId = `sds-drawer-${row.key}`;
  const issued = row.doc.issuedOn ? format.dateTime(new Date(`${row.doc.issuedOn}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) : null;

  return (
    <div data-sds-row={row.label} data-safety={row.safety} data-purchased={purchased ? "1" : "0"} data-doc={row.doc.status}>
      <div className="flex items-start gap-3.5 px-5 py-4">
        <span className={ICON_TILE}>
          <FileText size={17} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="m-0 text-[15px] font-semibold tracking-[-.02em]">{row.label}</h3>
            {purchased && (
              <MicroBadge tone="ok" data-sds-purchased="1">
                {t("purchased")}
              </MicroBadge>
            )}
            {!row.inCatalog && <MicroBadge tone="muted">{t("notInCatalog")}</MicroBadge>}
          </div>
          <p className="m-0 mt-0.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{composition(row, t)}</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-sds-badges>
            <MicroBadge>CAS {row.cas.join(" · ")}</MicroBadge>
            <MicroBadge tone="info" data-sds-un={row.un}>
              UN {row.un}
            </MicroBadge>
            <MicroBadge tone={adr.adrClass === "2.1" ? "warn" : "muted"}>{t("adrClassBadge", { cls: adr.adrClass })}</MicroBadge>
            <MicroBadge tone={safetyTone(row.safety)}>{row.safety}</MicroBadge>
            <MicroBadge>GWP {format.number(row.gwpShown)}</MicroBadge>
            {row.doc.status === "released" ? (
              <MicroBadge tone="ok" data-sds-docstatus="released">
                {issued ? t("docReleasedOn", { rev: row.doc.revision ?? "", date: issued }) : (row.doc.revision ?? "")}
              </MicroBadge>
            ) : row.doc.status === "placeholder" ? (
              <MicroBadge tone="warn" data-sds-docstatus="placeholder">
                {t("docPlaceholder")}
              </MicroBadge>
            ) : (
              <MicroBadge tone="muted" data-sds-docstatus="none">
                {t("docNone")}
              </MicroBadge>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={drawerId} className={ROW_ACTION_GHOST} data-sds-expand={row.label}>
              {t("expand")}
              <ChevronDown size={14} strokeWidth={2.2} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            <button type="button" onClick={onConsult} className={ROW_ACTION_GHOST} data-sds-ask={row.label}>
              <LifeBuoy size={14} strokeWidth={2.2} />
              {t("consultant")}
            </button>
            {row.doc.href ? (
              <a href={row.doc.href} download className={ROW_ACTION_PRIMARY} data-sds-download={row.label}>
                <Download size={14} strokeWidth={2.2} />
                {t("downloadPdf")}
              </a>
            ) : requestEmail ? (
              // No sheet held for this gas: ask for the manufacturer's.
              <a href={`mailto:${requestEmail}?subject=${encodeURIComponent(t("requestSubject", { gas: row.label }))}`} className={ROW_ACTION_GHOST} data-sds-request={row.label}>
                <Mail size={14} strokeWidth={2.2} />
                {t("requestSds")}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {open && (
        <div id={drawerId} className="border-t border-slate-900/[.06] bg-slate-50/70 px-5 py-4 dark:border-white/[.06] dark:bg-white/[.02]" data-sds-drawer={row.label}>
          <div className="grid gap-4 md:grid-cols-3">
            {/* ADR */}
            <div className="min-w-0">
              <h4 className="m-0 mb-2 text-[11.5px] font-semibold uppercase tracking-[.08em] text-slate-500 dark:text-ink-muted">{t("drawerAdr")}</h4>
              <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px]">
                <dt className="text-slate-500 dark:text-ink-muted">{t("unCode")}</dt>
                <dd className="m-0 font-semibold tabular-nums" data-adr="un">
                  UN {row.un}
                </dd>
                <dt className="text-slate-500 dark:text-ink-muted">{t("adrClass")}</dt>
                <dd className="m-0 font-semibold tabular-nums" data-adr="class">
                  {adr.adrClass} <span className="font-normal text-slate-500 dark:text-ink-muted">({adr.classCode})</span>
                </dd>
                <dt className="text-slate-500 dark:text-ink-muted">{t("tunnel")}</dt>
                <dd className="m-0 font-semibold tabular-nums" data-adr="tunnel">
                  {adr.tunnel}
                </dd>
              </dl>
              {/* Its own row: the label text is long, and the rotated diamond needs room on both sides. */}
              <p className="m-0 mt-2.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{t("hazardLabel")}</p>
              <p className="m-0 mt-1.5 flex items-center gap-2.5 pl-0.5 text-[12.5px] font-medium" data-adr="label">
                <AdrDiamond adrClass={adr.adrClass} />
                <span>{t(adr.adrClass === "2.1" ? "label21" : "label22")}</span>
              </p>
            </div>

            {/* CLP / GHS */}
            <div className="min-w-0">
              <h4 className="m-0 mb-2 text-[11.5px] font-semibold uppercase tracking-[.08em] text-slate-500 dark:text-ink-muted">{t("drawerClp")}</h4>
              <p className="m-0 mb-1.5 text-[12.5px]">
                <span className="font-semibold">{t(clp.signal === "danger" ? "signalDanger" : "signalWarning")}</span>
                <span className="text-slate-500 dark:text-ink-muted"> · {clp.pictograms.join(" · ")}</span>
              </p>
              <ul className="m-0 list-none space-y-1 p-0 text-[12.5px] leading-[1.45]" data-clp="hazard">
                {clp.hazard.map((h) => (
                  <li key={h}>
                    <span className="font-semibold tabular-nums">{h}</span> {t(`h_${h}`)}
                  </li>
                ))}
              </ul>
              <ul className="m-0 mt-1.5 list-none space-y-1 p-0 text-[12px] leading-[1.45] text-slate-600 dark:text-slate-300" data-clp="precaution">
                {clp.precaution.map((p) => (
                  <li key={p}>
                    <span className="font-semibold tabular-nums">{p}</span> {t(pKey(p))}
                  </li>
                ))}
              </ul>
            </div>

            {/* First aid / leak */}
            <div className="min-w-0">
              <h4 className="m-0 mb-2 text-[11.5px] font-semibold uppercase tracking-[.08em] text-slate-500 dark:text-ink-muted">{t("drawerFirstAid")}</h4>
              <ul className="m-0 list-disc space-y-1 pl-4 text-[12.5px] leading-[1.45]" data-first-aid>
                {firstAidKeys(row).map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-900/[.06] pt-3 dark:border-white/[.06]">
            <span className="text-[12px] text-slate-500 dark:text-ink-muted">
              {tHub(`eu_${row.eu}`)} · {t("drawerNote")}
            </span>
            {row.inCatalog ? (
              <Link href={`/products?gasType=${encodeURIComponent(row.key)}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-sds-catalog={row.key}>
                {t("viewCylinders")}
                <ArrowRight size={13} strokeWidth={2.4} />
              </Link>
            ) : (
              <Link href="/hub?tab=compare" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-sds-compare>
                {t("compareGases")}
                <ArrowRight size={13} strokeWidth={2.4} />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
