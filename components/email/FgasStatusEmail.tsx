import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";

/**
 * F-Gas compliance service message: verified, received for review, refused,
 * revoked, expired. Every string arrives translated (lib/fgasNotify), so the
 * template only lays them out. Inline styles only, like the other templates.
 */

export interface FgasStatusEmailProps {
  lang: string;
  tone: "success" | "info" | "danger" | "warning";
  kicker: string;
  heading: string;
  greeting: string;
  paragraphs: string[];
  reason: { label: string; text: string } | null;
  rows: Array<{ label: string; value: string }>;
  cta: { label: string; href: string };
  footer: string;
  sender: { name: string; addressLines: string[] };
}

const NAVY = "#0F172A";
const MUTED = "#64748B";
const HAIRLINE = "#E2E8F0";
const BLUE = "#22429B";
const TONE = {
  success: { bg: "#ECFDF5", fg: "#047857", border: "#A7F3D0" },
  info: { bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" },
  danger: { bg: "#FEF2F2", fg: "#B91C1C", border: "#FECACA" },
  warning: { bg: "#FFFBEB", fg: "#B45309", border: "#FDE68A" },
} as const;

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export default function FgasStatusEmail(props: FgasStatusEmailProps) {
  const tone = TONE[props.tone];
  return (
    <Html lang={props.lang}>
      <Head />
      <Preview>{props.heading}</Preview>
      <Body style={{ margin: 0, backgroundColor: "#F7F8FA", fontFamily: font, color: NAVY }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px" }}>
          <Section style={{ backgroundColor: NAVY, borderRadius: "14px 14px 0 0", padding: "26px 32px" }}>
            <Text style={{ margin: 0, color: "#93C5FD", fontSize: 11, fontWeight: 700, letterSpacing: "2.4px" }}>MY ENERGY</Text>
            <Text style={{ margin: "14px 0 0", color: "#CBD5E1", fontSize: 11, fontWeight: 600, letterSpacing: "1.4px" }}>{props.kicker}</Text>
            <Text style={{ margin: "6px 0 0", color: "#FFFFFF", fontSize: 22, fontWeight: 700, lineHeight: "30px", letterSpacing: "-0.3px" }}>{props.heading}</Text>
          </Section>
          <Section style={{ backgroundColor: "#FFFFFF", border: `1px solid ${HAIRLINE}`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: "28px 32px" }}>
            <Text style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px" }}>{props.greeting}</Text>
            {props.paragraphs.map((p, i) => (
              <Text key={i} style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px" }}>
                {p}
              </Text>
            ))}
            {props.reason && (
              <Section style={{ backgroundColor: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 12, padding: "12px 16px", margin: "4px 0 20px" }}>
                <Text style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: tone.fg }}>{props.reason.label.toUpperCase()}</Text>
                <Text style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "21px", color: NAVY }}>{props.reason.text}</Text>
              </Section>
            )}
            {props.rows.length > 0 && (
              <Section style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: "12px 18px", margin: "0 0 22px" }}>
                {props.rows.map((r) => (
                  <Text key={r.label} style={{ margin: "4px 0", fontSize: 13.5, lineHeight: "20px" }}>
                    <span style={{ color: MUTED }}>{r.label}: </span>
                    <strong>{r.value}</strong>
                  </Text>
                ))}
              </Section>
            )}
            <Button href={props.cta.href} style={{ backgroundColor: BLUE, color: "#FFFFFF", fontSize: 15, fontWeight: 600, padding: "13px 26px", borderRadius: 12, textDecoration: "none" }}>
              {props.cta.label}
            </Button>
            <Hr style={{ borderColor: HAIRLINE, margin: "24px 0 16px" }} />
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>{props.footer}</Text>
          </Section>
          <Section style={{ padding: "16px 8px 0" }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>{[props.sender.name, ...props.sender.addressLines].join(" · ")}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
