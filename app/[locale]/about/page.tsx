import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  FlaskConical,
  LayoutDashboard,
  ShieldCheck,
  Truck,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { sellerDetails } from "@/lib/seller";
import { CONTACT_EMAILS, DEVELOPER } from "@/lib/brand";
import AppChrome from "@/components/AppChrome";

type AboutProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: AboutProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AboutPage" });
  return {
    title: `${t("metaTitle")} — My Energy`,
    description: t("metaDescription"),
  };
}

/**
 * /about — the company. Every sentence is one the platform backs:
 * purity is the catalogue's own column (≥ 99.9 % on every listed gas as of
 * 2026-11-16), the F-Gas gate is /api/checkout's FGAS_UNVERIFIED/EXPIRED,
 * ADR freight is the cart's shipping line, cylinders are the profile's
 * cylinder ledger, invoices are the PDF on every confirmation. Lab testing
 * and batch traceability are NOT claimed: no lot or certificate-of-analysis
 * data exists to back them — add it before adding the words.
 *
 * Company details are the invoice letterhead (lib/seller), so the page and
 * the documents can't disagree. Static per locale.
 */
const PILLARS = [
  { key: "purity", Icon: FlaskConical },
  { key: "fgas", Icon: ShieldCheck },
  { key: "adr", Icon: Truck },
  { key: "digital", Icon: LayoutDashboard },
] as const;

const CARD =
  "rounded-[20px] border border-slate-900/[.07] bg-white/60 dark:border-white/[.08] dark:bg-white/[.03]";

export default async function AboutPage({ params }: AboutProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AboutPage");
  const seller = sellerDetails();

  return (
    <AppChrome mobileTopBar>
      <div
        className="relative mx-auto w-full max-w-[1240px] px-5 pb-12 pt-8 sm:px-8 md:pb-20 md:pt-14"
        data-about
      >
        <header className="max-w-[760px]" data-about-hero>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[.09em] text-cyan-700 dark:text-cyan-400">
            {t("kicker")}
          </p>
          <h1 className="m-0 mt-3 text-balance text-[30px] font-semibold leading-[1.1] tracking-[-.04em] text-slate-900 sm:text-[42px] dark:text-white">
            {t("title")}
          </h1>
          <p className="m-0 mt-4 text-pretty text-[15.5px] leading-[1.65] text-slate-600 sm:text-[17px] dark:text-slate-300">
            {t("intro")}
          </p>
        </header>

        <section
          className="mt-12 md:mt-16"
          aria-labelledby="about-pillars"
          data-about-pillars
        >
          <h2
            id="about-pillars"
            className="m-0 mb-5 text-[13px] font-semibold uppercase tracking-[.08em] text-slate-600 dark:text-slate-400"
          >
            {t("pillarsTitle")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map(({ key, Icon }) => (
              <article key={key} className={`${CARD} p-6`}>
                <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/[.05] text-slate-900 dark:bg-white/[.07] dark:text-white">
                  <Icon size={19} strokeWidth={1.8} aria-hidden />
                </span>
                <h3 className="m-0 text-[16px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">
                  {t(`${key}Title`)}
                </h3>
                <p className="m-0 mt-2 text-pretty text-[14px] leading-[1.6] text-slate-600 dark:text-slate-400">
                  {t(`${key}Body`)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2" data-about-bottom>
          <div className={`${CARD} p-6 md:p-7`} data-about-company>
            <h2 className="m-0 text-[16px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">
              {t("companyTitle")}
            </h2>
            <dl className="m-0 mt-4 grid gap-4 text-[14px] leading-[1.55] sm:grid-cols-2">
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-[.07em] text-slate-500 dark:text-slate-400">
                  {t("companyLegal")}
                </dt>
                <dd className="m-0 mt-1 text-slate-900 dark:text-slate-100">
                  {seller.name}
                  {seller.addressLines.map((line) => (
                    <span
                      key={line}
                      className="block text-slate-600 dark:text-slate-300"
                    >
                      {line}
                    </span>
                  ))}
                  {seller.vatId && (
                    <span className="block text-slate-600 dark:text-slate-300">
                      {t("companyVat", { vat: seller.vatId })}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-[.07em] text-slate-500 dark:text-slate-400">
                  {t("companyContact")}
                </dt>
                <dd className="m-0 mt-1 flex flex-col items-start gap-1">
                  {CONTACT_EMAILS.map((email) => (
                    <a
                      key={email}
                      href={`mailto:${email}`}
                      className="font-medium text-cyan-700 hover:underline dark:text-cyan-400"
                    >
                      {email}
                    </a>
                  ))}
                </dd>
              </div>
            </dl>
          </div>

          <div
            className={`${CARD} flex flex-col justify-between gap-5 p-6 md:p-7`}
            data-about-cta
          >
            <div>
              <h2 className="m-0 text-[16px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">
                {t("ctaTitle")}
              </h2>
              <p className="m-0 mt-2 text-pretty text-[14px] leading-[1.6] text-slate-600 dark:text-slate-400">
                {t("ctaBody")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {t("ctaCatalog")}
                <ArrowRight size={16} aria-hidden />
              </Link>
              <Link
                href="/hub"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-900/[.12] px-4 py-2.5 text-[14px] font-semibold text-slate-900 transition-colors hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-white dark:hover:bg-white/[.06]"
              >
                {t("ctaHub")}
              </Link>
            </div>
          </div>
        </section>

        <p
          className="m-0 mt-12 text-[12px] text-slate-600 dark:text-slate-400"
          data-about-dev
        >
          {t.rich("devNote", {
            name: DEVELOPER.name,
            link: (chunks) => (
              <a
                href={DEVELOPER.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-slate-300 underline-offset-2 hover:text-slate-700 dark:decoration-slate-600 dark:hover:text-slate-200"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </AppChrome>
  );
}
