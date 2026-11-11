import "server-only";

import { sendHtmlEmail } from "@/lib/mail";
import { emailTranslator } from "@/lib/emailTranslator";
import { absoluteUrl } from "@/lib/siteUrl";

/**
 * The three emails of the password-reset flow, in the recipient's language
 * (namespace PasswordResetEmail), in the same visual style as the sign-in
 * code email (lib/mail otpEmailHtml).
 *
 *   code     the 6-digit reset code (10 minutes, 5 tries)
 *   google   the address belongs to a Google-only account: nothing to reset
 *   changed  the password was just reset — "if this wasn't you" notice
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function shell(input: { kicker: string; body: string; code?: string; cta?: { label: string; href: string }; footer: string }): string {
  return `
<div style="background:#f8fafc;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:20px;padding:36px 32px;border:1px solid #e2e8f0;">
    <div style="margin-bottom:28px;font-size:16px;font-weight:600;letter-spacing:-0.02em;color:#0f172a;">My Energy</div>
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:.05em;color:#94a3b8;text-transform:uppercase;">${esc(input.kicker)}</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.55;color:#475569;">${esc(input.body)}</p>
    ${input.code ? `<div style="text-align:center;background:#f1f5f9;border-radius:14px;padding:20px;margin-bottom:24px;"><span style="font-size:32px;font-weight:700;letter-spacing:.3em;color:#1d4ed8;">${esc(input.code)}</span></div>` : ""}
    ${input.cta ? `<a href="${esc(input.cta.href)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 24px;border-radius:12px;margin-bottom:24px;">${esc(input.cta.label)}</a>` : ""}
    <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">${esc(input.footer)}</p>
  </div>
</div>`.trim();
}

export async function sendPasswordResetCode(email: string, code: string, locale: string | null): Promise<void> {
  const { t } = await emailTranslator(locale, "PasswordResetEmail");
  const body = t("codeBody");
  await sendHtmlEmail({
    to: email,
    subject: t("codeSubject", { code }),
    text: `${body}\n\n${code}\n\n${t("codeFooter")}`,
    html: shell({ kicker: t("codeKicker"), body, code, footer: t("codeFooter") }),
  });
}

export async function sendPasswordResetGoogleNotice(email: string, locale: string | null): Promise<void> {
  const { t, locale: loc } = await emailTranslator(locale, "PasswordResetEmail");
  const href = absoluteUrl("/auth", loc);
  await sendHtmlEmail({
    to: email,
    subject: t("googleSubject"),
    text: `${t("googleBody")}\n\n${href}\n\n${t("googleFooter")}`,
    html: shell({ kicker: t("googleKicker"), body: t("googleBody"), cta: { label: t("googleCta"), href }, footer: t("googleFooter") }),
  });
}

export async function sendPasswordChangedNotice(email: string, locale: string | null): Promise<void> {
  const { t } = await emailTranslator(locale, "PasswordResetEmail");
  await sendHtmlEmail({
    to: email,
    subject: t("changedSubject"),
    text: `${t("changedBody")}\n\n${t("changedFooter")}`,
    html: shell({ kicker: t("changedKicker"), body: t("changedBody"), footer: t("changedFooter") }),
  });
}
