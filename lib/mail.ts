import "server-only";
import nodemailer from "nodemailer";

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
  // Gmail rewrites the From header to the authenticated account anyway, so
  // derive it from SMTP_USER and keep only the display name fixed.
  return `"My Energy" <${process.env.SMTP_USER}>`;
}

function otpEmailHtml(code: string): string {
  return `
<div style="background:#f8fafc;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:20px;padding:36px 32px;border:1px solid #e2e8f0;">
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:28px;">
      <span style="display:inline-block;width:13px;height:13px;border-radius:999px;border:3.5px solid #0f172a;"></span>
      <span style="font-size:16px;font-weight:600;letter-spacing:-0.02em;color:#0f172a;">My Energy</span>
    </div>
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:.05em;color:#94a3b8;text-transform:uppercase;">Verification code</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#475569;">
      Enter this code to finish signing in to your My Energy account. It expires in 10 minutes.
    </p>
    <div style="text-align:center;background:#f1f5f9;border-radius:14px;padding:20px;margin-bottom:24px;">
      <span style="font-size:32px;font-weight:700;letter-spacing:.3em;color:#1d4ed8;">${code}</span>
    </div>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
      If you didn't request this code, you can safely ignore this email.
    </p>
  </div>
</div>`.trim();
}

function backInStockEmailHtml(productName: string, variant: string, url: string): string {
  return `
<div style="background:#f8fafc;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:460px;margin:0 auto;background:#ffffff;border-radius:20px;padding:36px 32px;border:1px solid #e2e8f0;">
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:28px;">
      <span style="display:inline-block;width:13px;height:13px;border-radius:999px;border:3.5px solid #0f172a;"></span>
      <span style="font-size:16px;font-weight:600;letter-spacing:-0.02em;color:#0f172a;">My Energy</span>
    </div>
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:.05em;color:#059669;text-transform:uppercase;font-weight:600;">Back in stock</p>
    <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;letter-spacing:-0.03em;color:#0f172a;">${productName} is available again</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
      You asked to be told when <strong style="color:#0f172a;">${productName}</strong>${variant ? ` (${variant})` : ""}
      came back into stock. It just did. Stock is limited and moves quickly, so order soon if you still need it.
    </p>
    <a href="${url}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14.5px;font-weight:600;letter-spacing:-0.01em;padding:14px 26px;border-radius:14px;">
      View the product
    </a>
    <p style="margin:26px 0 0;font-size:12px;line-height:1.55;color:#94a3b8;">
      You are receiving this once because you joined the waitlist for this product. You are not subscribed to anything else,
      and we won't email you about it again.
    </p>
  </div>
</div>`.trim();
}

function orderConfirmationHtml(o: {
  orderNumber: string;
  invoiceNumber: string;
  customerName: string | null;
  total: string;
  cylinders: number;
  lines: Array<{ name: string; variant: string; qty: number }>;
  orderUrl: string;
}): string {
  const rows = o.lines
    .map(
      (l) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:13.5px;color:#0f172a;">
          <strong style="font-weight:600;">${escapeHtml(l.name)}</strong>
          <span style="color:#94a3b8;">${l.variant ? ` · ${escapeHtml(l.variant)}` : ""}</span>
        </td>
        <td style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:13.5px;color:#475569;text-align:right;">×${l.qty}</td>
      </tr>`
    )
    .join("");

  return `
<div style="background:#f8fafc;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:20px;padding:36px 32px;border:1px solid #e2e8f0;">
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:28px;">
      <span style="display:inline-block;width:13px;height:13px;border-radius:999px;border:3.5px solid #0f172a;"></span>
      <span style="font-size:16px;font-weight:600;letter-spacing:-0.02em;color:#0f172a;">My Energy</span>
    </div>
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:.05em;color:#1d4ed8;text-transform:uppercase;font-weight:600;">Order confirmed</p>
    <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;letter-spacing:-0.03em;color:#0f172a;">Thank you${o.customerName ? `, ${escapeHtml(o.customerName)}` : ""}</h1>
    <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#475569;">
      We have your order <strong style="color:#0f172a;">${escapeHtml(o.orderNumber)}</strong>.
      Invoice <strong style="color:#0f172a;">${escapeHtml(o.invoiceNumber)}</strong> is attached to this email as a PDF.
    </p>

    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">${rows}</table>

    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="padding:10px 0 0;border-top:1px solid #0f172a;font-size:14px;font-weight:600;color:#0f172a;">Total</td>
        <td style="padding:10px 0 0;border-top:1px solid #0f172a;font-size:16px;font-weight:600;color:#1d4ed8;text-align:right;">${escapeHtml(o.total)}</td>
      </tr>
    </table>

    ${
      o.cylinders > 0
        ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;line-height:1.55;color:#475569;">
        <strong style="color:#0f172a;">${o.cylinders} returnable cylinder${o.cylinders === 1 ? "" : "s"}</strong>
        ${o.cylinders === 1 ? "has" : "have"} been added to your account. The deposit is refunded in full when ${o.cylinders === 1 ? "it is" : "they are"} returned undamaged.
      </p>
    </div>`
        : ""
    }

    <a href="${o.orderUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14.5px;font-weight:600;letter-spacing:-0.01em;padding:14px 26px;border-radius:14px;">
      View your order
    </a>
    <p style="margin:26px 0 0;font-size:12px;line-height:1.55;color:#94a3b8;">
      Payment is by bank transfer. Please quote ${escapeHtml(o.invoiceNumber)} with your transfer.
    </p>
  </div>
</div>`.trim();
}

/** Order data is customer-supplied; never interpolate it raw into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
 * Tells one waitlist subscriber that a product is purchasable again.
 *
 * Throws on transport failure — and, importantly, also when the server
 * ACCEPTS the connection but REJECTS the recipient. nodemailer resolves in
 * that case rather than throwing, so the old code counted a rejected address
 * as sent, flipped the subscription to notified, and the mail silently never
 * arrived. The caller needs it to throw so the row is released for retry.
 */
export async function sendBackInStockEmail(
  email: string,
  product: { name: string; variant: string; url: string }
): Promise<MailDelivery> {
  const active = getTransporter();

  // Build the body before opening the connection, and say plainly if the
  // template is what broke — a throw from in here used to surface as a
  // generic send failure.
  let html: string;
  try {
    html = backInStockEmailHtml(product.name, product.variant, product.url);
  } catch (error) {
    console.error("[RESTOCK] FAILED to render the back-in-stock template:", error, { product });
    throw new Error(
      `Back-in-stock template failed to render for "${product.name}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const info = await active.sendMail({
    from: fromAddress(),
    to: email,
    subject: `${product.name} is back in stock`,
    text: `${product.name}${product.variant ? ` (${product.variant})` : ""} is back in stock at My Energy. View it here: ${product.url}`,
    html,
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

/**
 * Sends the 6-digit sign-in code. Never crashes the server on transport
 * problems: nodemailer failures are caught here, logged with their SMTP
 * diagnostics, and re-thrown as a clean Error for the calling server action
 * (lib/actions/otp.ts), which converts it into the SEND_FAILED result the
 * UI shows as "Couldn't send the code."
 */
/**
 * Order confirmation with the invoice PDF attached.
 *
 * The buffer is passed in rather than generated here so lib/mail.ts keeps no
 * dependency on Prisma or @react-pdf — this module is imported by the OTP
 * path on every sign-in, and dragging a PDF renderer into that is a cost for
 * nothing.
 *
 * Returns the delivery result instead of throwing on rejection: an order is
 * already placed and paid for by the time this runs, and a bounced
 * confirmation must never look like a failed checkout. The caller logs it.
 */
export async function sendOrderConfirmationEmail(
  email: string,
  order: {
    orderNumber: string;
    invoiceNumber: string;
    customerName: string | null;
    total: string;
    cylinders: number;
    lines: Array<{ name: string; variant: string; qty: number }>;
    orderUrl: string;
  },
  invoicePdf: Buffer | null
): Promise<MailDelivery> {
  const active = getTransporter();

  const html = orderConfirmationHtml(order);
  const text = [
    `Order ${order.orderNumber} confirmed.`,
    `Invoice ${order.invoiceNumber}${invoicePdf ? " is attached as a PDF." : "."}`,
    ...order.lines.map((l) => `  ${l.qty} x ${l.name}${l.variant ? ` (${l.variant})` : ""}`),
    `Total: ${order.total}`,
    order.cylinders > 0
      ? `${order.cylinders} returnable cylinder(s) added to your account; the deposit is refunded on return.`
      : "",
    `View your order: ${order.orderUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const info = await active.sendMail({
    from: fromAddress(),
    to: email,
    subject: `Order ${order.orderNumber} confirmed — invoice ${order.invoiceNumber}`,
    text,
    html,
    // Omitted entirely when rendering failed: an email with a 0-byte
    // "invoice.pdf" is worse than one that simply says where to find it.
    ...(invoicePdf
      ? {
          attachments: [
            {
              filename: `${order.invoiceNumber}.pdf`,
              content: invoicePdf,
              contentType: "application/pdf",
            },
          ],
        }
      : {}),
  });

  return {
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    response: String(info.response ?? ""),
    messageId: String(info.messageId ?? ""),
  };
}

/**
 * Predictive restock nudge, with an AI-composed body.
 *
 * The message is passed in already generated and cleaned: this module stays
 * free of any AI dependency, and the cron can refuse to send when the model
 * returns something unusable rather than falling back to a template that
 * pretends to be personal.
 *
 * Returns the delivery result instead of throwing — the caller decides
 * whether the alert row is marked NOTIFIED.
 */
export async function sendSmartRestockEmail(
  email: string,
  alert: {
    customerName: string | null;
    productName: string;
    productVariant: string;
    recommendedQty: number;
    message: string;
    productUrl: string;
  }
): Promise<MailDelivery> {
  const active = getTransporter();

  const html = `
<div style="background:#f8fafc;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;padding:36px 32px;border:1px solid #e2e8f0;">
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:28px;">
      <span style="display:inline-block;width:13px;height:13px;border-radius:999px;border:3.5px solid #0f172a;"></span>
      <span style="font-size:16px;font-weight:600;letter-spacing:-0.02em;color:#0f172a;">My Energy</span>
    </div>
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:.05em;color:#1d4ed8;text-transform:uppercase;font-weight:600;">Restock reminder</p>
    <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;letter-spacing:-0.03em;color:#0f172a;">${escapeHtml(alert.productName)}</h1>
    <p style="margin:0 0 22px;font-size:14.5px;line-height:1.65;color:#334155;">${escapeHtml(alert.message)}</p>
    <div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;line-height:1.55;color:#475569;">
        Suggested reorder: <strong style="color:#0f172a;">${alert.recommendedQty} ×</strong>
        ${escapeHtml(alert.productName)}${alert.productVariant ? ` · ${escapeHtml(alert.productVariant)}` : ""}
      </p>
    </div>
    <a href="${alert.productUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14.5px;font-weight:600;letter-spacing:-0.01em;padding:14px 26px;border-radius:14px;">
      Reorder now
    </a>
    <p style="margin:26px 0 0;font-size:12px;line-height:1.55;color:#94a3b8;">
      You are receiving this because your account shows a regular reorder pattern for this product.
      Manage restock reminders from your profile at any time.
    </p>
  </div>
</div>`.trim();

  const info = await active.sendMail({
    from: fromAddress(),
    to: email,
    subject: `Time to restock ${alert.productName}`,
    text: `${alert.message}\n\nSuggested reorder: ${alert.recommendedQty} x ${alert.productName}${alert.productVariant ? ` (${alert.productVariant})` : ""}\nReorder: ${alert.productUrl}`,
    html,
  });

  return {
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    response: String(info.response ?? ""),
    messageId: String(info.messageId ?? ""),
  };
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const active = getTransporter();

  try {
    await active.sendMail({
      from: fromAddress(),
      to: email,
      subject: `${code} is your My Energy verification code`,
      text: `Your My Energy verification code is ${code}. It expires in 10 minutes.`,
      html: otpEmailHtml(code),
    });
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
