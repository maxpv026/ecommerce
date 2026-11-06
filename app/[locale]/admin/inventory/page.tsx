import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import { imagePathForProduct } from "@/lib/productMedia";
import AdminInventoryTable, { type AdminInventoryRow } from "@/components/AdminInventoryTable";
import AdminVariantsEditor, { type AdminVariantFamily } from "@/components/admin/AdminVariantsEditor";
import { refrigerantTypeOf, resolveFamily } from "@/lib/productFamily";
import { isPricedPerKg } from "@/lib/pricing";

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

  const [all, waiting] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        weight: true,
        category: true,
        inStock: true,
        stockQuantity: true,
        containerType: true,
        weightKg: true,
        pricePerKg: true,
        cylinderDeposit: true,
        familyKey: true,
        externalId: true,
        archivedAt: true,
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

  // Archived sizes (deleted, but kept for their order/quote history) are off
  // the stock list and out of the size families; they get their own list
  // with a Restore button.
  const products = all.filter((p) => p.archivedAt === null);
  const archived = all
    .filter((p) => p.archivedAt !== null)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name, variant: p.weight, archivedAt: p.archivedAt!.toISOString() }));

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

  // Sizes, grouped exactly as the PDP's selector groups them (lib/data.ts
  // and lib/productFamily share resolveFamily). Only gas sold by weight has
  // sizes — equipment and empty recovery cylinders are priced per unit.
  const families = new Map<string, AdminVariantFamily>();
  for (const product of products) {
    if (!isPricedPerKg(product.category)) continue;
    const id = resolveFamily(product.familyKey, refrigerantTypeOf(product.name));
    const family = families.get(id) ?? {
      id,
      label: product.familyKey ?? refrigerantTypeOf(product.name),
      explicit: Boolean(product.familyKey),
      sizes: [],
    };
    family.sizes.push({
      id: product.id,
      sku: product.sku,
      name: product.name,
      containerType: product.containerType,
      weightKg: product.weightKg,
      pricePerKg: product.pricePerKg,
      cylinderDeposit: Number(product.cylinderDeposit),
      stockQuantity: product.stockQuantity,
      familyKey: product.familyKey,
      crmManaged: product.externalId !== null,
    });
    families.set(id, family);
  }
  const familyList = [...families.values()]
    .map((f) => ({ ...f, sizes: f.sizes.sort((a, b) => a.weightKg - b.weightKg) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <AdminInventoryTable rows={rows}>
      <AdminVariantsEditor families={familyList} archived={archived} />
    </AdminInventoryTable>
  );
}
