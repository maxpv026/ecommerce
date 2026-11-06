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

  // The size selector. Each size is its own Product row; the rows sharing
  // this one's family (its familyKey, or its refrigerant mark when none is
  // set — lib/productFamily) are its sizes, smallest first. Always includes
  // `product` itself.
  const variants = all
    .filter((p) => p.family === product.family)
    .sort((a, b) => a.weightKg - b.weightKg || a.containerType.localeCompare(b.containerType));

  return <ProductDetail product={product} related={related} variants={variants} />;
}
