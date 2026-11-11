"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Clock, FileText, ShieldAlert, ShieldCheck, ShieldX, Upload } from "lucide-react";
import { useFgasModal } from "@/lib/fgasModalEvents";
import type { FgasSummary } from "@/lib/fgas";
import FgasChecklist, { flagOf } from "./FgasChecklist";

/**
 * The buyer's F-Gas standing as a card, with the one action that fits it:
 * upload, replace, upload the renewed one, or upload another. Every state is
 * its own colour and words — VERIFIED, PENDING_REVIEW, REJECTED, EXPIRED, NONE.
 */
export default function FgasStatusCard({ fgas }: { fgas: FgasSummary | null }) {
  const t = useTranslations("FgasProfile");
  const format = useFormatter();
  const show = useFgasModal((s) => s.show);
  const status = fgas?.status ?? "NONE";
  const date = fgas?.expiresAt ? format.dateTime(new Date(fgas.expiresAt), { dateStyle: "medium", timeZone: "UTC" }) : null;

  const look = {
    VERIFIED: { ring: "border-emerald-500/30", tile: "bg-emerald-600", Icon: ShieldCheck, title: t("statusVerified") },
    PENDING_REVIEW: { ring: "border-[#3b6fd8]/30", tile: "bg-[#3b6fd8]", Icon: Clock, title: t("statusPending") },
    REJECTED: { ring: "border-red-500/30", tile: "bg-red-600", Icon: ShieldX, title: t("statusRejected") },
    EXPIRED: { ring: "border-orange-500/35", tile: "bg-orange-600", Icon: ShieldAlert, title: t("statusExpired") },
    NONE: { ring: "border-slate-900/[.12] dark:border-white/[.12]", tile: "bg-slate-700", Icon: ShieldAlert, title: t("statusNone") },
  }[status];

  const body =
    status === "VERIFIED"
      ? date
        ? t("verifiedUntil", { date })
        : t("verifiedNoExpiry")
      : status === "PENDING_REVIEW"
        ? t("pendingBody")
        : status === "REJECTED"
          ? (fgas?.reason ?? t("rejectedBody"))
          : status === "EXPIRED"
            ? t("expiredBody", { date: date ?? "—" })
            : t("noneBody");
  const action =
    status === "NONE" ? t("upload") : status === "VERIFIED" ? t("replace") : status === "EXPIRED" ? t("uploadRenewed") : t("uploadAnother");

  return (
    <section data-fgas-card={status} className={`rounded-[22px] border bg-white/80 p-[17px] backdrop-blur-xl dark:bg-glass ${look.ring}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-[12px] text-white ${look.tile}`}>
          <look.Icon size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("eyebrow")}</div>
          <div className="mt-0.5 text-[15px] font-semibold tracking-[-.02em]">{look.title}</div>
          <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-slate-600 dark:text-ink-muted">{body}</p>
        </div>
      </div>

      {status === "VERIFIED" && fgas && (
        <dl className="m-0 mt-3 grid grid-cols-2 gap-2 text-[12px]">
          {[
            [t("fieldNumber"), fgas.certificateNumber],
            [t("fieldHolder"), fgas.holder],
            [t("fieldIssuer"), fgas.issuingBody],
            [t("fieldCountry"), fgas.countryCode ? `${flagOf(fgas.countryCode)} ${fgas.countryCode}` : null],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-[12px] bg-slate-900/[.04] px-2.5 py-2 dark:bg-white/[.05]">
              <dt className="text-[9.5px] font-semibold uppercase tracking-[.08em] text-slate-400">{label}</dt>
              <dd className="m-0 mt-0.5 truncate font-semibold">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      {status === "VERIFIED" && fgas?.daysLeft !== null && fgas?.daysLeft !== undefined && fgas.daysLeft <= 60 && (
        <p className="m-0 mt-3 text-[12px] font-semibold text-orange-600 dark:text-orange-300" data-fgas-expiring>
          {t("expiringSoon", { days: fgas.daysLeft })}
        </p>
      )}
      {fgas?.replacementPending && status === "VERIFIED" && (
        <p className="m-0 mt-3 flex items-center gap-1.5 text-[12px] text-[#3b6fd8]" data-fgas-replacement-pending>
          <Clock size={13} strokeWidth={2} /> {t("replacementPending")}
        </p>
      )}
      {(status === "REJECTED" || status === "PENDING_REVIEW") && fgas?.checks && (
        <div className="mt-3">
          <FgasChecklist checks={fgas.checks} only={status === "REJECTED" ? ["fail", "review"] : ["review"]} compact />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => show("profile")}
          data-fgas-upload-profile
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[14px] bg-slate-900 text-[13px] font-semibold text-white active:scale-[.98] dark:bg-white dark:text-slate-900"
        >
          <Upload size={15} strokeWidth={2.2} />
          {action}
        </button>
        {fgas?.documentHref && (
          <a
            href={fgas.documentHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("viewDocument")}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-slate-100 dark:bg-white/[.07]"
          >
            <FileText size={17} strokeWidth={1.9} />
          </a>
        )}
      </div>
    </section>
  );
}
