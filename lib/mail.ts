import "server-only";
import nodemailer from "nodemailer";
import { emailContext } from "@/lib/email/context";

// Email delivery over SMTP (nodemailer). Every message's body comes from
// the shared design system in lib/email (design.ts renders, context.ts
// localizes); this module is the transport and the security-code email.
//
// OTP email delivery over SMTP (nodemailer). Development setup targets
// Gmail's SMTP service:
//
//   SMTP_USER      — the Gmail address to send from
//   SMTP_PASSWORD  — a Google *App Password* (not the account password);
//                    requires 2-Step Verification, generated at
//                    https://myaccount.google.com/apppasswords
//
// Host/port default to smtp.gmail.com:465 (implicit TLS) and can be
// overridden with SMTP_HOST / SMTP_PORT for another provider or a local
// test server. There is deliberately NO mock fallback: with credentials
// missing, sending fails loudly (and is caught upstream) instead of
// silently swallowing codes.

const GMAIL_HOST = "smtp.gmail.com";
const GMAIL_PORT = 465;

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const { SMTP_USER, SMTP_PASSWORD, SMTP_PASS, SMTP_HOST, SMTP_PORT } = process.env;
  // SMTP_PASS is accepted as a legacy alias for SMTP_PASSWORD.
  //
  // Whitespace is stripped because Google SHOWS an App Password as four
  // groups of four ("abcd efgh ijkl mnop") and it is almost always pasted
  // with the spaces still in it — 19 characters where the secret is 16.
  // Sent verbatim that fails AUTH with 535-5.7.8, which reads like a wrong
  // password rather than a formatting slip. App Passwords never contain
  // whitespace, so removing it can only help.
  const raw = SMTP_PASSWORD || SMTP_PASS;
  const pass = raw?.replace(/\s+/g, "");
  if (raw && pass && raw !== pass) {
    console.warn(
      `[mail] SMTP_PASSWORD contained whitespace (${raw.length} chars → ${pass.length}); using the stripped value.` +
        " Remove the spaces from your .env to silence this."
    );
  }

  if (!SMTP_USER || !pass) {
    throw new Error(
      "Email is not configured. Set SMTP_USER and SMTP_PASSWORD in .env.local — see .env.example."
    );
  }

  const port = Number(SMTP_PORT ?? GMAIL_PORT);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST || GMAIL_HOST,
    port,
    // Port 465 is implicit TLS (the Gmail setup); other ports negotiate
    // STARTTLS where the server offers it.
    secure: port === 465,
    auth: { user: SMTP_USER, pass },
  });

  // Ask the server whether these credentials actually work, once, in the
  // background. Without this a bad App Password only ever surfaces as a
  // per-message failure deep inside a webhook — or, worse, nowhere at all.
  transporter
    .verify()
    .then(() => console.log(`[mail] SMTP ready: ${SMTP_HOST || GMAIL_HOST}:${port} as ${SMTP_USER}`))
    .catch((error: unknown) => {
      const e = error as { code?: string; responseCode?: number; response?: string; message?: string };
      console.error(
        "\n" + "=".repeat(72) +
        "\n[mail] SMTP CONNECTION IS BROKEN — no email of any kind will be sent." +
        `\n       host=${SMTP_HOST || GMAIL_HOST}:${port} user=${SMTP_USER}` +
        `\n       code=${e.code ?? "?"} responseCode=${e.responseCode ?? "?"}` +
        `\n       server said: ${e.response ?? e.message ?? String(error)}` +
        "\n       535-5.7.8 usually means the App Password is wrong, has spaces," +
        "\n       or 2-Step Verification is not enabled on the account." +
        "\n" + "=".repeat(72) + "\n"
      );
    });

  return transporter;
}

function fromAddress(): string {
  // SMTP_FROM wins when set — required for providers whose SMTP login is not
  // an address (Resend's user is literally "resend"; the From must be on a
  // domain verified there). Otherwise derive it from SMTP_USER, which is what
  // Gmail rewrites the header to anyway.
  const explicit = process.env.SMTP_FROM?.trim();
  return explicit || `"My Energy" <${process.env.SMTP_USER}>`;
}

/** What the SMTP server said, so the caller can log it and judge it. */
export interface MailDelivery {
  accepted: string[];
  rejected: string[];
  /** The server's raw reply line, e.g. "250 2.0.0 OK  169... - gsmtp". */
  response: string;
  messageId: string;
}

/**
 * Tells one waitlist subscriber that a product is purchasable again, in the
 * language they subscribed in.
 *
 * Throws on transport failure — and, importantly, also when the server
 * ACCEPTS the connection but REJECTS the recipient. nodemailer resolves in
 * that case rather than throwing, so the old code counted a rejected address
 * as sent, flipped the subscription to notified, and the mail silently never
 * arrived. The caller needs it to throw so the row is released for retry.
 */
export async function sendBackInStockEmail(
  email: string,
  product: { name: string; variant: string; url: string; locale?: string | null }
): Promise<MailDelivery> {
  // Build the body before opening the connection, and say plainly if the
  // template is what broke — a throw from in here used to surface as a
  // generic send failure.
  let rendered: { subject: string; html: string; text: string };
  try {
    const c = await emailContext(product.locale, "StockEmail");
    const subject = c.t("subject", { product: product.name });
    rendered = {
      subject,
      ...c.render({
        subject,
        preview: c.t("preview", { product: product.name }),
        reference: c.t("badge").toLocaleUpperCase(c.locale),
        kicker: { label: c.t("kicker"), tone: "success" },
        heading: c.t("heading", { product: product.name }),
        blocks: [
          { kind: "text", text: c.rich(product.variant ? "bodyVariant" : "body", { product: product.name, variant: product.variant }, ["product"]) },
          { kind: "cta", label: c.t("cta"), href: product.url, note: c.t("ctaNote") },
        ],
        footer: { reason: c.t("reason") },
      }),
    };
  } catch (error) {
    console.error("[RESTOCK] FAILED to render the back-in-stock template:", error, { product });
    throw new Error(
      `Back-in-stock template failed to render for "${product.name}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return sendHtmlEmail({ to: email, subject: oneLine(rendered.subject), html: rendered.html, text: rendered.text });
}

/** CR/LF stripped: a subject is a header, and a newline in a header is how header injection starts. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

/**
 * Sends one pre-rendered email (built with lib/email — the shared design
 * system). Throws when the recipient is rejected, like sendBackInStockEmail,
 * so the caller decides whether that is fatal.
 *
 * `headers` carries List-Unsubscribe for anything that isn't transactional:
 * Gmail and Yahoo require one-click unsubscribe from bulk senders, and the
 * ePrivacy rules require an easy opt-out in every marketing message.
 */
export async function sendHtmlEmail(message: {
  to: string;
  /** A copy — e.g. the buyer's accounts address on a receipt (User.billingEmail). */
  cc?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}): Promise<MailDelivery> {
  const info = await getTransporter().sendMail({ from: fromAddress(), ...message });
  const delivery: MailDelivery = {
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    response: String(info.response ?? ""),
    messageId: String(info.messageId ?? ""),
  };
  if (delivery.accepted.length === 0 || delivery.rejected.length > 0) {
    throw new Error(`SMTP rejected the recipient: response="${delivery.response}"`);
  }
  return delivery;
}

/** What the code is for — it changes the heading and the sentence around it. */
export type OtpPurpose = "signIn" | "stepUp" | "passwordChange";

/**
 * Sends a 6-digit one-time code. Never crashes the server on transport
 * problems: nodemailer failures are caught here, logged with their SMTP
 * diagnostics, and re-thrown as a clean Error for the calling server action
 * (lib/actions/otp.ts), which converts it into the SEND_FAILED result the
 * UI shows as "Couldn't send the code."
 *
 * The subject always STARTS with the code, in every language, so it can be
 * read from a lock-screen notification without opening the email.
 */
export async function sendOtpEmail(
  email: string,
  code: string,
  options: { purpose?: OtpPurpose; locale?: string | null } = {}
): Promise<void> {
  const purpose = options.purpose ?? "signIn";
  const c = await emailContext(options.locale, "OtpEmail");
  const subject = `${code} — ${c.t("subjectTail")}`;
  const { html, text } = c.render({
    subject,
    preview: c.t(`body_${purpose}`),
    reference: c.s("badgeSecurity").toLocaleUpperCase(c.locale),
    heading: c.t(`heading_${purpose}`),
    blocks: [
      { kind: "text", text: c.t(`body_${purpose}`) },
      { kind: "code", code, caption: c.t("codeCaption") },
      { kind: "callout", tone: "neutral", text: c.t("ignore") },
    ],
    footer: { reason: c.s("reasonSecurity") },
  });

  try {
    await getTransporter().sendMail({ from: fromAddress(), to: email, subject, text, html });
  } catch (error) {
    // Log the full SMTP diagnostics server-side (auth rejections, TLS
    // failures, Gmail 5xx responses), but surface only a clean message.
    const details =
      typeof error === "object" && error !== null
        ? {
            code: (error as { code?: string }).code,
            responseCode: (error as { responseCode?: number }).responseCode,
            response: (error as { response?: string }).response,
            command: (error as { command?: string }).command,
          }
        : {};
    console.error("[mail] Failed to send OTP email:", details, error);
    // A dead cached transporter (rotated app password, network change)
    // shouldn't poison every later send — rebuild on next attempt.
    transporter = null;
    throw new Error("OTP email could not be sent via SMTP.");
  }
}

/**
 * The shape of the SMTP configuration — never its secrets.
 *
 * Length and whitespace are exactly the facts that identify the usual
 * failure (a 16-character App Password pasted as 19 with its spaces), and
 * neither reveals the password.
 */
export function smtpDiagnostics(): {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  passwordSet: boolean;
  passwordLength: number;
  passwordHadWhitespace: boolean;
  looksLikeAppPassword: boolean;
} {
  const raw = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || "";
  const stripped = raw.replace(/\s+/g, "");
  const port = Number(process.env.SMTP_PORT ?? GMAIL_PORT);
  const user = process.env.SMTP_USER?.trim() || null;
  return {
    host: process.env.SMTP_HOST || GMAIL_HOST,
    port,
    secure: port === 465,
    // Enough to spot the wrong account, not enough to be a leak.
    user: user ? user.replace(/^(.{2}).*(@.*)$/, "$1***$2") : null,
    passwordSet: stripped.length > 0,
    passwordLength: stripped.length,
    passwordHadWhitespace: raw !== stripped,
    looksLikeAppPassword: stripped.length === 16,
  };
}

/**
 * Plain-text proof of life, used by GET /api/admin/test-smtp. Deliberately
 * the same transporter and the same From as every other message, so a pass
 * here really does clear the transport.
 */
export async function sendSmtpSelfTest(to: string): Promise<MailDelivery> {
  const active = getTransporter();
  const info = await active.sendMail({
    from: fromAddress(),
    to,
    subject: "SMTP is working!",
    text:
      "SMTP is working.\n\nSent by GET /api/admin/test-smtp to prove the transport is healthy. " +
      "If you are reading this, Nodemailer and Gmail are fine and any missing back-in-stock mail is a problem further up.",
  });

  const delivery: MailDelivery = {
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    response: String(info.response ?? ""),
    messageId: String(info.messageId ?? ""),
  };
  if (delivery.accepted.length === 0 || delivery.rejected.length > 0) {
    throw new Error(
      `SMTP accepted the message but rejected the recipient: accepted=[${delivery.accepted.join(", ")}] rejected=[${delivery.rejected.join(", ")}] response="${delivery.response}"`
    );
  }
  return delivery;
}
