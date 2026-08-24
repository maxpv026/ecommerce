"use client";

import { useMemo, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { nativeLanguageName } from "@/lib/languageNames";
import { updateUserLocale } from "@/lib/actions/locale";
import MobileSubPageHeader from "./MobileSubPageHeader";

export default function MobileLanguageSwitcherLayout() {
  const t = useTranslations("LanguageSwitcher");
  const activeLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const [isPending, startTransition] = useTransition();

  const languages = useMemo(
    () =>
      routing.locales
        .map((locale) => ({ locale, name: nativeLanguageName(locale) }))
        .sort((a, b) => a.name.localeCompare(b.name, activeLocale)),
    [activeLocale]
  );

  const selectLocale = (locale: string) => {
    if (locale === activeLocale) return;
    startTransition(() => {
      router.replace(pathname, { locale });
    });
    // Persist silently for signed-in users so their next login lands them
    // straight on this locale (see auth.ts's jwt/session callbacks) — never
    // blocks or surfaces errors from the switch itself.
    if (status === "authenticated") {
      void updateUserLocale(locale).catch(() => {});
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <MobileSubPageHeader title={t("title")} />

      <div
        className={`scrollbar-hide flex-1 overflow-y-auto pb-[calc(120px+env(safe-area-inset-bottom))] pt-2 transition-opacity ${
          isPending ? "opacity-60" : ""
        }`}
      >
        <div className="mx-4 overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-slate-900">
          {languages.map(({ locale, name }, idx) => {
            const isLast = idx === languages.length - 1;
            const selected = locale === activeLocale;
            return (
              <button
                key={locale}
                type="button"
                onClick={() => selectLocale(locale)}
                disabled={isPending}
                className={`flex w-full min-h-[58px] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-900/[.02] dark:hover:bg-white/[.03] ${
                  isLast ? "" : "border-b border-slate-900/[.07] dark:border-white/[.07]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold tracking-[-.02em]">{name}</span>
                  <span className="mt-[2px] block text-[11.5px] uppercase tracking-[.05em] text-slate-400 dark:text-slate-500">
                    {locale}
                  </span>
                </span>
                {selected && (
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-700 text-white">
                    <Check size={14} strokeWidth={2.6} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
