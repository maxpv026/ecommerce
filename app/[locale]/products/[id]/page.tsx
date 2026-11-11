import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProducts } from "@/lib/data";
import ProductDetail from "@/components/ProductDetail";

interface ProductDetailRouteProps {
  params: Promise<{ id: string }>;
}

/**
 * ISR: each product page is rendered on its first visit, then served from
 * cache. The catalogue it reads is tagged (PRODUCTS_TAG), so any stock,
 * price or size change expires it at once (lib/catalogCache); 5 minutes is
 * only a backstop. The page never decides what can be bought: cart and
 * checkout re-read stock and prices from the database.
 */
export const revalidate = 300;

/** Empty: nothing pre-rendered at build; every product page is ISR on first request. */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: ProductDetailRouteProps): Promise<Metadata> {
  const { id } = await params;
  // The cached catalogue, not a second uncached query.
  const product = (await getProducts()).find((p) => p.id === id);
  if (!product) return {};
  return {
    title: `${product.name} — My Energy`,
    description: `${product.name} · ${product.weightLabel} · ${product.gwpClass}`,
  };
}

export default async function ProductDetailRoute({ params }: ProductDetailRouteProps) {
  const { id } = await params;
  // One fetch serves both the product and its rail of related items.
  const all = await getProducts();
  const product = all.find((p) => p.id === id);
  if (!product) notFound();

  // "Frequently bought together": same category first, then the rest.
  const related = [
    ...all.filter((p) => p.id !== id && p.category === product.category),
    ...all.filter((p) => p.id !== id && p.category !== product.category),
  ].slice(0, 6);

  // The size selector. Each size is its own Product row; the rows sharing
  // this one's family (its familyKey, or its refrigerant mark when none is
  // set — lib/productFamily) are its sizes, smallest first. Always includes
  // `product` itself.
  const variants = all
    .filter((p) => p.family === product.family)
    .sort((a, b) => a.weightKg - b.weightKg || a.containerType.localeCompare(b.containerType));

  return <ProductDetail product={product} related={related} variants={variants} />;
}
