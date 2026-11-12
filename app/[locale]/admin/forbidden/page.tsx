import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { guardAdmin } from "@/lib/admin/guardAdmin";

export const metadata: Metadata = { title: "403 — My Energy admin", robots: { index: false } };

/**
 * The in-shell 403: a staff member opened a screen their role doesn't
 * include. proxy.ts rewrites here with HTTP 403; guardAdmin redirects here
 * when the row disagrees with a stale session claim.
 */
export default async function AdminForbiddenPage({ params }: { params: Promise<{ locale: string }> }) {
  const admin = await guardAdmin(params, "admin.access");
  const t = await getTranslations("AdminRbac");
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-6 py-16 text-center" data-admin-forbidden>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400">
        <ShieldAlert size={24} />
      </span>
      <p className="m-0 mt-5 font-mono text-[12px] font-semibold tracking-[.12em] text-slate-400">403 · FORBIDDEN</p>
      <h1 className="m-0 mt-2 text-[26px] font-semibold tracking-[-.03em] text-slate-900 dark:text-white">{t("forbiddenTitle")}</h1>
      <p className="m-0 mt-2 text-[14px] leading-[1.6] text-slate-500 dark:text-slate-400">{t("forbiddenBody", { role: t(`badge_${admin.role}`) })}</p>
      <Link href="/admin" className="mt-6 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-[13.5px] font-medium text-white hover:bg-blue-500">
        {t("forbiddenBack")}
      </Link>
    </div>
  );
}
