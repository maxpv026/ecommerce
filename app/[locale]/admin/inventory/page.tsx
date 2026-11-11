import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import { imagePathForProduct } from "@/lib/productMedia";
import AdminInventoryManager, { type InventoryFamily, type ArchivedSize } from "@/components/admin/AdminInventoryManager";
import { refrigerantTypeOf, resolveFamily } from "@/lib/productFamily";
import { isPricedPerKg } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Inventory — My Energy Admin",
  description: "Product families, sizes, prices and stock — with back-in-stock notifications.",
  robots: { index: false, follow: false },
};

// Stock and waitlist counts move on every update; never serve them stale.
export const dynamic = "force-dynamic";

interface AdminInventoryPageProps {
  params: Promise<{ locale: string }>;
}

/** A refrigerant mark ("R-32", "R404A") — anything else is a product name, not a family label. */
const looksLikeMark = (s: string) => /^R-?\d/i.test(s);

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
        stockQuantity: true,
        containerType: true,
        weightKg: true,
        pricePerKg: true,
        cylinderDeposit: true,
        familyKey: true,
        externalId: true,
        archivedAt: true,
      },
      orderBy: { name: "asc" },
    }),
    // One grouped query rather than a count per product.
    prisma.stockSubscription.groupBy({ by: ["productId"], where: { notified: false }, _count: { _all: true } }),
  ]);

  // Archived sizes (deleted, but kept for their order/quote history) are off
  // the families; they get their own list with a Restore button.
  const products = all.filter((p) => p.archivedAt === null);
  const archived: ArchivedSize[] = all
    .filter((p) => p.archivedAt !== null)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name, variant: p.weight, archivedAt: p.archivedAt!.toISOString() }));
  const waitingFor = new Map(waiting.map((row) => [row.productId, row._count._all]));

  // Every listed product lands in exactly one family card — this page is the
  // single stock screen, so nothing may fall outside it.
  //
  // Gas sold by weight is grouped exactly as the product page's size selector
  // groups it (resolveFamily, shared with lib/data.ts), so a card here IS the
  // storefront's family: an explicit familyKey (e.g. reclaimed kept apart from
  // virgin) or else the refrigerant mark.
  //
  // Products sold per unit (equipment, empty recovery cylinders) have no
  // sizes: each is its own one-row card with stock only.
  const families = new Map<string, InventoryFamily>();
  for (const product of products) {
    const perUnit = !isPricedPerKg(product.category);
    const mark = refrigerantTypeOf(product.name);
    const id = perUnit ? `unit:${product.id}` : resolveFamily(product.familyKey, mark);
    const family = families.get(id) ?? {
      id,
      label: perUnit ? product.name : mark,
      familyKey: perUnit ? null : product.familyKey,
      perUnit,
      imageSrc: imagePathForProduct(product),
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
      waitlistCount: waitingFor.get(product.id) ?? 0,
      familyKey: product.familyKey,
      crmManaged: product.externalId !== null,
    });
    family.imageSrc ??= imagePathForProduct(product);
    families.set(id, family);
  }

  const familyList = [...families.values()]
    .map((f) => {
      const sizes = f.sizes.sort((a, b) => a.weightKg - b.weightKg);
      // An explicit family ("r404a-reclaimed") or a non-gas mark ("Custom")
      // reads better as its shortest product name: "R-404A Reclaimed".
      const label =
        f.perUnit || (!f.familyKey && looksLikeMark(f.label))
          ? f.label
          : sizes.map((s) => s.name).sort((a, b) => a.length - b.length)[0];
      return { ...f, label, sizes };
    })
    // Gas families first, A–Z (R-32 before R-404A by natural order), then the per-unit products.
    .sort((a, b) => Number(a.perUnit) - Number(b.perUnit) || a.label.localeCompare(b.label, "en", { numeric: true }));

  return <AdminInventoryManager families={familyList} archived={archived} />;
}
