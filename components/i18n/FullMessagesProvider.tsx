import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { fullClientMessages } from "@/lib/i18n/clientMessages";

/**
 * Gives a route's client components the namespaces the root layout leaves
 * out (lib/i18n/clientMessages). Used by the layouts of /cart, /checkout,
 * /profile, /products/[id], /hub, /admin and /compliance/sds.
 *
 * `locale` comes from the layout's params so the route can stay static:
 * setRequestLocale must run in every layout that reads messages, or
 * next-intl falls back to request headers and the route turns dynamic.
 */
export default async function FullMessagesProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  setRequestLocale(locale);
  const messages = await getMessages();
  return <NextIntlClientProvider messages={fullClientMessages(messages)}>{children}</NextIntlClientProvider>;
}
