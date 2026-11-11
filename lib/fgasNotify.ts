import "server-only";

import { render } from "@react-email/components";
import prisma from "@/lib/prisma";
import { sendHtmlEmail } from "@/lib/mail";
import { tidyDots } from "@/lib/emailTranslator";
import { sellerDetails } from "@/lib/seller";
import { absoluteUrl } from "@/lib/siteUrl";
import { emailTranslator } from "@/lib/emailTranslator";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { escapeMarkdown, notifyAdmin, notifyAdminWithDocument } from "@/lib/telegram";
import FgasStatusEmail from "@/components/email/FgasStatusEmail";
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

const TONE: Record<FgasEmailKind, "success" | "info" | "danger" | "warning"> = {
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
    const { t, locale } = await emailTranslator(user.locale, "FgasEmail");
    if (input.reasonCheck && input.reasonCheck.code !== "MODEL_DOUBT") {
      const checks = await emailTranslator(locale, "FgasChecks");
      input = { ...input, reason: checks.t(`${input.reasonCheck.id}_${input.reasonCheck.code}`, { detail: input.reasonCheck.detail ?? "" }) };
    }
    const date = (d: string | Date | null | undefined) =>
      d ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(typeof d === "string" && d.length === 10 ? `${d}T00:00:00Z` : d)) : null;

    const c = input.certificate;
    const rows = [
      c?.number ? { label: t("fieldNumber"), value: c.number } : null,
      c?.holder ? { label: t("fieldHolder"), value: c.holder } : null,
      c?.issuingBody ? { label: t("fieldIssuer"), value: c.issuingBody } : null,
      c?.expiresAt ? { label: t("fieldExpiry"), value: date(c.expiresAt)! } : null,
    ].filter((r): r is { label: string; value: string } => Boolean(r));

    const cta =
      input.kind === "VERIFIED"
        ? { label: t("ctaShop"), href: absoluteUrl("/products", locale) }
        : input.kind === "PENDING_REVIEW" || input.kind === "REPLACEMENT_REJECTED"
          ? { label: t("ctaProfile"), href: absoluteUrl("/profile", locale) }
          : { label: t("ctaUpload"), href: absoluteUrl("/profile?fgas=upload", locale) };

    const subject = t(`subject_${input.kind}`);
    const email = FgasStatusEmail({
      lang: locale,
      tone: TONE[input.kind],
      kicker: t("kicker"),
      heading: subject,
      greeting: user.name?.trim() ? t("greeting", { name: user.name.trim() }) : t("greetingNoName"),
      paragraphs: [input.kind === "EXPIRED" ? t("body_EXPIRED", { date: date(c?.expiresAt) ?? "—" }) : t(`body_${input.kind}`)],
      reason: input.reason ? { label: t("reasonLabel"), text: input.reason } : null,
      rows,
      cta,
      footer: t("footer"),
      sender: sellerDetails(),
    });
    const [html, text] = await Promise.all([render(email), render(email, { plainText: true })]);
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
    const { t, locale } = await emailTranslator(user.locale, "FgasEmail");
    const days = Math.max(0, Math.ceil((input.expiresAt.getTime() - Date.now()) / 86_400_000));
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(input.expiresAt);
    const subject = t("subject_EXPIRING", { days });
    const oneClick = unsubscribeUrl(input.userId, "fgasExpiry");
    const email = FgasStatusEmail({
      lang: locale,
      tone: "warning",
      kicker: t("kicker"),
      heading: subject,
      greeting: user.name?.trim() ? t("greeting", { name: user.name.trim() }) : t("greetingNoName"),
      paragraphs: [tidyDots(t("body_EXPIRING", { days, date }))],
      reason: null,
      rows: [
        ...(input.certificateNumber ? [{ label: t("fieldNumber"), value: input.certificateNumber }] : []),
        { label: t("fieldExpiry"), value: date },
      ],
      cta: { label: t("ctaRenew"), href: absoluteUrl("/profile?fgas=upload", locale) },
      footer: t("footerExpiring"),
      links: {
        preferences: { label: t("managePreferences"), href: absoluteUrl("/profile/settings", locale) },
        unsubscribe: { label: t("unsubscribe"), href: oneClick },
      },
      sender: sellerDetails(),
    });
    const [html, text] = await Promise.all([render(email), render(email, { plainText: true })]);
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
