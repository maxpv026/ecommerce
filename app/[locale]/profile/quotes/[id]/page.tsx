import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import AppChrome from "@/components/AppChrome";
import QuoteDocument from "@/components/QuoteDocument";
import { getQuoteForUser } from "@/lib/quotes";
import { sellerDetails } from "@/lib/seller";

export const metadata: Metadata = {
  title: "Quote — My Energy",
  description: "A formal My Energy price quote, valid for 48 hours.",
  robots: { index: false, follow: false },
};

// Status turns to "expired" on the clock, and an order can accept it at any time.
export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: PageProps<"/[locale]/profile/quotes/[id]">) {
  const { locale, id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect({ href: { pathname: "/auth", query: { callbackUrl: `/profile/quotes/${id}` } }, locale });
    // redirect() throws, but return anyway: a userId that is undefined would
    // make every `where: { userId }` below match ANY row in Prisma.
    return null;
  }

  // Scoped by owner: another account's quote id is a 404, not a 403.
  const quote = await getQuoteForUser(id, userId);
  if (!quote) notFound();

  return (
    <AppChrome>
      <QuoteDocument quote={quote} seller={sellerDetails()} />
    </AppChrome>
  );
}
