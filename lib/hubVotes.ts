import "server-only";

import prisma from "@/lib/prisma";

export const VOTES = ["UP", "DOWN", "FLAT"] as const;
export type VoteChoice = (typeof VOTES)[number];
export type VoteTally = Record<VoteChoice, number>;

/** Votes per story, by choice. */
export async function tallyFor(insightIds: string[]): Promise<Record<string, VoteTally>> {
  if (insightIds.length === 0) return {};
  const rows = await prisma.insightVote.groupBy({ by: ["insightId", "choice"], where: { insightId: { in: insightIds } }, _count: { _all: true } });
  const out: Record<string, VoteTally> = {};
  for (const r of rows) {
    const t = (out[r.insightId] ??= { UP: 0, DOWN: 0, FLAT: 0 });
    if ((VOTES as readonly string[]).includes(r.choice)) t[r.choice as VoteChoice] = r._count._all;
  }
  return out;
}
