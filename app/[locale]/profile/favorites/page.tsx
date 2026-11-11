import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import prisma from "@/lib/prisma";
import AppChrome from "@/components/AppChrome";
import FavoritesView from "@/components/FavoritesView";
import { getFavorites } from "@/lib/actions/favorites";

export const metadata: Metadata = {
  title: "Favorites — My Energy",
  description: "Product sizes you saved, with price-drop alerts.",
  robots: { index: false, follow: false },
};

// Prices and stock on the cards are live; never serve a cached list.
export const dynamic = "force-dynamic";

export default async function FavoritesPage({ params }: PageProps<"/[locale]/profile/favorites">) {
  const { locale } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect({ href: { pathname: "/auth", query: { callbackUrl: "/profile/favorites" } }, locale });
    // redirect() throws, but return anyway: a userId that is undefined would
    // make every `where: { userId }` below match ANY row in Prisma.
    return null;
  }

  const [favorites, user] = await Promise.all([
    getFavorites(),
    prisma.user.findUnique({ where: { id: userId }, select: { notifyPriceDrops: true } }),
  ]);

  return (
    <AppChrome>
      <FavoritesView products={favorites.ok ? favorites.products : []} priceDropsOn={user?.notifyPriceDrops ?? false} />
    </AppChrome>
  );
}
