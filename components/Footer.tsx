"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { isMobileNavVisible } from "./MobileAppShell";
import { CONTACT_EMAILS, DEVELOPER } from "@/lib/brand";

/**
 * Global footer.
 *
 * Every link here goes somewhere real — the previous version was mostly
 * `href="#"` placeholders, which read as navigation and did nothing. If a
 * destination doesn't exist yet, the link doesn't either.
 *
 * The "Restock Alerts" email capture used to sit in a fourth column. It had
 * no backend: it validated the address, showed a "you're subscribed" toast
 * and stored nothing, so every person who used it believed they were on a
 * list that did not exist. Removed rather than left pending — the real
 * per-product waitlist is StockNotifyBlock on the product page, which does
 * write to StockSubscription. Restore that column only alongside a mailing
 * list that actually receives the address.
 *
 * The brand badges are claims, so each is one the data backs: the F-Gas
 * regulation the checkout enforces, the ADR freight line every cart quotes,
 * and the lowest purity listed on any gas in the catalogue (99.9 % as of
 * 2026-11-16 — revisit the badge if a lower-purity product is listed).
 *
 * Phones: shown wherever the bottom dock is (it carries the dock's clearance,
 * which MobileAppShell's <main> no longer does); hidden on the dock-less
 * sub-pages, whose own fixed bars (checkout's Place Order, …) own the bottom.
 */

const COLUMNS: { heading: string; links: { key: string; href: string }[] }[] = [
  {
    heading: "productsHeading",
    links: [
      { key: "linkCatalog", href: "/products" },
      { key: "linkCategories", href: "/categories" },
    ],
  },
  {
    heading: "resourcesHeading",
    links: [
      { key: "linkHub", href: "/hub" },
      // /compliance is the section root and redirects to the SDS library.
      { key: "linkSdsFgas", href: "/compliance" },
    ],
  },
  {
    heading: "companyHeading",
    links: [
      { key: "linkAbout", href: "/about" },
      { key: "linkDashboard", href: "/profile" },
      { key: "linkOrderHistory", href: "/profile/orders" },
    ],
  },
];

const BADGES = ["badgeFgas", "badgeAdr", "badgePurity"] as const;

/**
 * Muted until hovered, then the brand cyan. Light mode uses cyan-700, not
 * cyan-600: on a near-white footer the lighter shade lands at 3.52:1, under
 * the 4.5:1 AA floor for text this size.
 */
const LINK_CLASSES =
  "text-[13.5px] text-slate-500 transition-colors hover:text-cyan-700 dark:text-slate-400 dark:hover:text-cyan-400";

const SMALL_LINK_CLASSES =
  "text-[12.5px] text-slate-500 transition-colors hover:text-cyan-700 dark:text-slate-400 dark:hover:text-cyan-400";

const HEADING_CLASSES = "mb-4 text-[12.5px] font-semibold tracking-[-.01em] text-slate-900 dark:text-white";

export default function Footer() {
  const t = useTranslations("Footer");
  const pathname = usePathname();
  const onPhone = isMobileNavVisible(pathname);
  // The admin panel is its own full-viewport app (app/[locale]/admin/layout):
  // a storefront footer under it also unpinned the sticky admin sidebar.
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer
      data-footer
      className={`relative overflow-hidden border-t border-slate-200 bg-slate-50/50 backdrop-blur-md dark:border-white/10 dark:bg-[#0a0a0c]/80 ${
        onPhone ? "block pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0" : "hidden md:block"
      }`}
    >
      {/* Mesh glow tucked into the bottom-right corner; dimmer on light so
          it stays a suggestion rather than a smudge. */}
      <div className="pointer-events-none absolute -bottom-[300px] -right-[140px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,var(--orb-blue),rgba(37,99,235,0)_70%)] opacity-[.1] blur-[120px] dark:opacity-[.22]" />
      <div className="pointer-events-none absolute -bottom-[280px] right-[120px] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_70%)] opacity-[.08] blur-[120px] dark:opacity-[.2]" />

      <div
        className="relative mx-auto grid max-w-[1240px] grid-cols-2 gap-x-6 gap-y-10 px-5 pt-12 sm:px-8 md:grid-cols-3 md:pt-16 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-x-12"
        data-footer-grid
      >
        <div className="col-span-2 md:col-span-3 lg:col-span-1" data-footer-brand>
          <Link href="/" className="mb-4 inline-flex items-center gap-[9px]">
            <span className="block h-3.5 w-3.5 rounded-full border-[3.5px] border-slate-900 dark:border-slate-50" />
            <span className="text-[17px] font-semibold tracking-[-.035em] text-slate-900 dark:text-white">My Energy</span>
          </Link>
          <p className="m-0 max-w-[290px] text-pretty text-[13.5px] leading-[1.6] text-slate-500 dark:text-slate-400">{t("tagline")}</p>
          <ul className="m-0 mt-4 flex list-none flex-wrap gap-1.5 p-0" aria-label={t("badgesAria")}>
            {BADGES.map((key) => (
              <li
                key={key}
                className="rounded-full border border-slate-900/[.08] bg-white/60 px-2.5 py-[3px] text-[11.5px] font-medium tabular-nums text-slate-600 dark:border-white/[.1] dark:bg-white/[.04] dark:text-slate-300"
              >
                {t(key)}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col items-start gap-1.5">
            {CONTACT_EMAILS.map((email) => (
              <a
                key={email}
                href={`mailto:${email}`}
                className="text-[13.5px] font-medium text-slate-700 transition-colors hover:text-cyan-700 dark:text-slate-200 dark:hover:text-cyan-400"
                data-footer-email
              >
                {email}
              </a>
            ))}
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <div className={HEADING_CLASSES}>{t(col.heading)}</div>
            <div className="flex flex-col gap-2.5">
              {col.links.map(({ key, href }) => (
                <Link key={key} href={href} data-footer-link={href} className={LINK_CLASSES}>
                  {t(key)}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-8">
        <div className="mt-12 flex flex-col items-start gap-3 border-t border-slate-200 pb-8 pt-[22px] md:mt-13 md:flex-row md:items-center md:justify-between dark:border-white/10">
          <span className="text-[12.5px] text-slate-500 dark:text-slate-400">{t("copyright")}</span>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/about" data-footer-link="/about" className={SMALL_LINK_CLASSES}>
              {t("linkAbout")}
            </Link>
            <Link href="/legal/terms" data-footer-link="/legal/terms" className={SMALL_LINK_CLASSES}>
              {t("termsOfService")}
            </Link>
            <a
              href={DEVELOPER.href}
              target="_blank"
              rel="noopener noreferrer"
              // Understated by size and place, not by colour: slate-400 would fall to 2.5:1 on the light footer.
              className="text-[12px] text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              data-footer-dev
            >
              {t("devCredit", { name: DEVELOPER.name })}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
