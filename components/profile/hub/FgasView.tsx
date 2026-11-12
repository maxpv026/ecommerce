"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Clock, Download, ExternalLink, FileSpreadsheet, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { Link } from "@/i18n/navigation";
import FgasChecklist from "@/components/fgas/FgasChecklist";
import { ROW_ACTION_GHOST, ROW_ACTION_PRIMARY, SURFACE } from "@/components/home/ui";
import { useFgasModal } from "@/lib/fgasModalEvents";
import type { UserProfileData } from "@/lib/data";
import type { LogbookSummary } from "./ProfileHub";
import { FieldRow, GroupTitle, SurfaceHead } from "./parts";

/**
 * The certificate and the CO₂e logbook in the cart's surface language. The
 * status logic is the old dashboard card's (lib/fgasAccount gives the
 * effective status; a refused upload's reading is never shown as on file).
 */
export default function FgasView({ profile, logbook }: { profile: UserProfileData; logbook: LogbookSummary | null }) {
  const t = useTranslations("ProfileHub");
  const tFgas = useTranslations("FgasProfile");
  const format = useFormatter();
  const showFgasModal = useFgasModal((s) => s.show);
  const summary = profile.fgas;
  const status = summary?.status ?? profile.fGasStatus ?? "NONE";
  const verified = status === "VERIFIED";
  const extracted = verified ? profile.fGasExtracted : null;
  const day = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
    return Number.isNaN(d.getTime()) ? iso : format.dateTime(d, { dateStyle: "medium", timeZone: "UTC" });
  };
  const href = profile.certificateDocumentHref;
  const downloadHref = href ? `${href}${href.includes("?") ? "&" : "?"}download=1` : null;
  const uploadLabel = status === "NONE" ? tFgas("upload") : verified ? tFgas("replace") : status === "EXPIRED" ? tFgas("uploadRenewed") : tFgas("uploadAnother");
  const empty = t("notSet");

  const banner =
    status === "VERIFIED"
      ? { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", icon: ShieldCheck, text: summary?.certificateNumber && summary.expiresAt ? t("fgasVerifiedUntil", { number: summary.certificateNumber, date: day(summary.expiresAt) ?? "" }) : t("fgasVerified") }
      : status === "REJECTED"
        ? { cls: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300", icon: ShieldAlert, text: summary?.reason || profile.fGasRejectionReason || tFgas("statusRejected") }
        : status === "EXPIRED"
          ? { cls: "border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300", icon: ShieldAlert, text: tFgas("expiredBody", { date: day(summary?.expiresAt) ?? "—" }) }
          : status === "PENDING_REVIEW"
            ? { cls: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300", icon: Clock, text: t("fgasPending") }
            : { cls: "border-slate-900/[.1] bg-slate-900/[.03] text-slate-700 dark:border-white/[.1] dark:bg-white/[.04] dark:text-slate-300", icon: ShieldAlert, text: tFgas("noneBody") };
  const Icon = banner.icon;

  return (
    <div className={SURFACE} data-profile-fgas data-fgas-status={status}>
      <SurfaceHead title={t("fgasTitle")} meta={[t("fgasMeta")]} id="fgas">
        <button type="button" onClick={() => showFgasModal("profile")} className={ROW_ACTION_PRIMARY} data-fgas-upload-profile>
          <Upload size={14} strokeWidth={2.2} />
          {uploadLabel}
        </button>
      </SurfaceHead>

      <div className="px-5 py-4">
        <div role="status" className={`flex items-start gap-2 rounded-[16px] border py-2.5 pl-3 pr-3.5 text-[12.5px] font-semibold leading-[1.45] ${banner.cls}`} data-fgas-banner={status}>
          <Icon size={14} strokeWidth={2.2} className="mt-[2px] flex-none" />
          <span className="min-w-0 flex-1">{banner.text}</span>
        </div>
        {summary?.checks && (status === "REJECTED" || status === "PENDING_REVIEW") && (
          <div className="mt-3 rounded-[14px] border border-slate-900/[.08] p-3 dark:border-white/[.1]">
            <FgasChecklist checks={summary.checks} only={status === "REJECTED" ? ["fail", "review"] : ["review"]} compact />
          </div>
        )}
        {verified && summary?.replacementPending && <p className="m-0 mt-2 text-[12px] text-blue-700 dark:text-blue-300">{tFgas("replacementPending")}</p>}
        {verified && summary?.daysLeft !== null && summary?.daysLeft !== undefined && summary.daysLeft <= 60 && (
          <p className="m-0 mt-2 text-[12px] font-semibold text-orange-600 dark:text-orange-300">{tFgas("expiringSoon", { days: summary.daysLeft })}</p>
        )}
      </div>

      <dl className="m-0 border-t border-slate-900/[.06] dark:border-white/[.06]">
        <FieldRow label={t("certHolder")} value={summary?.holder || extracted?.companyName || null} empty={empty} data="holder" />
        <FieldRow label={t("certNumber")} value={summary?.certificateNumber || extracted?.certificateId || profile.certificate?.certId || null} mono empty={empty} data="certificateNumber" />
        <FieldRow label={t("certCategory")} value={summary?.category || extracted?.category || profile.certificate?.certType || null} empty={empty} data="category" />
        <FieldRow label={t("certIssued")} value={day(extracted?.issuedOn)} empty={empty} data="issued" />
        <FieldRow label={t("certExpires")} value={day(summary?.expiresAt ?? extracted?.expiresAt)} empty={empty} data="expires" />
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-slate-900/[.06] px-5 py-3 dark:border-white/[.06]">
        {href ? (
          <>
            <a href={href} target="_blank" rel="noopener noreferrer" className={ROW_ACTION_GHOST} data-fgas-view="ready">
              <ExternalLink size={14} strokeWidth={2.2} />
              {t("certView")}
            </a>
            <a href={downloadHref ?? undefined} download className={ROW_ACTION_GHOST} data-fgas-download="ready">
              <Download size={14} strokeWidth={2.2} />
              {t("certDownload")}
            </a>
          </>
        ) : (
          <span className="text-[12px] text-slate-400 dark:text-slate-500">{t("certNoDocument")}</span>
        )}
      </div>

      <GroupTitle>{t("logbookTitle", { year: logbook?.year ?? new Date().getUTCFullYear() })}</GroupTitle>
      <div className="grid grid-cols-3 divide-x divide-slate-900/[.06] dark:divide-white/[.06]" data-logbook>
        {[
          { k: "kg", label: t("logbookKg"), value: format.number(logbook?.massKg ?? 0, { maximumFractionDigits: 1 }) },
          { k: "t", label: t("logbookCo2e"), value: format.number(logbook?.co2eTonnes ?? 0, { maximumFractionDigits: 2 }) },
          { k: "lines", label: t("logbookLines"), value: String(logbook?.lines ?? 0) },
        ].map((s) => (
          <div key={s.k} className="px-5 py-4" data-logbook-stat={s.k}>
            <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">{s.label}</div>
            <div className="mt-1 text-[22px] font-semibold tabular-nums tracking-[-.03em]">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-900/[.06] px-5 py-3 dark:border-white/[.06]">
        {/* A file download from an API route: a plain <a>, never client-side routing. */}
        <a download href="/api/compliance/report?period=ytd" className={ROW_ACTION_GHOST} data-logbook-pdf>
          <Download size={14} strokeWidth={2.2} />
          {t("logbookPdf")}
        </a>
        {/* A file download from an API route: a plain <a>, never client-side routing. */}
        <a download href="/api/compliance/ledger" className={ROW_ACTION_GHOST} data-logbook-csv>
          <FileSpreadsheet size={14} strokeWidth={2.2} />
          {t("logbookCsv")}
        </a>
        <Link href="/profile/compliance" className={ROW_ACTION_GHOST} data-logbook-open>
          {t("logbookOpen")}
          <ArrowRight size={14} strokeWidth={2.4} />
        </Link>
      </div>
    </div>
  );
}
