"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";

const PRODUCT_LINKS: { key: string; href: string }[] = [
  { key: "linkCylinders", href: "/cylinders" },
  { key: "linkCustomBlends", href: "#" },
  { key: "linkBulkOrders", href: "#" },
  { key: "linkEquipment", href: "#" },
];

const RESOURCE_LINKS: { key: string; href: string }[] = [
  { key: "linkSds", href: "/compliance/sds" },
  { key: "linkEpaRegulations", href: "#" },
  { key: "linkCertifications", href: "/compliance/certifications" },
  { key: "linkDeveloperApi", href: "#" },
];

export default function Footer() {
  const t = useTranslations("Footer");
  const [email, setEmail] = useState("");

  return (
    <footer className="relative hidden overflow-hidden border-t border-slate-900/[.08] bg-slate-50 dark:border-white/[.08] dark:bg-white/[.03] md:block">
      {/* Subtle mesh glow, tech-blue + frost-cyan, tucked into the bottom-right corner */}
      <div className="pointer-events-none absolute -right-[140px] -bottom-[300px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.12] blur-[120px] dark:opacity-[.22]" />
      <div className="pointer-events-none absolute right-[120px] -bottom-[280px] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.1] blur-[120px] dark:opacity-[.2]" />

      <div className="relative mx-auto grid max-w-[1240px] grid-cols-1 gap-10 px-8 pt-16 sm:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_1fr_1.15fr] lg:gap-13">
        <div>
          <div className="mb-4 flex items-center gap-[9px]">
            <span className="block h-3.5 w-3.5 rounded-full border-[3.5px] border-slate-900 dark:border-slate-50" />
            <span className="text-[17px] font-semibold tracking-[-.035em]">My Energy</span>
          </div>
          <p className="m-0 max-w-[250px] text-[13.5px] leading-[1.6] text-slate-500 text-pretty dark:text-slate-400">
            {t("tagline")}
          </p>
        </div>

        <div>
          <div className="mb-4 text-[12.5px] font-semibold tracking-[-.01em]">{t("productsHeading")}</div>
          <div className="flex flex-col gap-2.5">
            {PRODUCT_LINKS.map(({ key, href }) => (
              <Link
                key={key}
                href={href}
                className="text-[13.5px] text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
              >
                {t(key)}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-4 text-[12.5px] font-semibold tracking-[-.01em]">{t("resourcesHeading")}</div>
          <div className="flex flex-col gap-2.5">
            {RESOURCE_LINKS.map(({ key, href }) => (
              <Link
                key={key}
                href={href}
                className="text-[13.5px] text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
              >
                {t(key)}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-4 text-[12.5px] font-semibold tracking-[-.01em]">{t("restockHeading")}</div>
          <p className="m-0 mb-3.5 text-[13px] leading-[1.55] text-slate-500 dark:text-slate-400">
            {t("restockBody")}
          </p>
          <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="h-[42px] min-w-0 flex-1 rounded-[11px] border border-slate-900/[.12] bg-white px-3.5 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-white/[.12] dark:bg-white/5 dark:text-slate-50 dark:placeholder:text-slate-500"
            />
            <button
              type="submit"
              aria-label={t("subscribeAria")}
              className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px] bg-blue-700 text-white transition-colors hover:bg-blue-800"
            >
              <ArrowRight size={16} strokeWidth={2} />
            </button>
          </form>
        </div>
      </div>

      <div className="relative mx-auto max-w-[1240px] px-8">
        <div className="mt-13 flex flex-col items-start gap-4 border-t border-slate-900/10 pb-8.5 pt-[22px] sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
          <span className="text-[12.5px] text-slate-400 dark:text-slate-500">{t("copyright")}</span>
          <div className="flex gap-6">
            <a
              href="#"
              className="text-[12.5px] text-slate-400 transition-colors hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-50"
            >
              {t("privacyPolicy")}
            </a>
            <a
              href="#"
              className="text-[12.5px] text-slate-400 transition-colors hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-50"
            >
              {t("termsOfService")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
