"use client";

import { useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { useFavoritesStore } from "@/lib/store/favorites";

/**
 * Loads the signed-in buyer's favourite ids into the shared store (once per
 * account, however many components ask) and reports whether it's ready.
 * Everything that shows favourite state — hearts, the header badge — starts
 * here, so they all read the same set.
 */
export function useFavoritesSync() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const load = useFavoritesStore((s) => s.load);
  const ready = useFavoritesStore((s) => s.status === "ready" && s.userId === userId);

  useEffect(() => {
    if (userId) void load(userId);
  }, [userId, load]);

  return { userId, authenticated: status === "authenticated", ready };
}

/** How many sizes the buyer has saved; 0 until loaded or when signed out. */
export function useFavoritesCount(): number {
  const { ready } = useFavoritesSync();
  const size = useFavoritesStore((s) => s.ids.size);
  return ready ? size : 0;
}

/**
 * One product's favourite state and its toggle, with the same feedback
 * everywhere: a sign-in prompt when signed out, a confirmation with a link
 * to the list when saved, an error when the server refuses.
 */
export function useFavorite(productId: string, productName: string) {
  const t = useTranslations("Favorites");
  const router = useRouter();
  const { authenticated, ready } = useFavoritesSync();
  const toggleInStore = useFavoritesStore((s) => s.toggle);
  const active = useFavoritesStore((s) => s.ids.has(productId)) && ready;
  const busy = useFavoritesStore((s) => s.pending.has(productId));

  const toggle = useCallback(async () => {
    if (!authenticated) {
      toast(t("signInTitle"), {
        description: t("signInBody"),
        action: { label: t("signInCta"), onClick: () => router.push("/auth") },
      });
      return;
    }
    const result = await toggleInStore(productId);
    if (!result.ok) toast.error(t("toggleFailed"));
    else if (result.favorited) {
      toast.success(t("added", { name: productName }), {
        action: { label: t("view"), onClick: () => router.push("/profile/favorites") },
      });
    }
  }, [authenticated, toggleInStore, productId, productName, router, t]);

  return { active, busy, toggle };
}
