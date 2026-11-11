import { Body, Button, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

/**
 * Restock reminder — "you usually reorder this about now", or the fixed
 * cadence the customer chose in Settings.
 *
 * Every string arrives translated (lib/notificationEmail →
 * sendReplenishmentEmail, namespace ReplenishmentEmail) and every figure is
 * read from the database at send time: today's catalogue price, and the
 * customer's own cadence and quantities. Nothing here is generated text.
 * Inline styles only, like the other templates.
 */

export interface ReplenishmentEmailProps {
  lang: string;
  preview: string;
  kicker: string;
  productName: string;
  greeting: string;
  paragraphs: string[];
  testBanner: string | null;
  /** "R32-10 · 10 kg cylinder" */
  meta: string;
  /** "2 × €250.00" */
  quantityLine: string;
  cta: { label: string; href: string };
  ctaNote: string;
  disclaimer: string;
  footer: string;
  preferences: { label: string; href: string };
  unsubscribe: { label: string; href: string };
  sender: { name: string; addressLines: string[] };
}

const NAVY = "#0F172A";
const MUTED = "#64748B";
const HAIRLINE = "#E2E8F0";
const BLUE = "#1D4ED8";

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export default function ReplenishmentEmail(props: ReplenishmentEmailProps) {
  return (
    <Html lang={props.lang}>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={{ margin: 0, backgroundColor: "#F8FAFC", fontFamily: font, color: NAVY }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px" }}>
          {props.testBanner && (
            <Text style={{ margin: "0 0 12px", padding: "8px 12px", borderRadius: 8, backgroundColor: "#FFFBEB", color: "#92400E", fontSize: 12.5, lineHeight: "18px" }}>
              {props.testBanner}
            </Text>
          )}
          <Section style={{ backgroundColor: NAVY, borderRadius: "14px 14px 0 0", padding: "26px 32px" }}>
            <Text style={{ margin: 0, color: "#93C5FD", fontSize: 11, fontWeight: 700, letterSpacing: "2.4px" }}>MY ENERGY</Text>
            <Text style={{ margin: "14px 0 0", color: "#CBD5E1", fontSize: 11, fontWeight: 600, letterSpacing: "1.4px" }}>{props.kicker}</Text>
            <Text style={{ margin: "6px 0 0", color: "#FFFFFF", fontSize: 22, fontWeight: 700, lineHeight: "30px", letterSpacing: "-0.3px" }}>
              {props.productName}
            </Text>
          </Section>

          <Section style={{ backgroundColor: "#FFFFFF", border: `1px solid ${HAIRLINE}`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: "28px 32px" }}>
            <Text style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px" }}>{props.greeting}</Text>
            {props.paragraphs.map((p, i) => (
              <Text key={i} style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px" }}>
                {p}
              </Text>
            ))}

            <Section style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: "14px 18px", margin: "4px 0 22px" }}>
              <Text style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: MUTED, fontFamily: mono }}>{props.meta}</Text>
              <Text style={{ margin: "2px 0 0", fontSize: 15, lineHeight: "22px", fontWeight: 600, fontFamily: mono }}>{props.quantityLine}</Text>
            </Section>

            <Button
              href={props.cta.href}
              style={{ backgroundColor: BLUE, color: "#FFFFFF", fontSize: 15, fontWeight: 600, padding: "13px 26px", borderRadius: 12, textDecoration: "none" }}
            >
              {props.cta.label}
            </Button>
            <Text style={{ margin: "14px 0 0", fontSize: 12.5, lineHeight: "19px", color: MUTED }}>{props.ctaNote}</Text>

            <Hr style={{ borderColor: HAIRLINE, margin: "24px 0 16px" }} />
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>{props.disclaimer}</Text>
          </Section>

          <Section style={{ padding: "20px 8px 0" }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>
              {props.footer}{" "}
              <Link href={props.preferences.href} style={{ color: BLUE }}>
                {props.preferences.label}
              </Link>{" "}
              ·{" "}
              <Link href={props.unsubscribe.href} style={{ color: BLUE }}>
                {props.unsubscribe.label}
              </Link>
            </Text>
            <Text style={{ margin: "10px 0 0", fontSize: 12, lineHeight: "19px", color: MUTED }}>{[props.sender.name, ...props.sender.addressLines].join(" · ")}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
