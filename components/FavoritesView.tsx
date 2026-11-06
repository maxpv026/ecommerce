"use client";

import { useId, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, BellRing, Heart, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import ProductCard from "./ProductCard";
import StockNotifyModal from "./StockNotifyModal";
import { useCartStore } from "@/lib/store/cart";
import { useFavoritesStore } from "@/lib/store/favorites";
import { updateNotificationPreferences } from "@/lib/actions/notifications";
import { isPurchasable } from "@/lib/waitlist";
import type { StoreProduct } from "@/lib/data";

/**
 * /profile/favorites — the buyer's saved sizes as the same cards the catalog
 * uses. Un-hearting a card removes it from the grid at once (the favourites
 * store is the live state; `products` is the server's snapshot).
 */
export default function FavoritesView({ products, priceDropsOn }: { products: StoreProduct[]; priceDropsOn: boolean }) {
  const t = useTranslations("Favorites");
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const ids = useFavoritesStore((s) => s.ids);
  const ready = useFavoritesStore((s) => s.status === "ready" && s.userId === userId);
  const cartItems = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const [notifyFor, setNotifyFor] = useState<StoreProduct | null>(null);
  const [alertsOn, setAlertsOn] = useState(priceDropsOn);
  const [saving, startSaving] = useTransition();
  const alertsId = useId();

  // Until the store has loaded, trust the server's list.
  const shown = ready ? products.filter((p) => ids.has(p.id)) : products;

  const addToCart = (product: StoreProduct) => {
    if (!isPurchasable(product)) return;
    addItem(
      {
        sku: product.sku,
        name: product.name,
        variant: product.weightLabel,
        pricePerKg: product.pricePerKg,
        weightKg: product.weightKg,
        deposit: product.cylinderDeposit,
      },
      1
    );
  };

  // The same User.notifyPriceDrops column as the switch in settings, written
  // through the same action. Flips at once; puts it back if the save fails.
  const setAlerts = (next: boolean) => {
    if (saving) return;
    setAlertsOn(next);
    startSaving(async () => {
      const result = await updateNotificationPreferences({ priceDrops: next }).catch(() => null);
      if (result?.ok) toast.success(next ? t("alertsOnToast") : t("alertsOffToast"));
      else {
        setAlertsOn(!next);
        toast.error(t("alertsFailed"));
      }
    });
  };

  return (
    <div className="flex-1 bg-canvas">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-6 pb-[calc(120px+env(safe-area-inset-bottom))] md:px-8 md:py-12">
        <div className="mb-6 flex items-start gap-2">
          <Link
            href="/profile"
            aria-label={t("backToProfile")}
            className="-ml-2.5 flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-700 hover:bg-slate-900/[.06] dark:text-slate-200 dark:hover:bg-white/[.08]"
          >
            <ArrowLeft size={20} strokeWidth={2.2} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[26px] font-semibold tracking-[-.04em] text-foreground md:text-[32px]">{t("title")}</h1>
            <p className="m-0 mt-1.5 max-w-[620px] text-[13.5px] leading-[1.6] text-muted-foreground">{t("intro")}</p>
          </div>
        </div>

        {/* Price-drop alerts, right where the list is. */}
        <div
          data-price-alert-toggle
          className="mb-7 flex items-center gap-3.5 rounded-[18px] bg-card px-4 py-3.5 shadow-card md:max-w-[560px] dark:border dark:border-hairline"
        >
          <span
            className={`flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors ${
              alertsOn ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <BellRing size={16} strokeWidth={2} />
          </span>
          <label htmlFor={alertsId} className="min-w-0 flex-1 cursor-pointer text-[13px] leading-[1.5] text-muted-foreground">
            <span className="block font-semibold text-foreground">{t("alertsTitle")}</span>
            {alertsOn ? t("alertsBodyOn") : t("alertsBodyOff")}
          </label>
          <button
            id={alertsId}
            type="button"
            role="switch"
            aria-checked={alertsOn}
            onClick={() => setAlerts(!alertsOn)}
            disabled={saving}
            data-price-alert-switch
            className={`relative inline-flex h-7 w-12 flex-none items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-70 ${
              alertsOn ? "bg-primary" : "bg-slate-300 dark:bg-white/20"
            }`}
          >
            <span
              className={`inline-block h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,.25)] transition-transform duration-200 ${
                alertsOn ? "translate-x-[23px]" : "translate-x-[3px]"
              }`}
            />
            {saving && <Loader2 size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />}
          </button>
        </div>


        {shown.length === 0 ? (
          <div
            data-favorites-empty
            className="flex flex-col items-center rounded-[22px] border border-dashed border-border px-6 py-14 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Heart size={20} strokeWidth={2} />
            </span>
            <p className="m-0 mt-4 text-[15px] font-semibold text-foreground">{t("emptyTitle")}</p>
            <p className="m-0 mt-1 max-w-[380px] text-[13px] text-muted-foreground">{t("emptyBody")}</p>
            <Link
              href="/products"
              className="mt-5 inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover"
            >
              {t("emptyCta")}
            </Link>
          </div>
        ) : (
          <div
            data-favorites-grid
            className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,minmax(290px,1fr))] md:gap-[18px]"
          >
            <AnimatePresence mode="popLayout">
              {shown.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  // Two-up on phones, the full card from md up.
                  variant="default"
                  className="max-md:hidden"
                  inCart={cartItems.some((c) => c.sku === product.sku)}
                  onAddToCart={addToCart}
                  onNotify={setNotifyFor}
                />
              ))}
              {shown.map((product) => (
                <ProductCard
                  key={`m-${product.id}`}
                  product={product}
                  variant="compact"
                  className="md:hidden"
                  inCart={cartItems.some((c) => c.sku === product.sku)}
                  onAddToCart={addToCart}
                  onNotify={setNotifyFor}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <StockNotifyModal
        isOpen={notifyFor !== null}
        onClose={() => setNotifyFor(null)}
        productId={notifyFor?.id ?? ""}
        productName={notifyFor?.name ?? ""}
      />
    </div>
  );
}
