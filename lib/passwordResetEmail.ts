import "server-only";

import { sendHtmlEmail } from "@/lib/mail";
import { emailContext, type EmailContext } from "@/lib/email/context";
import type { Block } from "@/lib/email/design";
import { absoluteUrl } from "@/lib/siteUrl";

/**
 * The three emails of the password-reset flow, in the recipient's language
 * (namespace PasswordResetEmail), in the shared email design (lib/email),
 * laid out like the sign-in code email.
 *
 *   code     the 6-digit reset code (10 minutes, 5 tries)
 *   google   the address belongs to a Google-only account: nothing to reset
 *   changed  the password was just reset — "if this wasn't you" notice
 */

/** The shared security layout: heading, sentence, optional code or button, a closing note. */
async function securityEmail(
  locale: string | null,
  build: (t: EmailContext["t"]) => { subject: string; heading: string; body: string; code?: string; cta?: { label: string; href: string }; note: string }
) {
  const c = await emailContext(locale, "PasswordResetEmail");
  const m = build(c.t);
  const blocks: Block[] = [
    { kind: "text", text: m.body },
    ...(m.code ? ([{ kind: "code", code: m.code, caption: c.t("codeCaption") }] satisfies Block[]) : []),
    ...(m.cta ? ([{ kind: "cta", label: m.cta.label, href: m.cta.href }] satisfies Block[]) : []),
    { kind: "callout", tone: "neutral", text: m.note },
  ];
  const { html, text } = c.render({
    subject: m.subject,
    preview: m.body,
    reference: c.s("badgeSecurity").toLocaleUpperCase(c.locale),
    heading: m.heading,
    blocks,
    footer: { reason: c.s("reasonSecurity") },
  });
  return { subject: m.subject.replace(/[\r\n]+/g, " "), html, text, locale: c.locale };
}

export async function sendPasswordResetCode(email: string, code: string, locale: string | null): Promise<void> {
  const m = await securityEmail(locale, (t) => ({
    // The code leads the subject in every language, readable from a lock screen.
    subject: `${code} — ${t("codeSubjectTail")}`,
    heading: t("codeKicker"),
    body: t("codeBody"),
    code,
    note: t("codeFooter"),
  }));
  await sendHtmlEmail({ to: email, subject: m.subject, html: m.html, text: m.text });
}

export async function sendPasswordResetGoogleNotice(email: string, locale: string | null): Promise<void> {
  const href = absoluteUrl("/auth", locale ?? undefined);
  const m = await securityEmail(locale, (t) => ({
    subject: t("googleSubject"),
    heading: t("googleKicker"),
    body: t("googleBody"),
    cta: { label: t("googleCta"), href },
    note: t("googleFooter"),
  }));
  await sendHtmlEmail({ to: email, subject: m.subject, html: m.html, text: m.text });
}

export async function sendPasswordChangedNotice(email: string, locale: string | null): Promise<void> {
  const m = await securityEmail(locale, (t) => ({
    subject: t("changedSubject"),
    heading: t("changedKicker"),
    body: t("changedBody"),
    note: t("changedFooter"),
  }));
  await sendHtmlEmail({ to: email, subject: m.subject, html: m.html, text: m.text });
}
