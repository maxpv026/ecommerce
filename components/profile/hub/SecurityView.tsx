"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MicroBadge, ROW_ACTION_GHOST, ROW_ACTION_PRIMARY, SURFACE } from "@/components/home/ui";
import type { SecuritySummary } from "@/lib/profileHub";
import { SurfaceHead } from "./parts";

/**
 * A summary of the real security controls (2FA, recovery phrase, device
 * sessions, password) — each changed on the security page, not here.
 */
export default function SecurityView({ security }: { security: SecuritySummary }) {
  const t = useTranslations("ProfileHub");
  const format = useFormatter();
  const rows = [
    { k: "2fa", label: t("sec2fa"), value: <MicroBadge tone={security.twoFactor ? "ok" : "warn"}>{security.twoFactor ? t("on") : t("off")}</MicroBadge> },
    { k: "phrase", label: t("secPhrase"), value: <MicroBadge tone={security.phraseMode ? "ok" : "warn"}>{t(`phrase_${security.phraseMode ?? "NONE"}`)}</MicroBadge> },
    { k: "devices", label: t("secDevices"), value: <span className="font-semibold tabular-nums">{security.devices}</span> },
    { k: "password", label: t("secPassword"), value: <span>{security.passwordChangedAt ? format.dateTime(new Date(security.passwordChangedAt), { dateStyle: "medium" }) : t("never")}</span> },
  ];
  return (
    <div className={SURFACE} data-profile-security>
      <SurfaceHead title={t("securityTitle")} meta={[t("securityMeta")]} id="security">
        <Link href="/notifications" className={ROW_ACTION_GHOST}>
          {t("settingsSecurity")}
        </Link>
        <Link href="/profile/security" className={ROW_ACTION_PRIMARY} data-security-open>
          {t("securityOpen")}
          <ArrowRight size={14} strokeWidth={2.4} />
        </Link>
      </SurfaceHead>
      <dl className="m-0">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center justify-between gap-4 border-b border-slate-900/[.06] px-5 py-3.5 text-[13.5px] last:border-b-0 dark:border-white/[.06]" data-security-row={r.k}>
            <dt className="text-slate-600 dark:text-slate-300">{r.label}</dt>
            <dd className="m-0">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
