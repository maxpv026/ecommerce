"use server";

import { alertCylinderReturn } from "@/lib/telegram/alerts";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getCylinderLedger } from "@/lib/invoicing";
import { sendHtmlEmail } from "@/lib/mail";
import { absoluteUrl } from "@/lib/siteUrl";
import { emailContext } from "@/lib/email/context";
import { formatIban } from "@/lib/profilePrefs";

/**
 * "Return my empty cylinders" — a request to the logistics team, saved
 * (CylinderReturnRequest) and emailed to ADMIN_EMAIL. It moves nothing in
 * the cylinder ledger: the RETURNED row is written when the cylinders are
 * actually received, not when someone says they're coming.
 */

const OPEN = ["REQUESTED", "SCHEDULED"];
const MAX_AHEAD_DAYS = 60;

const RequestInput = z.object({
  quantity: z.number().int().min(1).max(500),
  method: z.enum(["PICKUP", "DROP_OFF"]),
  addressId: z.string().min(1).max(64).optional(),
  /** YYYY-MM-DD */
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

export type CylinderReturnResult =
  | { ok: true; id: string }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_INPUT" | "TOO_MANY" | "ADDRESS_REQUIRED" | "BAD_DATE" | "FAILED" };

export async function requestCylinderReturn(raw: unknown): Promise<CylinderReturnResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = RequestInput.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const input = parsed.data;

  // Not more than they hold, counting requests already on their way.
  const [ledger, open] = await Promise.all([
    getCylinderLedger(userId),
    prisma.cylinderReturnRequest.aggregate({ where: { userId, status: { in: OPEN } }, _sum: { quantity: true } }),
  ]);
  if (input.quantity > ledger.inPossession - (open._sum.quantity ?? 0)) return { ok: false, code: "TOO_MANY" };

  let addressText: string | null = null;
  if (input.method === "PICKUP") {
    const address = input.addressId ? await prisma.address.findFirst({ where: { id: input.addressId, userId }, select: { recipientName: true, fullAddress: true, phone: true } }) : null;
    if (!address) return { ok: false, code: "ADDRESS_REQUIRED" };
    addressText = [address.recipientName, address.fullAddress, address.phone].filter(Boolean).join(" · ").slice(0, 400);
  }

  let preferredDate: Date | null = null;
  if (input.preferredDate) {
    preferredDate = new Date(`${input.preferredDate}T00:00:00Z`);
    const today = new Date();
    const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    if (Number.isNaN(preferredDate.getTime()) || preferredDate.getTime() < start || preferredDate.getTime() > start + MAX_AHEAD_DAYS * 864e5) {
      return { ok: false, code: "BAD_DATE" };
    }
  }

  try {
    const row = await prisma.cylinderReturnRequest.create({
      data: { userId, quantity: input.quantity, method: input.method, addressText, preferredDate, notes: input.notes || null },
    });
    after(() => notifyTeam(row.id));
    after(() => alertCylinderReturn(row.id));
    revalidatePath("/[locale]/profile", "page");
    return { ok: true, id: row.id };
  } catch (error) {
    console.error("requestCylinderReturn failed:", error);
    return { ok: false, code: "FAILED" };
  }
}

export async function cancelCylinderReturn(id: unknown): Promise<{ ok: boolean }> {
  const userId = (await auth())?.user?.id;
  if (!userId || typeof id !== "string" || id.length > 64) return { ok: false };
  const { count } = await prisma.cylinderReturnRequest.updateMany({ where: { id, userId, status: "REQUESTED" }, data: { status: "CANCELLED" } });
  if (count) revalidatePath("/[locale]/profile", "page");
  return { ok: count === 1 };
}

/** Staff-facing (English), never throws: the request is saved whatever SMTP does. */
async function notifyTeam(requestId: string) {
  const to = process.env.ADMIN_EMAIL?.trim();
  if (!to) {
    console.error(`[cylinders] return request ${requestId} saved, but ADMIN_EMAIL is not set — nobody was emailed.`);
    return;
  }
  try {
    const r = await prisma.cylinderReturnRequest.findUnique({
      where: { id: requestId },
      select: {
        quantity: true,
        method: true,
        addressText: true,
        preferredDate: true,
        notes: true,
        user: { select: { id: true, name: true, email: true, companyName: true, phone: true, depositIban: true } },
      },
    });
    if (!r) return;
    const who = [r.user.name, r.user.companyName].filter(Boolean).join(" · ") || r.user.email || "a customer";
    const c = await emailContext("en", "SupportEmail");
    const subject = `Cylinder return: ${r.quantity} from ${who}`.replace(/[\r\n]+/g, " ").slice(0, 200);
    const { html, text } = c.render({
      subject,
      preview: `${r.quantity} empty cylinder(s) — ${r.method === "PICKUP" ? "collection requested" : "drop-off announced"}.`,
      reference: "CYLINDER RETURN",
      kicker: { label: "Logistics", tone: "brand" },
      heading: `${r.quantity} empty cylinder${r.quantity === 1 ? "" : "s"} to come back`,
      blocks: [
        {
          kind: "facts",
          title: "Request",
          rows: [
            { label: "Customer", value: who },
            { label: "Email", value: r.user.email ?? "—" },
            { label: "Phone", value: r.user.phone ?? "—" },
            { label: "Method", value: r.method === "PICKUP" ? "Collect from customer" : "Customer drops off at the warehouse" },
            ...(r.addressText ? [{ label: "Address", value: r.addressText }] : []),
            { label: "Preferred date", value: r.preferredDate ? r.preferredDate.toISOString().slice(0, 10) : "Any" },
            { label: "Refund IBAN", value: r.user.depositIban ? formatIban(r.user.depositIban) : "Not on file", mono: true },
            ...(r.notes ? [{ label: "Notes", value: r.notes }] : []),
          ],
        },
        { kind: "text", text: "Record the RETURNED movement in the cylinder ledger when they arrive; the deposit refund follows from it." },
        { kind: "cta", label: "Open the customer →", href: absoluteUrl(`/admin/users?q=${encodeURIComponent(r.user.email ?? "")}`) },
      ],
      footer: { reason: "Sent to ADMIN_EMAIL because a customer requested a cylinder return." },
    });
    await sendHtmlEmail({ to, subject, html, text });
  } catch (error) {
    console.error(`[cylinders] return request email ${requestId} failed:`, error);
  }
}
