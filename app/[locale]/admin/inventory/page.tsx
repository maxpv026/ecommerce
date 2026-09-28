import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import { imagePathForProduct } from "@/lib/productMedia";
import AdminInventoryTable, { type AdminInventoryRow } from "@/components/AdminInventoryTable";

export const metadata: Metadata = {
  title: "Inventory — My Energy Admin",
  description: "Set stock levels and trigger back-in-stock notifications.",
  robots: { index: false, follow: false },
};

// Stock and waitlist counts move on every update; never serve them stale.
export const dynamic = "force-dynamic";

interface AdminInventoryPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminInventoryPage({ params }: AdminInventoryPageProps) {
  // One shared gate for every admin route — see lib/admin/guardAdmin.
  await guardAdmin(params);

  const [products, waiting] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        weight: true,
        category: true,
        inStock: true,
        stockQuantity: true,
      },
      // Out of stock first — those are the rows with people waiting on them,
      // and the only ones a restock can actually notify.
      orderBy: [{ inStock: "asc" }, { stockQuantity: "asc" }, { name: "asc" }],
    }),
    // One grouped query rather than a count per product.
    prisma.stockSubscription.groupBy({
      by: ["productId"],
      where: { notified: false },
      _count: { _all: true },
    }),
  ]);

  const pendingBySku = new Map(waiting.map((row) => [row.productId, row._count._all]));

  const rows: AdminInventoryRow[] = products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    variant: product.weight,
    category: product.category,
    inStock: product.inStock,
    stockQuantity: product.stockQuantity,
    waitlistCount: pendingBySku.get(product.id) ?? 0,
    imageSrc: imagePathForProduct(product),
  }));

  return <AdminInventoryTable rows={rows} />;
}
