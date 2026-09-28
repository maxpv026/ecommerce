import type { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getProducts } from "@/lib/data";
import ProductDetail from "@/components/ProductDetail";

interface ProductDetailRouteProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ProductDetailRouteProps): Promise<Metadata> {
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return {};
  return {
    title: `${product.name} — My Energy`,
    description: `${product.name} · ${product.weight} · ${product.gwpClass}`,
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

  // Size tiers for the mobile layout's selector. A "25 lb / 50 lb / 100 lb"
  // tier is a separate Product row here, not a field, so the siblings are
  // resolved by refrigerant mark (`type`, the leading token of the name) and
  // ordered by net weight. Always includes `product` itself.
  const variants = all
    .filter((p) => p.type === product.type)
    .sort((a, b) => a.weightKg - b.weightKg);

  return <ProductDetail product={product} related={related} variants={variants} />;
}
