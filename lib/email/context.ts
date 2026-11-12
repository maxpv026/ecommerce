import "server-only";

import { emailTranslator } from "@/lib/emailTranslator";
import { sellerDetails } from "@/lib/seller";
import { absoluteUrl } from "@/lib/siteUrl";
import { renderEmail, type EmailDoc, type RichSegment } from "@/lib/email/design";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Everything a sender needs to build one email in the recipient's language:
 * its own namespace's translator, the shared shell strings (EmailShell),
 * formatters, absolute links, and `render`, which wraps the doc in the
 * localized master shell (header, footer links, legal sender).
 *
 * No Prisma: lib/mail.ts (the sign-in code path) uses this too.
 */
export async function emailContext(locale: string | null | undefined, namespace?: string) {
  const shell = await emailTranslator(locale, "EmailShell");
  const loc = shell.locale;
  const own = namespace ? await emailTranslator(loc, namespace) : shell;
  const s = shell.t as Translate;
  const t = own.t as Translate;
  const url = (path: string) => absoluteUrl(path, loc);

  const seller = sellerDetails();
  const chrome = {
    brand: "My Energy",
    tagline: s("tagline"),
    regulation: s("regulation"),
    links: [
      { label: s("linkAccount"), href: url("/profile") },
      { label: s("linkOrders"), href: url("/profile/orders") },
      { label: s("linkSds"), href: url("/compliance/sds") },
      { label: s("linkPreferences"), href: url("/profile/settings") },
    ],
    sender: [seller.name, ...seller.addressLines, seller.vatId ? `VAT ${seller.vatId}` : ""].filter(Boolean).join(" · "),
  };

  const moneyFormat = new Intl.NumberFormat(loc, { style: "currency", currency: "EUR" });
  const dateFormat = new Intl.DateTimeFormat(loc, { dateStyle: "long", timeZone: "UTC" });
  // Delivery slots are local to the business (Sofia), not UTC.
  const dateTimeFormat = new Intl.DateTimeFormat(loc, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Sofia" });

  return {
    locale: loc,
    t,
    /** EmailShell strings (ledger labels, badges, footer). */
    s,
    money: (n: number) => moneyFormat.format(n),
    date: (d: Date) => dateFormat.format(d),
    dateTime: (d: Date) => dateTimeFormat.format(d),
    url,
    /** A translated sentence with some of its values in bold (order numbers, totals). */
    rich: (key: string, values: Record<string, string | number>, bold: string[], tr: Translate = t): RichSegment[] => richMessage(tr, key, values, bold),
    render: (doc: Omit<EmailDoc, "lang">) => renderEmail({ ...doc, lang: loc }, chrome),
  };
}

export type EmailContext = Awaited<ReturnType<typeof emailContext>>;

/**
 * Formats a message with some placeholders marked, then splits on the marks,
 * so a translator can move "{order}" anywhere in the sentence and it is still
 * the bold part. (ICU tags would need t.rich, which only exists in React.)
 */
function richMessage(t: Translate, key: string, values: Record<string, string | number>, bold: string[]): RichSegment[] {
  const MARK = "⁣";
  const marked = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, bold.includes(k) ? `${MARK}${k}${MARK}` : v]));
  const out = t(key, marked);
  return out
    .split(MARK)
    .map((part, i): RichSegment => (i % 2 === 1 ? { b: String(values[part] ?? part) } : part))
    .filter((p) => p !== "");
}
