import "dotenv/config";
import prisma from "../lib/prisma";
import { seedInventory } from "./inventory";

// Inventory-only seed: `npx tsx prisma/seed-inventory.ts`. Re-applies the
// CRM product list (prisma/inventory.ts): per-kg prices, the 10 kg
// baseline pack size and initial availability, without touching users,
// addresses or orders (the full seed also calls this).
seedInventory(prisma)
  .then((result) => {
    console.log("Inventory seed complete:", result);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
