"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Clock } from "lucide-react";
import { ACCOUNT_PROFILE } from "@/lib/account";
import { nativeLanguageName } from "@/lib/languageNames";
import type { UserProfileData } from "@/lib/data";

interface FieldRow {
  key: string;
  labelKey: string;
  value: string;
}

function buildFields(profile: UserProfileData | null, emptyLabel: string): FieldRow[] {
  if (!profile) {
    const labelKeys: Record<string, string> = {
      name: "fieldFullName",
      email: "fieldEmail",
      company: "fieldCompany",
      address: "fieldShippingAddress",
    };
    return ACCOUNT_PROFILE.fields.map((f) => ({ key: f.key, labelKey: labelKeys[f.key], value: f.value }));
  }
  return [
    { key: "name", labelKey: "fieldFullName", value: profile.name ?? emptyLabel },
    { key: "email", labelKey: "fieldEmail", value: profile.email ?? emptyLabel },
    { key: "company", labelKey: "fieldCompany", value: profile.companyName ?? emptyLabel },
    { key: "address", labelKey: "fieldShippingAddress", value: profile.defaultAddress ?? emptyLabel },
    { key: "language", labelKey: "fieldLanguage", value: nativeLanguageName(profile.locale) },
  ];
}

interface UserInfoCardProps {
  /** Live Prisma profile; null renders the signed-out placeholder card. */
  profile: UserProfileData | null;
}

export default function UserInfoCard({ profile }: UserInfoCardProps) {
  const t = useTranslations("AccountProfile");
  const [editing, setEditing] = useState(false);
  const fields = buildFields(profile, t("fieldEmpty"));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value]))
  );

  const fgasVerified = profile ? profile.fgasVerified : ACCOUNT_PROFILE.epaCert.verified;
  const certMeta = profile
    ? profile.certificate
      ? t("fgasCertMeta", {
          type: profile.certificate.certType,
          id: profile.certificate.certId,
          year: profile.certificate.issuedYear,
        })
      : t("fgasNoCert")
    : t("epaCertMeta", {
        type: ACCOUNT_PROFILE.epaCert.type,
        expires: ACCOUNT_PROFILE.epaCert.expiresLabel,
        year: ACCOUNT_PROFILE.epaCert.onFileSinceYear,
      });

  return (
    <div
      id="info"
      className="scroll-mt-[88px] rounded-[22px] border border-white/75 bg-white/68 p-6.5 pb-6 shadow-[0_24px_56px_-28px_rgba(15,23,42,0.26)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60"
    >
      <div className="mb-5.5 flex items-start justify-between gap-5">
        <div>
          <h2 className="m-0 text-[17px] font-semibold tracking-[-.025em]">{t("userInfoTitle")}</h2>
          <p className="mt-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">
            {t("userInfoSubtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className={
            editing
              ? "h-[38px] flex-none rounded-[11px] bg-blue-700 px-4 text-[13px] font-semibold tracking-[-.01em] text-white transition-colors hover:bg-blue-800"
              : "h-[38px] flex-none rounded-[11px] border border-slate-900/[.14] bg-white/80 px-4 text-[13px] font-semibold tracking-[-.01em] text-slate-900 transition-colors hover:border-slate-900/30 dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50 dark:hover:border-white/30"
          }
        >
          {editing ? t("saveChanges") : t("edit")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 sm:gap-x-7">
        {fields.map((field) => (
          <div key={field.key}>
            <div className="mb-1.5 text-[11px] tracking-[.07em] text-slate-400 dark:text-slate-500">
              {t(field.labelKey)}
            </div>
            {editing ? (
              <input
                value={values[field.key] ?? field.value}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                className="h-[42px] w-full rounded-[11px] border border-slate-900/[.13] bg-white px-3.5 text-[13.5px] text-slate-900 focus:outline-none dark:border-white/[.16] dark:bg-white/5 dark:text-slate-50"
              />
            ) : (
              <div className="text-sm leading-[1.5] tracking-[-.01em]">{values[field.key] ?? field.value}</div>
            )}
          </div>
        ))}
      </div>

      <div
        id="certifications"
        className="mt-6 flex scroll-mt-[88px] items-center justify-between gap-5 border-t border-slate-900/[.08] pt-5 dark:border-white/[.08]"
      >
        <div>
          <div className="text-[13.5px] font-semibold tracking-[-.015em]">
            {t("epaCertTitle")}
          </div>
          <div className="mt-[5px] text-[12.5px] text-slate-500 dark:text-slate-400">{certMeta}</div>
        </div>
        {fgasVerified ? (
          <span className="flex flex-none items-center gap-1.5 rounded-full border border-green-600/20 bg-green-50 px-3.5 py-[7px] text-xs font-semibold text-green-700 dark:border-green-400/25 dark:bg-green-400/10 dark:text-green-400">
            <Check size={13} strokeWidth={2.4} />
            {t("verified")}
          </span>
        ) : (
          <span className="flex flex-none items-center gap-1.5 rounded-full border border-amber-600/20 bg-amber-50 px-3.5 py-[7px] text-xs font-semibold text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-400">
            <Clock size={13} strokeWidth={2.4} />
            {t("pendingVerification")}
          </span>
        )}
      </div>
    </div>
  );
}
