"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { requirePermission } from "@/lib/admin/permissions";
import {
  cancelBroadcast,
  countRegulatoryAudience,
  createRegulatoryBroadcast,
  processBroadcast,
  type BroadcastProgress,
} from "@/lib/broadcast";
import { sendRegulatoryTestEmail } from "@/lib/notificationEmail";

/**
 * Admin broadcast actions. Every one re-checks the caller against the
 * database (role, ADMIN_EMAIL, enrolled 2FA) — the admin page's guard is not
 * enough on its own, because a server action is a public endpoint anyone
 * can POST to.
 *
 * Time budget: these run inside the /admin/broadcast page's maxDuration
 * (60 s). A pass stops sending at passBudgetMs() and returns, leaving the
 * rest queued for the next call.
 */

/** Per-pass sending budget. Env-tunable, but never past 45 s of the page's 60. */
const passBudgetMs = () => Math.min(45_000, Math.max(1_000, Number(process.env.BROADCAST_PASS_BUDGET_MS ?? 40_000) || 40_000));

const Message = z.object({
  subject: z.string().trim().min(3).max(200),
  content: z.string().trim().min(20).max(20_000),
});

type Failure = { ok: false; error: string };

async function admin(): Promise<{ ok: true; id: string } | Failure> {
  const session = await auth();
  const check = await requirePermission(session?.user?.id, "broadcasts");
  if (!check.ok) {
    return {
      ok: false,
      error: check.code === "TWO_FACTOR_REQUIRED" ? "Enable two-factor authentication to send broadcasts." : "Not authorised.",
    };
  }
  return { ok: true, id: check.value.id };
}

export async function getRegulatoryAudience(): Promise<{ ok: true; count: number } | Failure> {
  const who = await admin();
  if (!who.ok) return who;
  return { ok: true, count: await countRegulatoryAudience() };
}

export async function sendBroadcastTest(input: unknown): Promise<{ ok: true; sentTo: string } | Failure> {
  const who = await admin();
  if (!who.ok) return who;
  const parsed = Message.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Subject (3-200 chars) and content (20+ chars) are required." };

  const result = await sendRegulatoryTestEmail(who.id, parsed.data.subject, parsed.data.content);
  if (result.status === "sent") return { ok: true, sentTo: "your admin address" };
  if (result.status === "failed") return { ok: false, error: `Mail server refused the test: ${result.error}` };
  return { ok: false, error: `Test not sent (${result.reason}).` };
}

/**
 * Starts a broadcast to everyone opted in to regulatory updates, and sends
 * the first pass before returning. The caller keeps calling
 * `continueBroadcast` until `remaining` is 0.
 */
export async function broadcastRegulatoryUpdate(
  input: unknown
): Promise<{ ok: true; progress: BroadcastProgress; reused: boolean } | Failure> {
  const who = await admin();
  if (!who.ok) return who;
  const parsed = Message.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Subject (3-200 chars) and content (20+ chars) are required." };
  // An AI draft marks every fact it couldn't source as [CONFIRM: …]. One
  // left in means an unverified claim would go to every customer.
  if (/\[CONFIRM/i.test(`${parsed.data.subject}\n${parsed.data.content}`)) {
    return { ok: false, error: "Resolve every [CONFIRM: …] placeholder before sending." };
  }

  try {
    const { id, reused } = await createRegulatoryBroadcast(who.id, parsed.data.subject, parsed.data.content);
    const progress = await processBroadcast(id, Date.now() + passBudgetMs());
    if (!progress) return { ok: false, error: "The broadcast could not be found after creating it." };
    if (progress.total === 0) return { ok: false, error: "Nobody is opted in to regulatory updates — nothing was sent." };
    return { ok: true, progress, reused };
  } catch (error) {
    console.error("[broadcast] start failed:", error);
    return { ok: false, error: "Could not start the broadcast. Nothing was sent." };
  }
}

export async function continueBroadcast(broadcastId: string): Promise<{ ok: true; progress: BroadcastProgress } | Failure> {
  const who = await admin();
  if (!who.ok) return who;
  if (typeof broadcastId !== "string" || broadcastId.length > 64) return { ok: false, error: "Unknown broadcast." };
  try {
    const progress = await processBroadcast(broadcastId, Date.now() + passBudgetMs());
    return progress ? { ok: true, progress } : { ok: false, error: "Unknown broadcast." };
  } catch (error) {
    console.error("[broadcast] pass failed:", error);
    return { ok: false, error: "That pass failed; nothing was lost — it will resume." };
  }
}

export async function stopBroadcast(broadcastId: string): Promise<{ ok: true; progress: BroadcastProgress } | Failure> {
  const who = await admin();
  if (!who.ok) return who;
  if (typeof broadcastId !== "string" || broadcastId.length > 64) return { ok: false, error: "Unknown broadcast." };
  const progress = await cancelBroadcast(broadcastId);
  return progress ? { ok: true, progress } : { ok: false, error: "Unknown broadcast." };
}
