import "server-only";
import nodemailer from "nodemailer";
import { emailContext } from "@/lib/email/context";

// Email delivery. Every message's body comes from the shared design system
// in lib/email (design.ts renders, context.ts localizes); this module is the
// transport and the security-code email.
//
// Two transports, one entry point (deliver):
//
//   resend  — Resend's HTTP API (RESEND_API_KEY). Preferred in production:
//             one HTTPS request per message, no SMTP handshake on a cold
//             serverless start, attachments as base64.
//   smtp    — nodemailer (SMTP_*), e.g. smtp.resend.com:465 or Gmail.
//
// mailTransport() picks: MAIL_TRANSPORT ("resend" | "smtp" | "off") when set;
// otherwise an SMTP_HOST on this machine (127.0.0.1 / localhost — every test
// harness's mail sink) ALWAYS wins, so test runs never reach Resend even with
// the real key in .env.local; then RESEND_API_KEY; then SMTP. NODE_ENV=test
// defaults to "off". Fixture addresses (*.test, example.com/org/net) are
// never handed to Resend either.
//
// From: EMAIL_FROM, else SMTP_FROM (must be on the domain verified at the
// provider — "My Energy <orders@myeenergy.com>"). Reply-To: EMAIL_REPLY_TO.
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

export type MailTransport = "resend" | "smtp" | "off";

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|localhost|::1)$/i;

export function mailTransport(): MailTransport {
  const forced = process.env.MAIL_TRANSPORT?.trim().toLowerCase();
  if (forced === "resend" || forced === "smtp" || forced === "off") return forced;
  if (LOOPBACK.test(process.env.SMTP_HOST?.trim() ?? "")) return "smtp";
  if (process.env.NODE_ENV === "test") return "off";
  return process.env.RESEND_API_KEY?.trim() ? "resend" : "smtp";
}

/** Addresses that only ever belong to test fixtures. */
const FIXTURE_ADDRESS = /@(?:[^@\s]+\.)?(?:example\.(?:com|org|net)|[^@\s]+\.test)$/i;

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
    // Port 465 is implicit TLS (Gmail, smtp.resend.com); other ports negotiate
    // STARTTLS where the server offers it. SMTP_SECURE overrides.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
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
  // EMAIL_FROM / SMTP_FROM win when set — required for Resend, whose SMTP
  // login is literally "resend" and whose From must be on the verified domain.
  // Otherwise derive it from SMTP_USER, which Gmail rewrites the header to anyway.
  const explicit = process.env.EMAIL_FROM?.trim() || process.env.SMTP_FROM?.trim();
  return explicit || `"My Energy" <${process.env.SMTP_USER}>`;
}

const replyTo = () => process.env.EMAIL_REPLY_TO?.trim() || undefined;

type OutgoingMail = {
  to: string;
  cc?: string;
  subject: string;
  html?: string;
  text: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
};

/**
 * The one place a message leaves the app. Returns what the provider said;
 * throws on a transport failure or a rejected recipient, so callers that
 * release a claim on failure (waitlist, reminders) can retry.
 */
async function deliver(message: OutgoingMail): Promise<MailDelivery> {
  const mode = mailTransport();
  const recipients = [message.to, ...(message.cc ? [message.cc] : [])];

  if (mode === "off" || (mode === "resend" && recipients.every((r) => FIXTURE_ADDRESS.test(r)))) {
    console.log(`[mail] not sent (${mode === "off" ? "MAIL_TRANSPORT=off / test" : "fixture address"}): "${message.subject}" → ${recipients.join(", ")}`);
    return { accepted: recipients, rejected: [], response: "skipped", messageId: "" };
  }

  if (mode === "resend") {
    const live = recipients.filter((r) => !FIXTURE_ADDRESS.test(r));
    const toAddress = live.includes(message.to) ? message.to : live[0]!;
    const ccAddress = message.cc && live.includes(message.cc) && message.cc !== toAddress ? message.cc : null;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress(),
        to: [toAddress],
        ...(ccAddress ? { cc: [ccAddress] } : {}),
        ...(replyTo() ? { reply_to: replyTo() } : {}),
        subject: message.subject,
        ...(message.html ? { html: message.html } : {}),
        text: message.text,
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.attachments?.length
          ? { attachments: message.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64"), content_type: a.contentType })) }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (!res.ok || !body?.id) {
      throw new Error(`Resend rejected the message: ${res.status} ${body?.name ?? ""} ${body?.message ?? ""}`.trim());
    }
    return { accepted: ccAddress ? [toAddress, ccAddress] : [toAddress], rejected: [], response: `resend ${res.status}`, messageId: body.id };
  }

  const info = await getTransporter().sendMail({ from: fromAddress(), ...(replyTo() ? { replyTo: replyTo() } : {}), ...message });
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
  return deliver(message);
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
    await deliver({ to: email, subject, text, html });
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
    console.error(`[mail] Failed to send OTP email (${mailTransport()}):`, details, error);
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
  /** Which path messages take right now (mailTransport). */
  transport: MailTransport;
  /** RESEND_API_KEY present — never the key itself. */
  resendKeySet: boolean;
  from: string;
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
    transport: mailTransport(),
    resendKeySet: Boolean(process.env.RESEND_API_KEY?.trim()),
    from: fromAddress(),
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
  return deliver({
    to,
    subject: "Email is working!",
    text:
      `Email is working (transport: ${mailTransport()}).\n\nSent by GET /api/admin/test-smtp to prove the transport is healthy. ` +
      "If you are reading this, delivery is fine and any missing back-in-stock mail is a problem further up.",
  });
}
