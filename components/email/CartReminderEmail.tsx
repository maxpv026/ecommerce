import { Body, Button, Column, Container, Head, Hr, Html, Link, Preview, Row, Section, Text } from "@react-email/components";

/**
 * "You left items in your cart" — the abandoned-cart reminder.
 *
 * Every string arrives translated and every figure formatted (lib/cartReminder
 * reads today's price and stock per line at send time). The template only
 * lays them out. Inline styles only, like the other templates.
 */

export interface CartReminderLine {
  name: string;
  /** "R-32 · 10 kg cylinder · R32-10" */
  meta: string;
  qty: number;
  unitPrice: string;
  lineTotal: string;
  stock: { label: string; tone: "ok" | "low" | "out" };
}

export interface CartReminderEmailProps {
  lang: string;
  preview: string;
  kicker: string;
  heading: string;
  greeting: string;
  intro: string;
  testBanner: string | null;
  lines: CartReminderLine[];
  labels: { qty: string; total: string };
  totals: Array<{ label: string; value: string; strong?: boolean }>;
  totalsNote: string;
  cta: { label: string; href: string };
  ctaNote: string;
  footer: string;
  preferences: { label: string; href: string };
  unsubscribe: { label: string; href: string };
  sender: { name: string; addressLines: string[] };
}

const NAVY = "#0F172A";
const MUTED = "#64748B";
const HAIRLINE = "#E2E8F0";
const BLUE = "#1D4ED8";
const STOCK = {
  ok: { fg: "#047857", bg: "#ECFDF5" },
  low: { fg: "#B45309", bg: "#FFFBEB" },
  out: { fg: "#B91C1C", bg: "#FEF2F2" },
} as const;

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export default function CartReminderEmail(props: CartReminderEmailProps) {
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
            <Text style={{ margin: "6px 0 0", color: "#FFFFFF", fontSize: 22, fontWeight: 700, lineHeight: "30px", letterSpacing: "-0.3px" }}>{props.heading}</Text>
          </Section>

          <Section style={{ backgroundColor: "#FFFFFF", border: `1px solid ${HAIRLINE}`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: "28px 32px" }}>
            <Text style={{ margin: "0 0 14px", fontSize: 15, lineHeight: "24px" }}>{props.greeting}</Text>
            <Text style={{ margin: "0 0 20px", fontSize: 15, lineHeight: "24px" }}>{props.intro}</Text>

            <Section style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: "4px 18px", margin: "0 0 18px" }}>
              {props.lines.map((line, i) => {
                const tone = STOCK[line.stock.tone];
                return (
                  <Row key={`${line.meta}-${i}`} style={{ borderTop: i > 0 ? `1px solid ${HAIRLINE}` : "none" }}>
                    <Column style={{ padding: "12px 0", verticalAlign: "top" }}>
                      <Text style={{ margin: 0, fontSize: 14.5, lineHeight: "21px", fontWeight: 600 }}>{line.name}</Text>
                      <Text style={{ margin: "2px 0 0", fontSize: 12, lineHeight: "18px", color: MUTED, fontFamily: mono }}>{line.meta}</Text>
                      <Text style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: "18px", color: MUTED }}>
                        {props.labels.qty} <span style={{ fontFamily: mono, color: NAVY }}>{line.qty}</span> × <span style={{ fontFamily: mono }}>{line.unitPrice}</span>
                        {"  "}
                        <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 6, backgroundColor: tone.bg, color: tone.fg, fontSize: 11.5, fontWeight: 600 }}>
                          {line.stock.label}
                        </span>
                      </Text>
                    </Column>
                    <Column style={{ padding: "12px 0", verticalAlign: "top", textAlign: "right", width: 120 }}>
                      <Text style={{ margin: 0, fontSize: 14.5, lineHeight: "21px", fontWeight: 600, fontFamily: mono }}>{line.lineTotal}</Text>
                    </Column>
                  </Row>
                );
              })}
            </Section>

            <Section style={{ margin: "0 0 6px" }}>
              {props.totals.map((row) => (
                <Row key={row.label}>
                  <Column>
                    <Text style={{ margin: "3px 0", fontSize: row.strong ? 15 : 13.5, fontWeight: row.strong ? 700 : 400, color: row.strong ? NAVY : MUTED }}>{row.label}</Text>
                  </Column>
                  <Column style={{ textAlign: "right" }}>
                    <Text style={{ margin: "3px 0", fontSize: row.strong ? 15 : 13.5, fontWeight: row.strong ? 700 : 500, fontFamily: mono, color: NAVY }}>{row.value}</Text>
                  </Column>
                </Row>
              ))}
            </Section>
            <Text style={{ margin: "0 0 22px", fontSize: 12, lineHeight: "18px", color: MUTED }}>{props.totalsNote}</Text>

            <Button
              href={props.cta.href}
              style={{ backgroundColor: BLUE, color: "#FFFFFF", fontSize: 15, fontWeight: 600, padding: "13px 26px", borderRadius: 12, textDecoration: "none" }}
            >
              {props.cta.label}
            </Button>
            <Text style={{ margin: "14px 0 0", fontSize: 12.5, lineHeight: "19px", color: MUTED }}>{props.ctaNote}</Text>

            <Hr style={{ borderColor: HAIRLINE, margin: "24px 0 16px" }} />
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
          </Section>

          <Section style={{ padding: "16px 8px 0" }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>{[props.sender.name, ...props.sender.addressLines].join(" · ")}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
