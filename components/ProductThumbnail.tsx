"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { gasMarkForProduct, imagePathForProduct } from "@/lib/productMedia";

/**
 * The catalog grid's product artwork.
 *
 * A still render, not a live renderer: a list of twenty thumbnails does not
 * justify twenty WebGL contexts, and the interactive model belongs on the
 * product page where someone actually wants to turn it over. The images are
 * rendered from the same .glb files with the same camera and lighting
 * (`scripts/render-model-images.mjs`), so the two read as the same object.
 *
 * It fills its container rather than sizing itself, so it drops into whatever
 * box the card already had without moving the layout.
 */

interface ProductThumbnailProps {
  sku: string;
  /**
   * Product name. A few SKUs drop the R ("HC-410A-50") and are only
   * identifiable from the name, so pass it when you have it.
   */
  name?: string;
  /**
   * Drawn when this product has no render of its own — equipment, custom
   * blends — and when the file turns out to be missing.
   */
  fallback: ReactNode;
  /** Passed to next/image; describes the rendered width at each breakpoint. */
  sizes?: string;
  className?: string;
  priority?: boolean;
}

export default function ProductThumbnail({
  sku,
  name,
  fallback,
  sizes = "(max-width: 768px) 40vw, 20vw",
  className = "absolute inset-0",
  priority = false,
}: ProductThumbnailProps) {
  const src = imagePathForProduct({ sku, name });
  // Kept on both branches so the tile stays identifiable after it falls back.
  const mark = gasMarkForProduct({ sku, name })?.toLowerCase() ?? "";
  // A resolved path is not a promise the file exists; if it 404s or fails to
  // decode we show the same placeholder as a product with no render at all,
  // so the tile is never blank and the grid never reflows.
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={`${className} block`} data-product-thumb data-thumb-mode="fallback" data-thumb-mark={mark}>
        {fallback}
      </span>
    );
  }

  return (
    <span className={`${className} block`} data-product-thumb data-thumb-mode="image" data-thumb-mark={mark} data-thumb-src={src}>
      <Image
        src={src}
        alt={name ?? sku}
        fill
        sizes={sizes}
        priority={priority}
        className="object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
