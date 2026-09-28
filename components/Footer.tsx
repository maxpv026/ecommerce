"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

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
 * write to StockSubscription. Restore this column only alongside a mailing
 * list that actually receives the address.
 *
 * Theme-following throughout: light is glass on slate-50, dark is the
 * Rich Obsidian palette, both driven by the global toggle.
 */

const PRODUCT_LINKS: { key: string; href: string }[] = [
  { key: "linkCatalog", href: "/products" },
  { key: "linkDashboard", href: "/profile" },
  { key: "linkOrderHistory", href: "/profile/orders" },
];

// One entry, on purpose: /compliance is the section root and redirects to
// the SDS library. Certifications stays reachable from the dashboard.
const RESOURCE_LINKS: { key: string; href: string }[] = [
  { key: "linkSdsFgas", href: "/compliance" },
];

/**
 * Muted until hovered, then the brand cyan. Light mode uses cyan-700, not
 * cyan-600: on a near-white footer the lighter shade lands at 3.52:1, under
 * the 4.5:1 AA floor for text this size.
 */
const LINK_CLASSES =
  "text-[13.5px] text-slate-500 transition-colors hover:text-cyan-700 dark:text-slate-400 dark:hover:text-cyan-400";

const HEADING_CLASSES = "mb-4 text-[12.5px] font-semibold tracking-[-.01em] text-slate-900 dark:text-white";

export default function Footer() {
  const t = useTranslations("Footer");


  return (
    <footer
      data-footer
      className="relative hidden overflow-hidden border-t border-slate-200 bg-slate-50/50 backdrop-blur-md md:block dark:border-white/10 dark:bg-[#0a0a0c]/80"
    >
      {/* Mesh glow tucked into the bottom-right corner; dimmer on light so
          it stays a suggestion rather than a smudge. */}
      <div className="pointer-events-none absolute -bottom-[300px] -right-[140px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.1] blur-[120px] dark:opacity-[.22]" />
      <div className="pointer-events-none absolute -bottom-[280px] right-[120px] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.08] blur-[120px] dark:opacity-[.2]" />

      <div className="relative mx-auto grid max-w-[1240px] grid-cols-1 gap-10 px-8 pt-16 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1.2fr] lg:gap-13">
        <div>
          <div className="mb-4 flex items-center gap-[9px]">
            <span className="block h-3.5 w-3.5 rounded-full border-[3.5px] border-slate-900 dark:border-slate-50" />
            <span className="text-[17px] font-semibold tracking-[-.035em] text-slate-900 dark:text-white">
              My Energy
            </span>
          </div>
          <p className="m-0 max-w-[250px] text-pretty text-[13.5px] leading-[1.6] text-slate-500 dark:text-slate-400">
            {t("tagline")}
          </p>
        </div>

        <div>
          <div className={HEADING_CLASSES}>{t("productsHeading")}</div>
          <div className="flex flex-col gap-2.5">
            {PRODUCT_LINKS.map(({ key, href }) => (
              <Link key={key} href={href} data-footer-link={href} className={LINK_CLASSES}>
                {t(key)}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className={HEADING_CLASSES}>{t("resourcesHeading")}</div>
          <div className="flex flex-col gap-2.5">
            {RESOURCE_LINKS.map(({ key, href }) => (
              <Link key={key} href={href} data-footer-link={href} className={LINK_CLASSES}>
                {t(key)}
              </Link>
            ))}
          </div>
        </div>

      </div>

      <div className="relative mx-auto max-w-[1240px] px-8">
        <div className="mt-13 flex flex-col items-start gap-4 border-t border-slate-200 pb-8.5 pt-[22px] sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
          <span className="text-[12.5px] text-slate-500 dark:text-slate-400">{t("copyright")}</span>
          <div className="flex gap-6">
            <Link
              href="/legal/terms"
              data-footer-link="/legal/terms"
              className="text-[12.5px] text-slate-500 transition-colors hover:text-cyan-700 dark:text-slate-400 dark:hover:text-cyan-400"
            >
              {t("termsOfService")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
