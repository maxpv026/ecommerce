import "server-only";

import prisma from "@/lib/prisma";
import { sendHtmlEmail } from "@/lib/mail";
import { emailTranslator, tidyDots } from "@/lib/emailTranslator";
import { emailContext, type EmailContext } from "@/lib/email/context";
import type { Block, Tone } from "@/lib/email/design";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { escapeMarkdown, notifyAdmin, notifyAdminWithDocument } from "@/lib/telegram";
import type { FgasCheck, FgasExtraction } from "@/lib/fgas";

/**
 * The F-Gas notification loop.
 *
 *   buyer  email on every decision about their certificate — verified,
 *          received for review, refused, replacement refused, revoked,
 *          expired. Transactional: compliance notices about the account go
 *          out whatever the marketing preferences.
 *   admin  Telegram for AI decisions (with the document), escalations to
 *          review (with the document) and manual overrides (text).
 *
 * Nothing here throws: the decision is already committed when these run
 * (from next/server's after()), and a mail outage must not undo it.
 */

export type FgasEmailKind = "VERIFIED" | "PENDING_REVIEW" | "REJECTED" | "REPLACEMENT_REJECTED" | "REVOKED" | "EXPIRED";

const TONE: Record<FgasEmailKind, Tone> = {
  VERIFIED: "success",
  PENDING_REVIEW: "info",
  REJECTED: "danger",
  REPLACEMENT_REJECTED: "warning",
  REVOKED: "danger",
  EXPIRED: "warning",
};

export async function sendFgasStatusEmail(input: {
  userId: string;
  kind: FgasEmailKind;
  reason?: string | null;
  /** The deciding check of an automatic verdict, worded in the buyer's language. */
  reasonCheck?: FgasCheck | null;
  certificate?: { number?: string | null; holder?: string | null; expiresAt?: string | Date | null; issuingBody?: string | null } | null;
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, name: true, locale: true } });
    if (!user?.email) return;
    const c = await emailContext(user.locale, "FgasEmail");
    const { t, locale } = c;
    if (input.reasonCheck && input.reasonCheck.code !== "MODEL_DOUBT") {
      const checks = await emailTranslator(locale, "FgasChecks");
      input = { ...input, reason: checks.t(`${input.reasonCheck.id}_${input.reasonCheck.code}`, { detail: input.reasonCheck.detail ?? "" }) };
    }
    const date = (d: string | Date | null | undefined) => (d ? c.date(new Date(typeof d === "string" && d.length === 10 ? `${d}T00:00:00Z` : d)) : null);

    const cert = input.certificate;
    const rows = [
      cert?.number ? { label: t("fieldNumber"), value: cert.number, mono: true } : null,
      cert?.holder ? { label: t("fieldHolder"), value: cert.holder } : null,
      cert?.issuingBody ? { label: t("fieldIssuer"), value: cert.issuingBody } : null,
      cert?.expiresAt ? { label: t("fieldExpiry"), value: date(cert.expiresAt)! } : null,
    ].filter((r): r is { label: string; value: string; mono?: boolean } => Boolean(r));

    const cta =
      input.kind === "VERIFIED"
        ? { label: t("ctaShop"), href: c.url("/products") }
        : input.kind === "PENDING_REVIEW" || input.kind === "REPLACEMENT_REJECTED"
          ? { label: t("ctaProfile"), href: c.url("/profile") }
          : { label: t("ctaUpload"), href: c.url("/profile?fgas=upload") };

    const subject = t(`subject_${input.kind}`);
    const { html, text } = fgasDoc(c, {
      subject,
      tone: TONE[input.kind],
      greeting: user.name?.trim() ? t("greeting", { name: user.name.trim() }) : t("greetingNoName"),
      body: input.kind === "EXPIRED" ? t("body_EXPIRED", { date: date(cert?.expiresAt) ?? "—" }) : t(`body_${input.kind}`),
      reason: input.reason ? { label: t("reasonLabel"), text: input.reason } : null,
      rows,
      cta,
      footer: { reason: t("footer") },
    });
    await sendHtmlEmail({ to: user.email, subject: subject.replace(/[\r\n]+/g, " "), html, text });
  } catch (error) {
    console.error(`[fgas-notify] ${input.kind} email for user ${input.userId} failed:`, error);
  }
}

/**
 * 30- and 7-day warnings before a certificate lapses (cron fgas-expiry,
 * lib/fgasLifecycle selects and claims). Unlike the status notices above,
 * these are optional — gated by User.notifyFgasExpiry and carrying a
 * one-click unsubscribe — because the EXPIRED notice still goes out either way.
 */
export async function sendFgasExpiryWarning(input: { userId: string; expiresAt: Date; certificateNumber?: string | null }): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, name: true, locale: true, notifyFgasExpiry: true } });
    if (!user?.email || !user.notifyFgasExpiry) return false;
    const c = await emailContext(user.locale, "FgasEmail");
    const { t } = c;
    const days = Math.max(0, Math.ceil((input.expiresAt.getTime() - Date.now()) / 86_400_000));
    const date = c.date(input.expiresAt);
    const subject = t("subject_EXPIRING", { days });
    const oneClick = unsubscribeUrl(input.userId, "fgasExpiry");
    const { html, text } = fgasDoc(c, {
      subject,
      tone: "warning",
      greeting: user.name?.trim() ? t("greeting", { name: user.name.trim() }) : t("greetingNoName"),
      body: tidyDots(t("body_EXPIRING", { days, date })),
      reason: null,
      rows: [
        ...(input.certificateNumber ? [{ label: t("fieldNumber"), value: input.certificateNumber, mono: true }] : []),
        { label: t("fieldExpiry"), value: date },
      ],
      cta: { label: t("ctaRenew"), href: c.url("/profile?fgas=upload") },
      footer: { reason: t("footerExpiring"), unsubscribe: { label: c.s("unsubscribe"), href: oneClick } },
    });
    await sendHtmlEmail({
      to: user.email,
      subject: subject.replace(/[\r\n]+/g, " "),
      html,
      text,
      headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    return true;
  } catch (error) {
    console.error(`[fgas-notify] expiry warning for user ${input.userId} failed:`, error);
    return false;
  }
}

/** The one F-Gas layout: status line, certificate facts, reason, action. */
function fgasDoc(
  c: EmailContext,
  input: {
    subject: string;
    tone: Tone;
    greeting: string;
    body: string;
    reason: { label: string; text: string } | null;
    rows: Array<{ label: string; value: string; mono?: boolean }>;
    cta: { label: string; href: string };
    footer: { reason: string; unsubscribe?: { label: string; href: string } };
  }
) {
  return c.render({
    subject: input.subject,
    preview: input.body.slice(0, 140),
    reference: c.t("kicker").toLocaleUpperCase(c.locale),
    kicker: { label: c.s("regulationShort"), tone: input.tone },
    heading: input.subject,
    blocks: [
      { kind: "text", text: input.greeting },
      { kind: "text", text: input.body },
      ...(input.reason ? ([{ kind: "callout", tone: input.tone, title: input.reason.label, text: input.reason.text }] satisfies Block[]) : []),
      ...(input.rows.length ? ([{ kind: "facts", rows: input.rows }] satisfies Block[]) : []),
      { kind: "cta", label: input.cta.label, href: input.cta.href },
    ],
    footer: input.footer,
  });
}

// ── Telegram ─────────────────────────────────────────────────────────────

const field = (value: string | null | undefined) => escapeMarkdown(value?.trim() || "—");

const CHECK_ICON: Record<FgasCheck["outcome"], string> = { pass: "✅", review: "🟡", fail: "❌" };

export function checksLine(checks: FgasCheck[]): string {
  return checks.map((c) => `${CHECK_ICON[c.outcome]} ${c.id}: ${c.code}`).join("\n");
}

/** The automatic decision on an upload, with the document attached. */
export async function telegramVerdict(input: {
  verdict: "VERIFIED" | "PENDING_REVIEW" | "REJECTED";
  keptActive: boolean;
  user: { id: string; name: string | null; email: string | null };
  extraction: FgasExtraction | null;
  checks: FgasCheck[];
  reason: string | null;
  document: { bytes: Uint8Array; contentType: string };
}): Promise<void> {
  const head =
    input.verdict === "VERIFIED"
      ? "🟢 *AI APPROVED*"
      : input.verdict === "PENDING_REVIEW"
        ? "🟡 *ACTION REQUIRED: certificate needs review*"
        : input.keptActive
          ? "🟠 *AI REJECTED REPLACEMENT* (current certificate stays active)"
          : "🔴 *AI REJECTED*";
  const who = [input.user.name, input.user.email].filter(Boolean).join(" · ") || input.user.id;
  const x = input.extraction;
  const caption = [
    head,
    "",
    `👤 *User:* ${field(who)}`,
    `🏢 *Holder:* ${field(x?.companyName ?? x?.personName)}`,
    `🔢 *Cert:* ${field(x?.certificateId)} ${x?.countryCode ? `(${escapeMarkdown(x.countryCode)})` : ""}`,
    `📅 *Expiry:* ${field(x?.expiresAt)}`,
    `⚠️ *Reason:* ${field(input.reason)}`,
    "",
    escapeMarkdown(checksLine(input.checks)),
    "",
    input.verdict === "PENDING_REVIEW" ? "_Approve or reject in /admin/users (filter: Review)._" : `_User id:_ ${escapeMarkdown(input.user.id)}`,
  ]
    .join("\n")
    .slice(0, 1000);
  const ext = input.document.contentType === "application/pdf" ? "pdf" : input.document.contentType.split("/")[1] ?? "bin";
  await notifyAdminWithDocument({ bytes: input.document.bytes, filename: `fgas-certificate.${ext}`, contentType: input.document.contentType }, caption, `F-Gas ${input.verdict} for ${input.user.email ?? input.user.id}`);
}

/** A person changed a buyer's status: approval, rejection, revocation. */
export async function telegramOverride(input: { action: string; adminEmail: string | null; user: { id: string; name: string | null; email: string | null }; reason?: string | null }) {
  const who = [input.user.name, input.user.email].filter(Boolean).join(" · ") || input.user.id;
  await notifyAdmin(
    [`👮 *ADMIN ${escapeMarkdown(input.action)}*`, `👤 *User:* ${field(who)}`, `🧑‍💼 *By:* ${field(input.adminEmail)}`, input.reason ? `📝 *Reason:* ${field(input.reason)}` : null]
      .filter(Boolean)
      .join("\n"),
    `F-Gas admin ${input.action} for ${input.user.email ?? input.user.id}`
  );
}
