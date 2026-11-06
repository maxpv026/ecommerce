import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

/**
 * "Regulatory update" email — F-Gas rule changes, quota notices, deadlines.
 *
 * Inline styles only: email clients strip <style> blocks and ignore most of
 * CSS, so this is deliberately table-safe React Email primitives with style
 * objects, not Tailwind. Rendered by lib/notificationEmail.ts.
 *
 * `content` is plain text; blank lines separate paragraphs. React escapes it,
 * so a stray "<" in an update can't become markup.
 */

export interface RegulatoryUpdateEmailProps {
  recipientName: string | null;
  subject: string;
  content: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
  sender: { name: string; addressLines: string[] };
}

const NAVY = "#0F172A";
const MUTED = "#64748B";
const HAIRLINE = "#E2E8F0";
const BLUE = "#1D4ED8";

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export default function RegulatoryUpdateEmail({
  recipientName,
  subject,
  content,
  preferencesUrl,
  unsubscribeUrl,
  sender,
}: RegulatoryUpdateEmailProps) {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const firstName = recipientName?.trim().split(/\s+/)[0];

  return (
    <Html lang="en">
      <Head />
      <Preview>{paragraphs[0]?.slice(0, 140) ?? subject}</Preview>
      <Body style={{ margin: 0, backgroundColor: "#F8FAFC", fontFamily: font, color: NAVY }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px" }}>
          <Section style={{ backgroundColor: NAVY, borderRadius: "14px 14px 0 0", padding: "26px 32px" }}>
            <Text style={{ margin: 0, color: "#93C5FD", fontSize: 11, fontWeight: 700, letterSpacing: "2.4px" }}>
              MY ENERGY
            </Text>
            <Text style={{ margin: "14px 0 0", color: "#CBD5E1", fontSize: 11, fontWeight: 600, letterSpacing: "1.4px" }}>
              REGULATORY UPDATE
            </Text>
            <Text style={{ margin: "6px 0 0", color: "#FFFFFF", fontSize: 22, fontWeight: 700, lineHeight: "30px", letterSpacing: "-0.3px" }}>
              {subject}
            </Text>
          </Section>

          <Section
            style={{
              backgroundColor: "#FFFFFF",
              border: `1px solid ${HAIRLINE}`,
              borderTop: "none",
              borderRadius: "0 0 14px 14px",
              padding: "28px 32px",
            }}
          >
            {firstName && <Text style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px" }}>Hello {firstName},</Text>}
            {paragraphs.map((paragraph, i) => (
              <Text key={i} style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px", whiteSpace: "pre-line" }}>
                {paragraph}
              </Text>
            ))}
            <Hr style={{ borderColor: HAIRLINE, margin: "24px 0 16px" }} />
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>
              For guidance only. This summary does not replace the text of the regulation, and it is not legal advice.
            </Text>
          </Section>

          <Section style={{ padding: "20px 8px 0" }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>
              You&rsquo;re receiving this because regulatory updates are turned on for your My Energy account.{" "}
              <Link href={preferencesUrl} style={{ color: BLUE }}>
                Manage preferences
              </Link>{" "}
              ·{" "}
              <Link href={unsubscribeUrl} style={{ color: BLUE }}>
                Unsubscribe
              </Link>
            </Text>
            <Text style={{ margin: "10px 0 0", fontSize: 12, lineHeight: "19px", color: MUTED }}>
              {[sender.name, ...sender.addressLines].join(" · ")}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
