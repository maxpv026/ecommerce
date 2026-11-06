"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { useFavorite } from "@/lib/hooks/useFavorite";

const SIZES = {
  sm: { box: "h-8 w-8 rounded-full", icon: 15 },
  md: { box: "h-9 w-9 rounded-full", icon: 17 },
  // Product page: matches the 52px quantity stepper and Add-to-cart button.
  lg: { box: "h-[52px] w-[52px] rounded-2xl", icon: 20 },
} as const;

/**
 * The heart. Saves this exact size to the buyer's Favorites; filled
 * sapphire when saved. State is shared (lib/store/favorites), so the heart
 * on a card and the one on the product page always agree.
 */
export default function FavoriteButton({
  productId,
  productName,
  size = "md",
  className = "",
}: {
  productId: string;
  productName: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const t = useTranslations("Favorites");
  const { active, busy, toggle } = useFavorite(productId, productName);
  const dims = SIZES[size];

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      onClick={(event) => {
        // On a card the heart overlays the product image, which is a link.
        event.preventDefault();
        event.stopPropagation();
        void toggle();
      }}
      disabled={busy}
      aria-pressed={active}
      aria-label={active ? t("removeAria", { name: productName }) : t("addAria", { name: productName })}
      title={active ? t("removeTitle") : t("addTitle")}
      data-favorite-button
      data-favorited={active ? "true" : "false"}
      className={`inline-flex ${dims.box} flex-none items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring ${
        size === "lg"
          ? "border border-slate-900/[.07] bg-slate-100 dark:border-hairline dark:bg-surface-3"
          : "bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,.08)] ring-1 ring-slate-900/[.06] backdrop-blur dark:bg-black/40 dark:ring-white/10"
      } ${active ? "text-primary dark:text-blue-300" : "text-slate-500 hover:text-primary dark:text-slate-300 dark:hover:text-blue-300"} ${className}`}
    >
      <motion.span
        key={active ? "on" : "off"}
        initial={{ scale: active ? 0.6 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
        className="flex"
      >
        <Heart size={dims.icon} strokeWidth={2} fill={active ? "currentColor" : "none"} />
      </motion.span>
    </motion.button>
  );
}
