"use client";

import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { SURFACE } from "@/components/home/ui";
import { nativeLanguageName } from "@/lib/languageNames";
import { formatIban } from "@/lib/profilePrefs";
import type { UserProfileData } from "@/lib/data";
import type { ProfilePreferences } from "@/lib/profileHub";
import { FieldRow, GroupTitle, SurfaceHead } from "./parts";

/** Account and B2B details, read-only here; the editor changes them. */
export default function OverviewView({ profile, prefs, onEdit }: { profile: UserProfileData; prefs: ProfilePreferences; onEdit: () => void }) {
  const t = useTranslations("ProfileHub");
  const empty = t("notSet");
  // The IBAN is shown masked: the last 4 are enough to recognise it on screen.
  const iban = prefs.depositIban ? `${formatIban(prefs.depositIban).slice(0, 4)} •••• ${prefs.depositIban.slice(-4)}` : null;
  return (
    <div className={SURFACE} data-profile-overview>
      <SurfaceHead title={t("detailsTitle")} meta={[t("detailsMeta")]} id="details">
        <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-blue-700 px-3.5 text-[12.5px] font-semibold text-white hover:bg-blue-800" data-edit-profile-inline>
          <Pencil size={13} strokeWidth={2.2} />
          {t("editProfile")}
        </button>
      </SurfaceHead>
      <dl className="m-0">
        <GroupTitle>{t("groupPerson")}</GroupTitle>
        <FieldRow label={t("fName")} value={profile.name} empty={empty} data="name" />
        <FieldRow label={t("fJobTitle")} value={profile.jobTitle} empty={empty} data="jobTitle" />
        <FieldRow label={t("fPhone")} value={profile.phone} empty={empty} data="phone" />
        <FieldRow label={t("fEmail")} value={profile.email} empty={empty} data="email" />
        <GroupTitle>{t("groupCompany")}</GroupTitle>
        <FieldRow label={t("fCompany")} value={profile.companyName} empty={empty} data="companyName" />
        <FieldRow label={t("fVat")} value={profile.vatNumber} mono empty={empty} data="vatNumber" />
        <FieldRow label={t("fBillingEmail")} value={prefs.billingEmail} empty={empty} data="billingEmail" />
        <FieldRow label={t("fIban")} value={iban} mono empty={empty} data="depositIban" />
        <GroupTitle>{t("groupPrefs")}</GroupTitle>
        <FieldRow label={t("fFulfilment")} value={prefs.preferredFulfilment ? t(`ful_${prefs.preferredFulfilment}`) : null} empty={t("fulfilmentAny")} data="preferredFulfilment" />
        <FieldRow label={t("fPayment")} value={t("paymentSepa")} empty={empty} data="payment" />
        <FieldRow label={t("fUnits")} value={t(`units_${prefs.preferredUnits}`)} empty={empty} data="preferredUnits" />
        <FieldRow label={t("fLanguage")} value={nativeLanguageName(profile.locale)} empty={empty} data="locale" />
      </dl>
    </div>
  );
}
