/**
 * Fills User.countryCode / countryCity / countrySource for every account
 * from the signals already on file (lib/country: latest session's IP
 * location → default address → VAT prefix → phone code → UI language).
 *
 * Idempotent: a row is written only when its resolution differs from what
 * is stored. After this, lib/userCountry keeps the value current.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/backfill-user-country.ts --dry-run
 *   npx tsx --conditions=react-server --env-file=.env scripts/backfill-user-country.ts
 */
import prisma from "../lib/prisma";
import { COUNTRY_SIGNALS_SELECT, persistCountry, resolveFromRow, storedCountry } from "../lib/userCountry";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH = 200;

async function main() {
  let cursor: string | undefined;
  let seen = 0;
  let changed = 0;
  const bySource: Record<string, number> = {};
  for (;;) {
    const users = await prisma.user.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, ...COUNTRY_SIGNALS_SELECT },
    });
    if (users.length === 0) break;
    for (const u of users) {
      const resolved = resolveFromRow(u);
      bySource[resolved?.source ?? "unknown"] = (bySource[resolved?.source ?? "unknown"] ?? 0) + 1;
      const before = storedCountry(u);
      const differs = before?.code !== resolved?.code || before?.city !== resolved?.city || before?.source !== resolved?.source;
      if (differs) {
        changed++;
        if (!DRY_RUN) await persistCountry(u.id, u, resolved);
      }
    }
    seen += users.length;
    cursor = users[users.length - 1]!.id;
  }
  console.log(`${seen} accounts; ${changed} ${DRY_RUN ? "would change" : "updated"}; by source: ${JSON.stringify(bySource)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
