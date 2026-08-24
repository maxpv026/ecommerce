import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetailView from "@/components/ProductDetailView";
import { getAllProductDetailIds, getProductDetail } from "@/lib/productDetails";

interface ProductPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ weight?: string }>;
}

export function generateStaticParams() {
  return getAllProductDetailIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = getProductDetail(id);
  if (!product) return {};
  return {
    title: `${product.name} — My Energy`,
    description: product.description,
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { id } = await params;
  const { weight } = await searchParams;
  const product = getProductDetail(id);

  if (!product) notFound();

  const initialWeightId = product.weights.some((w) => w.id === weight)
    ? weight!
    : product.defaultWeightId;

  return <ProductDetailView product={product} initialWeightId={initialWeightId} />;
}
