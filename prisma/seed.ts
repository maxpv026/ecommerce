import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { gasPricingFromLegacy } from "../lib/pricing";
import { seedInventory } from "./inventory";

// Legacy mock tiers were authored with a per-cylinder price and an lb pack
// size; gasPricingFromLegacy() splits that into the per-kg rate + net kg the
// schema now stores (the cylinder price they reproduce is unchanged).

/** Per-kg breakdown snapshot for a seeded order line priced per cylinder. */
function legacyOrderLine(cylinderPrice: number, lb: number) {
  const { pricePerKg, weightKg } = gasPricingFromLegacy(cylinderPrice, lb);
  return { pricePerKgAtPurchase: pricePerKg, weightKgAtPurchase: weightKg };
}

async function main() {
  const passwordHash = await bcrypt.hash("SecurePass123!", 12);

  const user = await prisma.user.upsert({
    where: { email: "m.pivovarov@appexoft.com" },
    // Re-running the seed must also repair a row created before fGasStatus
    // existed, or the seeded account is silently blocked from checkout.
    update: { epaVerified: true, fGasStatus: "VERIFIED" },
    create: {
      name: "Пивоваров Максим Романович",
      email: "m.pivovarov@appexoft.com",
      password: passwordHash,
      companyName: "Appexoft",
      epaVerified: true,
      // Source of truth for every purchase gate; epaVerified is its mirror.
      fGasStatus: "VERIFIED",
    },
  });

  // Address has no unique constraint, so createMany+skipDuplicates can't
  // make this idempotent — find-or-create per title instead, or re-running
  // the seed duplicates every address.
  const addressSeeds = [
    {
      title: "Office / Workspace",
      recipientName: "Пивоваров Максим Романович",
      fullAddress: "Appexoft, Lviv, Ukraine",
      isDefault: true,
      street: "Appexoft office",
      city: "Lviv",
      postalCode: "79000",
      country: "Ukraine",
      kind: "SHIPPING",
    },
    {
      title: "University Dormitory",
      recipientName: "Пивоваров Максим Романович",
      fullAddress: "Room 322, Lviv, Ukraine",
      isDefault: false,
      street: "Room 322",
      city: "Lviv",
      postalCode: "79020",
      country: "Ukraine",
      kind: "SHIPPING",
    },
  ];
  for (const seed of addressSeeds) {
    const existing = await prisma.address.findFirst({
      where: { userId: user.id, title: seed.title },
    });
    if (!existing) {
      await prisma.address.create({ data: { userId: user.id, ...seed } });
    } else if (!existing.street) {
      // Backfill structured fields onto legacy seeded rows once.
      await prisma.address.update({
        where: { id: existing.id },
        data: { street: seed.street, city: seed.city, postalCode: seed.postalCode, country: seed.country, kind: seed.kind },
      });
    }
  }

  // R-32 and R-134a round out the catalog but aren't referenced by either
  // seeded order below — that's realistic (not every product appears in
  // every order history) and the exact math for order totals only works
  // out with an all-R-410A composition (see comment below).
  const [r410a] = await Promise.all([
    prisma.product.upsert({
      where: { sku: "HC-R410A-25" },
      update: {},
      create: {
        name: "R-410A Premium",
        sku: "HC-R410A-25",
        ...gasPricingFromLegacy(189, 25),
        weight: "25 lb cylinder",
        gwpClass: "A1",
        inStock: true,
      },
    }),
    prisma.product.upsert({
      where: { sku: "HC-R32-25" },
      update: {},
      create: {
        name: "R-32 Low GWP",
        sku: "HC-R32-25",
        ...gasPricingFromLegacy(212, 25),
        weight: "25 lb cylinder",
        gwpClass: "A2L",
        inStock: true,
      },
    }),
    prisma.product.upsert({
      where: { sku: "HC-R134A-30" },
      update: {},
      create: {
        name: "R-134a Standard",
        sku: "HC-R134A-30",
        ...gasPricingFromLegacy(164, 30),
        weight: "30 lb cylinder",
        gwpClass: "A1",
        inStock: true,
      },
    }),
  ]);

  // F-Gas certificate backing the profile's "Verified" status (same
  // document lib/mobileDocs.ts shows: Category I, FGAS-849201).
  const existingCert = await prisma.certificate.findFirst({
    where: { userId: user.id, certId: "FGAS-849201" },
  });
  if (!existingCert) {
    await prisma.certificate.create({
      data: {
        userId: user.id,
        certType: "Category I",
        certId: "FGAS-849201",
        issuedAt: new Date("2024-03-12"),
      },
    });
  }

  // Remaining catalog-listing SKUs (weight tiers + R-404A/R-407C lines) so
  // every "Add to Cart" on the listing page resolves to a real product row.
  // Skus follow lib/catalog.ts's `dbSku` column: "HC-" + listing sku.
  const catalogTiers: Array<{
    sku: string;
    name: string;
    cylinderPrice: number;
    lb: number;
    gwpClass: string;
  }> = [
    { sku: "HC-410A-100", name: "R-410A Bulk", cylinderPrice: 618, lb: 100, gwpClass: "A1" },
    { sku: "HC-410A-50", name: "R-410A Service Pack", cylinderPrice: 342, lb: 50, gwpClass: "A1" },
    { sku: "HC-404A-24", name: "R-404A Reclaimed", cylinderPrice: 298, lb: 24, gwpClass: "A1" },
    { sku: "HC-404A-50", name: "R-404A Virgin", cylinderPrice: 512, lb: 50, gwpClass: "A1" },
    { sku: "HC-407C-25", name: "R-407C Service", cylinderPrice: 236, lb: 25, gwpClass: "A1" },
    { sku: "HC-407C-100", name: "R-407C Bulk", cylinderPrice: 742, lb: 100, gwpClass: "A1" },
    { sku: "HC-134A-50", name: "R-134a Bulk", cylinderPrice: 268, lb: 50, gwpClass: "A1" },
    { sku: "HC-134A-25", name: "R-134a Compact", cylinderPrice: 148, lb: 25, gwpClass: "A1" },
    { sku: "HC-R32-50", name: "R-32 Bulk", cylinderPrice: 398, lb: 50, gwpClass: "A2L" },
  ];
  await Promise.all(
    catalogTiers.map(({ cylinderPrice, lb, ...p }) =>
      prisma.product.upsert({
        where: { sku: p.sku },
        update: {},
        create: { ...p, weight: `${lb} lb cylinder`, ...gasPricingFromLegacy(cylinderPrice, lb), inStock: true },
      })
    )
  );

  // Product-list facets (purity %, GWP, stock level) for every cylinder
  // SKU, plus the three non-cylinder categories as real rows so the
  // /products filters operate on live data.
  const FACETS: Record<string, { purity: number; gwp: number; stock?: string }> = {
    "HC-R410A-25": { purity: 99.98, gwp: 2088 },
    "HC-R32-25": { purity: 99.95, gwp: 675 },
    "HC-R134A-30": { purity: 99.9, gwp: 1430, stock: "low" },
    "HC-410A-100": { purity: 99.92, gwp: 2088, stock: "low" },
    "HC-410A-50": { purity: 99.95, gwp: 2088 },
    "HC-404A-24": { purity: 99.92, gwp: 3922 },
    "HC-404A-50": { purity: 99.92, gwp: 3922, stock: "low" },
    "HC-407C-25": { purity: 99.9, gwp: 1774 },
    "HC-407C-100": { purity: 99.9, gwp: 1774 },
    "HC-134A-50": { purity: 99.9, gwp: 1430 },
    "HC-134A-25": { purity: 99.93, gwp: 1430 },
    "HC-R32-50": { purity: 99.95, gwp: 675 },
  };
  for (const [sku, f] of Object.entries(FACETS)) {
    await prisma.product.updateMany({
      where: { sku },
      data: { purity: f.purity, gwp: f.gwp, stock: f.stock ?? "in", category: "cylinders" },
    });
  }

  // Equipment is sold outright per unit (weightKg 1, pricePerKg = the unit
  // price; no returnable cylinder → no deposit) and isn't in the CRM's
  // refrigerant feed, so it gets a working quantity here.
  const extraCategories = [
    { sku: "HC-BLEND-C1", name: "Custom Blend C1", ...gasPricingFromLegacy(342, 25), weight: "25 lb cylinder", gwpClass: "A2L", purity: 99.99, gwp: 890, stock: "order", category: "blends", cylinderDeposit: 15, stockQuantity: 0 },
    { sku: "HC-MAN-4V", name: "4-Valve Manifold", pricePerKg: 148, weightKg: 1, weight: "Set", gwpClass: "n/a", purity: null, gwp: null, stock: "in", category: "equipment", cylinderDeposit: 0, stockQuantity: 100 },
    { sku: "HC-REC-50", name: "Recovery Cylinder 50 lb", pricePerKg: 132, weightKg: 1, weight: "50 lb cylinder", gwpClass: "n/a", purity: null, gwp: null, stock: "in", category: "recovery", cylinderDeposit: 0, stockQuantity: 100 },
  ];
  for (const p of extraCategories) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        stock: p.stock,
        category: p.category,
        cylinderDeposit: p.cylinderDeposit,
        stockQuantity: p.stockQuantity,
        pricePerKg: p.pricePerKg,
        weightKg: p.weightKg,
      },
      create: { ...p, inStock: true },
    });
  }

  await prisma.order.upsert({
    where: { orderNumber: "ORD-8472-EU" },
    // DHL's documented sandbox parcel number — resolves against
    // api-test.dhl.com with a developer key.
    update: { trackingNumber: "00340434292135100186" },
    create: {
      orderNumber: "ORD-8472-EU",
      userId: user.id,
      trackingNumber: "00340434292135100186",
      status: "IN_TRANSIT",
      totalAmount: 378,
      estimatedDelivery: new Date(Date.now() + 24 * 60 * 60 * 1000),
      items: {
        create: [{ productId: r410a.id, quantity: 2, priceAtPurchase: 189, ...legacyOrderLine(189, 25) }],
      },
    },
  });

  await prisma.order.upsert({
    where: { orderNumber: "ORD-8341-EU" },
    update: {},
    create: {
      orderNumber: "ORD-8341-EU",
      userId: user.id,
      status: "DELIVERED",
      totalAmount: 756,
      estimatedDelivery: new Date("2026-08-15"),
      items: {
        // 4x R-410A @ €189 = €756, matching the mock order total exactly.
        create: [{ productId: r410a.id, quantity: 4, priceAtPurchase: 189, ...legacyOrderLine(189, 25) }],
      },
    },
  });

  // CRM-listed refrigerants, base retail prices and initial availability.
  // Runs last so it can retire the legacy mock cylinder tiers seeded above
  // (they stay in the table for order history, but become unavailable).
  const inventory = await seedInventory(prisma);

  console.log("Seed complete:", { user: user.email, inventory });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
