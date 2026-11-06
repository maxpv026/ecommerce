"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_COOKIE, routing, type AppLocale } from "@/i18n/routing";
import { updateUserLocale } from "@/lib/actions/locale";

/**
 * Switches the UI language and remembers it.
 *
 * 1. Writes NEXT_LOCALE itself. next-intl's middleware only refreshes that
 *    cookie on full page loads; a switch is a client-side navigation, so
 *    without this a visitor who picked German would be greeted by their
 *    browser's language again on their next visit to "/".
 * 2. Navigates to the same page in the new locale, keeping the query string
 *    and hash — usePathname() has neither, so a filtered catalog
 *    (/products?gasType=R32) used to lose its filter on switch.
 * 3. For a signed-in buyer, also saves it to their account (User.locale), so
 *    it follows them to another device at the next sign-in.
 */
export function useSwitchLocale() {
  const activeLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const [isPending, startTransition] = useTransition();

  const switchLocale = (locale: string) => {
    if (locale === activeLocale || !routing.locales.includes(locale as AppLocale)) return;

    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${LOCALE_COOKIE.name}=${locale}; path=/; max-age=${LOCALE_COOKIE.maxAge}; samesite=${LOCALE_COOKIE.sameSite}${secure}`;

    const { search, hash } = window.location;
    startTransition(() => {
      router.replace(`${pathname}${search}${hash}`, { locale });
    });

    // Never blocks or surfaces errors from the switch itself.
    if (status === "authenticated") void updateUserLocale(locale).catch(() => {});
  };

  return { activeLocale, switchLocale, isPending };
}
