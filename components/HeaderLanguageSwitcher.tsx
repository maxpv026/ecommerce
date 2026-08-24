"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Globe } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { nativeLanguageName } from "@/lib/languageNames";
import { updateUserLocale } from "@/lib/actions/locale";

export default function HeaderLanguageSwitcher() {
  const t = useTranslations("LanguageSwitcher");
  const activeLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const languages = useMemo(
    () =>
      routing.locales
        .map((locale) => ({ locale, name: nativeLanguageName(locale) }))
        .sort((a, b) => a.name.localeCompare(b.name, activeLocale)),
    [activeLocale]
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      // Only the desktop dropdown closes on outside click — the mobile sheet
      // has its own backdrop with an explicit onClick handler.
      if (window.innerWidth < 768) return;
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectLocale = (locale: string) => {
    setOpen(false);
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

  const optionRow = (locale: string, name: string, dense: boolean) => {
    const selected = locale === activeLocale;
    return (
      <button
        key={locale}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => selectLocale(locale)}
        className={`flex w-full items-center gap-2.5 rounded-xl px-3 text-left transition-colors ${
          dense ? "py-2 text-[13px]" : "min-h-[52px] py-2.5 text-[14px]"
        } ${
          selected
            ? "bg-blue-700/10 font-semibold text-blue-700 dark:bg-blue-400/15 dark:text-blue-400"
            : "text-slate-700 hover:bg-slate-900/[.04] dark:text-slate-300 dark:hover:bg-white/[.06]"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="flex-none text-[10.5px] uppercase tracking-[.05em] text-slate-400 dark:text-slate-500">
          {locale}
        </span>
        {selected && <Check size={14} strokeWidth={2.6} className="flex-none" />}
      </button>
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        disabled={isPending}
        className="flex h-[38px] items-center gap-[7px] rounded-full border border-slate-900/[.12] bg-white px-3.5 text-[13px] font-medium text-slate-900 transition-colors hover:border-slate-900/30 disabled:opacity-60 dark:border-white/[.12] dark:bg-white/5 dark:text-slate-50 dark:hover:border-white/30"
      >
        <Globe size={15} strokeWidth={2} />
        <span className="uppercase tracking-[.02em]">{activeLocale}</span>
      </button>

      {/* Desktop: dropdown panel */}
      {open && (
        <div
          role="listbox"
          className="scrollbar-hide absolute right-0 top-[calc(100%+8px)] z-50 hidden max-h-[360px] w-[240px] overflow-y-auto rounded-2xl border border-slate-900/[.08] bg-white/85 p-1.5 shadow-[0_24px_56px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl backdrop-saturate-150 md:block dark:border-white/[.1] dark:bg-slate-900/85"
        >
          {languages.map(({ locale, name }) => optionRow(locale, name, true))}
        </div>
      )}

      {/* Mobile: bottom sheet */}
      <div className="md:hidden">
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className={`fixed inset-0 z-[100] bg-slate-950/40 transition-opacity duration-300 ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("title")}
          className="fixed inset-x-0 bottom-0 z-[100] max-h-[75vh] rounded-t-[28px] border-t border-white/60 bg-white/95 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-26px_60px_-22px_rgba(15,23,42,0.42)] backdrop-blur-xl backdrop-saturate-150 transition-transform duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] dark:border-white/10 dark:bg-slate-900/97"
          style={{ transform: open ? "translateY(0)" : "translateY(102%)" }}
        >
          <div className="mx-auto mb-3 h-1 w-11 flex-none rounded-full bg-slate-900/[.16] dark:bg-white/20" />
          <div className="mb-2 flex items-center justify-between gap-3.5">
            <span className="text-[15px] font-semibold tracking-[-.02em]">{t("title")}</span>
          </div>
          <div role="listbox" className="scrollbar-hide max-h-[calc(75vh-72px)] overflow-y-auto pb-1">
            {languages.map(({ locale, name }) => optionRow(locale, name, false))}
          </div>
        </div>
      </div>
    </div>
  );
}
