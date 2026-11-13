"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Phone, TriangleAlert } from "lucide-react";
import { EYEBROW, SUMMARY_CARD } from "@/components/home/ui";
import { flagEmoji } from "@/lib/country";
import { emergencyFor, telHref, type EmergencyLines, type EmergencySource } from "@/lib/emergencyContacts";

/**
 * The right card: emergency contacts for the visitor's country — switchable,
 * because a driver crosses borders. Nothing else is stacked under it: the
 * F-Gas standing lives on /profile?tab=fgas, the trust badges on /cart. Every number is either a public service from
 * lib/emergencyContacts or our own configured line; nothing is invented
 * for a country we have no line in.
 */

interface Props {
  lines: EmergencyLines;
  detected: { code: string; source: EmergencySource } | null;
  /** Country names in the page locale, from the server — the browser's ICU may name them differently and break hydration. */
  countryNames: Record<string, string>;
}

const NUM = "font-semibold tabular-nums text-slate-900 dark:text-white";

export default function ComplianceCard({ lines, detected, countryNames }: Props) {
  const t = useTranslations("SdsLibrary");
  const [country, setCountry] = useState<string>(detected?.code ?? "EU");
  const [chosen, setChosen] = useState(false);
  const info = emergencyFor(country);

  const options = useMemo(
    // Already in the locale's alphabetical order (sorted on the server, same reason as the names).
    () => Object.entries(countryNames).filter(([code]) => emergencyFor(code)).map(([code, name]) => ({ code, name })),
    [countryNames]
  );

  // Our line: the country's own number if one is configured, else the main line labelled with where it rings.
  const local = info ? lines.local[info.code] : undefined;
  const ours = local ? { phone: local, country: info!.code, isLocal: true } : lines.main ? { ...lines.main, isLocal: lines.main.country === info?.code } : null;


  return (
    <div className={SUMMARY_CARD} data-sds-card>
      {/* ── Emergency ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${EYEBROW} flex items-center gap-1.5`}>
          <TriangleAlert size={13} strokeWidth={2.4} className="text-red-600 dark:text-red-400" />
          {t("emergencyEyebrow")}
        </h2>
        <label className="relative inline-flex">
          <span className="sr-only">{t("countryLabel")}</span>
          <select
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setChosen(true);
            }}
            data-emg-country
            className="h-8 max-w-[190px] cursor-pointer appearance-none truncate rounded-full border border-slate-900/[.12] bg-white/70 py-0 pl-3 pr-7 text-[12.5px] font-semibold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40 dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-[#141518] dark:[&>option]:text-slate-100"
          >
            {!detected && <option value="EU">🇪🇺 {t("countryEu")}</option>}
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {flagEmoji(o.code)} {o.name}
              </option>
            ))}
          </select>
          <ChevronDown size={13} strokeWidth={2.4} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        </label>
      </div>
      <p className="m-0 mt-1.5 text-[11.5px] text-slate-500 dark:text-ink-muted" data-emg-source={chosen ? "manual" : (detected?.source ?? "none")}>
        {chosen ? t("countryManual") : detected ? t(`countrySource_${detected.source}`) : t("countryUnknown")}
      </p>

      {ours && (
        <div className="mt-4" data-emg-ours={ours.isLocal ? "local" : "main"}>
          <p className="m-0 text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">{t("ourLine")}</p>
          <a href={telHref(ours.phone)} className="mt-1 flex items-center gap-2 text-[22px] font-semibold tracking-[-.03em] text-slate-900 tabular-nums hover:text-red-700 dark:text-white dark:hover:text-red-300" data-emg-line>
            <Phone size={17} strokeWidth={2.2} className="flex-none text-red-600 dark:text-red-400" />
            {ours.country && <span aria-hidden>{flagEmoji(ours.country)}</span>}
            {ours.phone}
          </a>
          <p className="m-0 mt-1 text-[11.5px] text-slate-500 dark:text-ink-muted">
            {ours.isLocal ? t("ourLineLocal") : ours.country ? t("ourLineIntl", { country: countryNames[ours.country] ?? ours.country }) : t("ourLineIntlUnknown")}
          </p>
        </div>
      )}

      <div className="mt-4 rounded-[14px] border border-red-500/20 bg-red-500/[.05] p-3 dark:border-red-400/20 dark:bg-red-500/[.07]" data-emg-public={info?.code ?? "EU"}>
        <p className="m-0 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">{t("publicTitle")}</p>
        <dl className="m-0 mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[12.5px]">
          <dt className="text-slate-600 dark:text-slate-300">{info ? t("general") : t("generalEu")}</dt>
          <dd className="m-0 text-right">
            {(info?.general ?? "112").split(" / ").map((n, i) => (
              <span key={n}>
                {i > 0 && " / "}
                <a href={telHref(n)} className={`${NUM} text-red-700 hover:underline dark:text-red-300`} data-emg-general>
                  {n}
                </a>
              </span>
            ))}
          </dd>
          {info?.extra.map((x) => (
            <FragmentRow key={x.kind} label={t(`service_${x.kind}`)} number={x.number} />
          ))}
          <dt className="text-slate-600 dark:text-slate-300">{t("poison")}</dt>
          <dd className="m-0 text-right" data-emg-poison={info?.poison ? info.poison.phone : "112"}>
            {info?.poison ? (
              <a href={telHref(info.poison.phone)} className={`${NUM} hover:underline`}>
                {info.poison.phone}
              </a>
            ) : (
              <span className="text-slate-500 dark:text-ink-muted">{t("poisonVia112")}</span>
            )}
          </dd>
        </dl>
        {info?.poison && (
          <p className="m-0 mt-1.5 text-[11.5px] text-slate-500 dark:text-ink-muted">
            {info.poison.name}
            {info.poison.professionals ? ` · ${t("poisonProfessionals")}` : ""}
          </p>
        )}
        <p className="m-0 mt-2 text-[11.5px] leading-[1.45] text-slate-600 dark:text-slate-300">{t("tellUn")}</p>
      </div>

    </div>
  );
}

function FragmentRow({ label, number }: { label: string; number: string }) {
  return (
    <>
      <dt className="text-slate-600 dark:text-slate-300">{label}</dt>
      <dd className="m-0 text-right">
        <a href={telHref(number)} className={`${NUM} hover:underline`} data-emg-extra={number}>
          {number}
        </a>
      </dd>
    </>
  );
}
