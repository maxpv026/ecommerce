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
  const pass = SMTP_PASSWORD || SMTP_PASS;

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

/**
 * Sends the 6-digit sign-in code. Never crashes the server on transport
 * problems: nodemailer failures are caught here, logged with their SMTP
 * diagnostics, and re-thrown as a clean Error for the calling server action
 * (lib/actions/otp.ts), which converts it into the SEND_FAILED result the
 * UI shows as "Couldn't send the code."
 */
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
