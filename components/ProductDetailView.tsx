"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import Header from "./Header";
import AuthModal from "./AuthModal";
import MobilePdpLayout from "./MobilePdpLayout";
import type { ProductDetail } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { CATALOG } from "@/lib/catalog";
import { useCartStore } from "@/lib/store/cart";

const ThreeCylinder = dynamic(() => import("./ThreeCylinder"), {
  ssr: false,
});

const ACCENT = "#1d4ed8";

interface ProductDetailViewProps {
  product: ProductDetail;
  initialWeightId?: string;
}

export default function ProductDetailView({ product, initialWeightId }: ProductDetailViewProps) {
  const t = useTranslations("Pdp");
  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [weightId, setWeightId] = useState(initialWeightId ?? product.defaultWeightId);
  const [qty, setQty] = useState(1);
  const addItem = useCartStore((s) => s.addItem);

  const selectedWeight =
    product.weights.find((w) => w.id === weightId) ?? product.weights[0];

  // The listing catalog carries the (PDP id, weight tier) → Prisma sku
  // mapping; fall back to the product's first mapped tier if this exact
  // weight has no listing entry.
  const catalogEntry =
    CATALOG.find((e) => e.productId === product.id && e.weightId === selectedWeight.id) ??
    CATALOG.find((e) => e.productId === product.id);

  const addToCart = () => {
    if (!catalogEntry) return;
    addItem(
      {
        sku: catalogEntry.dbSku,
        name: product.name,
        variant: `${selectedWeight.label} · ${product.certificationBadge}`,
        price: selectedWeight.price,
      },
      qty
    );
  };

  const specs = useMemo(
    () => [...product.baseSpecs, { key: t("netWeight"), value: selectedWeight.label }],
    [product.baseSpecs, selectedWeight.label, t]
  );

  const total = selectedWeight.price * qty;

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <div className="hidden md:block">
      <Header
        query={query}
        onQueryChange={setQuery}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      <div className="mx-auto flex max-w-[1240px] items-center gap-2 px-8 pt-5.5 text-[12.5px] text-slate-400 dark:text-slate-500">
        <Link href="/#grid" className="text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-50">
          {t("cylindersBreadcrumb")}
        </Link>
        <span>/</span>
        <Link href="/#grid" className="text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-50">
          {product.breadcrumbLabel}
        </Link>
        <span>/</span>
        <span className="text-slate-600 dark:text-slate-400">{selectedWeight.label}</span>
      </div>

      <section className="mx-auto grid max-w-[1240px] grid-cols-1 items-start gap-10 px-8 pb-[110px] pt-6.5 lg:grid-cols-[1.15fr_.85fr] lg:gap-16">
        {/* Media panel: mesh gradient backdrop + 3D cylinder */}
        <div className="relative aspect-square overflow-hidden rounded-[32px] border border-slate-900/[.07] bg-[#fbfcfd] dark:border-white/[.08] dark:bg-[#0a0f1c]">
          <div className="pointer-events-none absolute left-[8%] top-[6%] aspect-square w-[58%] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-40 blur-[100px] [animation:hc-float_20s_ease-in-out_infinite] dark:opacity-[.55]" />
          <div className="pointer-events-none absolute bottom-[2%] right-[2%] aspect-square w-[52%] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.38] blur-[100px] [animation:hc-float_26s_ease-in-out_infinite_reverse] dark:opacity-[.5]" />
          <div className="pointer-events-none absolute right-[16%] top-[-6%] aspect-square w-[44%] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-50 blur-[90px] [animation:hc-float_32s_ease-in-out_infinite] dark:opacity-[.16]" />

          <ThreeCylinder modelPath={product.modelPath} />

          <div className="absolute left-[22px] top-[22px] flex items-center gap-[7px] rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-[11.5px] text-slate-700 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-700 dark:bg-blue-400" />
            {product.certificationBadge}
          </div>

          <div className="absolute bottom-[22px] right-[22px] w-[196px] rounded-[18px] border border-white/70 bg-white/60 p-4 shadow-[0_20px_44px_-18px_rgba(15,23,42,0.3)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/70 dark:shadow-[0_20px_44px_-18px_rgba(0,0,0,0.6)]">
            <div className="mb-3 text-[10px] tracking-[.09em] text-slate-500 dark:text-slate-400">{t("keySpecs")}</div>
            <div className="flex flex-col gap-2.5">
              {product.keySpecs.map((spec) => (
                <div key={spec.label} className="flex justify-between text-[12.5px]">
                  <span className="text-slate-500 dark:text-slate-400">{spec.label}</span>
                  <span className="font-semibold">{spec.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Info panel */}
        <div className="pt-3">
          <div className="mb-3 text-xs tracking-[.09em] text-slate-400 dark:text-slate-500">{product.category}</div>
          <h1 className="m-0 text-[34px] font-semibold leading-[1.06] tracking-[-.04em] text-balance sm:text-[42px]">
            {product.name}
          </h1>
          <p className="mt-4 text-[15.5px] leading-[1.6] text-slate-600 text-pretty dark:text-slate-400">
            {product.description}
          </p>

          <div className="mt-7 flex items-baseline gap-[11px]">
            <span className="text-[34px] font-semibold tracking-[-.035em]">
              {formatPrice(selectedWeight.price)}
            </span>
            <span className="text-sm text-slate-400 line-through dark:text-slate-500">
              {formatPrice(product.compareAtPrice)}
            </span>
            <span className="rounded-[7px] bg-blue-50 px-[9px] py-1 text-[11.5px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-400">
              {product.discountLabel}
            </span>
          </div>
          <div className="mt-1.5 text-[12.5px] text-slate-400 dark:text-slate-500">{product.availability}</div>

          <div className="mb-2.5 mt-7.5 text-xs tracking-[.08em] text-slate-500 dark:text-slate-400">
            {t("cylinderWeight")}
          </div>
          <div className="flex gap-2.5">
            {product.weights.map((w) => {
              const selected = w.id === weightId;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWeightId(w.id)}
                  className="flex flex-col items-start gap-[3px] rounded-[14px] border bg-white px-4 py-2.5 transition-[border-color,box-shadow] duration-200 dark:bg-white/5"
                  style={{
                    borderColor: selected ? ACCENT : "var(--hc-border-idle)",
                    boxShadow: selected ? `0 0 0 3px ${ACCENT}1f` : "none",
                  }}
                >
                  <span className="text-sm font-semibold tracking-[-.01em]">{w.label}</span>
                  <span className="text-[11.5px] text-slate-400 dark:text-slate-500">{formatPrice(w.price)}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-7.5 flex gap-2.5">
            <div className="flex h-[54px] items-center gap-0.5 rounded-[15px] border border-slate-900/[.12] px-1.5 dark:border-white/[.12]">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label={t("decreaseQuantity")}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-lg text-slate-600 transition-colors hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
              >
                −
              </button>
              <span className="min-w-[26px] text-center text-[14.5px] font-semibold">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                aria-label={t("increaseQuantity")}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-lg text-slate-600 transition-colors hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={addToCart}
              className="h-[54px] flex-1 rounded-[15px] text-[15px] font-semibold tracking-[-.01em] text-white transition-transform duration-200 active:scale-[.99]"
              style={{ background: ACCENT, boxShadow: `0 14px 30px -12px ${ACCENT}a6` }}
            >
              {t("addToCart")} · {formatPrice(total)}
            </button>
          </div>

          <div className="mt-8.5 flex flex-col gap-3.5 border-t border-slate-900/[.08] pt-5.5 dark:border-white/[.08]">
            {specs.map((spec) => (
              <div key={spec.key} className="flex justify-between gap-5 text-[13.5px]">
                <span className="text-slate-500 dark:text-slate-400">{spec.key}</span>
                <span className="font-medium tracking-[-.01em]">{spec.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6.5 rounded-[15px] bg-slate-50 px-[17px] py-[15px] text-[12.5px] leading-[1.55] text-slate-500 dark:bg-white/[.04] dark:text-slate-400">
            {product.complianceNote}
          </div>
        </div>
      </section>
      </div>

      <div className="block md:hidden">
        <MobilePdpLayout product={product} initialWeightId={initialWeightId} />
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
