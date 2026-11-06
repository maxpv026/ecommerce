import { Body, Button, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

/**
 * Predictive replenishment reminder — "you usually reorder this about now".
 *
 * Every figure is read from the database at send time (lib/notificationEmail
 * sendReplenishmentEmail): the price is today's catalogue price, and the
 * cadence and quantity are the customer's own history. Nothing here is
 * generated text. Inline styles only, like RegulatoryUpdateEmail.
 */

export interface ReplenishmentEmailProps {
  recipientName: string | null;
  companyName: string | null;
  productName: string;
  sku: string;
  /** Pack label, e.g. "10 kg cylinder". */
  variant: string;
  /** Today's price of one container, formatted ("€250.00"). */
  unitPrice: string;
  /** Refundable deposit per container, formatted, or null when there is none. */
  deposit: string | null;
  /** The customer's usual quantity per order. */
  recommendedQty: number;
  /** Their usual interval between orders, in whole days. */
  everyDays: number;
  /** When they would usually reorder, formatted ("3 November 2026"). */
  expectedDate: string;
  reorderUrl: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
  sender: { name: string; addressLines: string[] };
}

const NAVY = "#0F172A";
const MUTED = "#64748B";
const HAIRLINE = "#E2E8F0";
const BLUE = "#1D4ED8";

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export default function ReplenishmentEmail(props: ReplenishmentEmailProps) {
  const greeting = props.recipientName?.trim() ? `Dear ${props.recipientName.trim()},` : "Dear customer,";
  const label = `${props.productName} (${props.sku})`;

  return (
    <Html lang="en">
      <Head />
      <Preview>{`Your stock of ${label} may be running low soon.`}</Preview>
      <Body style={{ margin: 0, backgroundColor: "#F8FAFC", fontFamily: font, color: NAVY }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px" }}>
          <Section style={{ backgroundColor: NAVY, borderRadius: "14px 14px 0 0", padding: "26px 32px" }}>
            <Text style={{ margin: 0, color: "#93C5FD", fontSize: 11, fontWeight: 700, letterSpacing: "2.4px" }}>MY ENERGY</Text>
            <Text style={{ margin: "14px 0 0", color: "#CBD5E1", fontSize: 11, fontWeight: 600, letterSpacing: "1.4px" }}>
              REPLENISHMENT REMINDER
            </Text>
            <Text style={{ margin: "6px 0 0", color: "#FFFFFF", fontSize: 22, fontWeight: 700, lineHeight: "30px", letterSpacing: "-0.3px" }}>
              {props.productName}
            </Text>
          </Section>

          <Section
            style={{ backgroundColor: "#FFFFFF", border: `1px solid ${HAIRLINE}`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: "28px 32px" }}
          >
            <Text style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px" }}>{greeting}</Text>
            <Text style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px" }}>
              Based on your purchase history{props.companyName ? ` for ${props.companyName}` : ""}, your stock of {label} may be
              running low soon. You have typically reordered it every {props.everyDays} days; your next order would usually be due
              around {props.expectedDate}.
            </Text>
            <Text style={{ margin: "0 0 20px", fontSize: 15, lineHeight: "24px" }}>
              The current price is {props.unitPrice} per {props.variant} (excl. VAT)
              {props.deposit ? `, plus a refundable container deposit of ${props.deposit}` : ""}. To reorder your usual{" "}
              {props.recommendedQty} × {props.variant}, use the button below.
            </Text>

            <Section style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: "14px 18px", margin: "0 0 22px" }}>
              <Text style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: MUTED }}>
                {props.sku} · {props.variant}
              </Text>
              <Text style={{ margin: "2px 0 0", fontSize: 15, lineHeight: "22px", fontWeight: 600 }}>
                {props.recommendedQty} × {props.unitPrice}
              </Text>
            </Section>

            <Button
              href={props.reorderUrl}
              style={{ backgroundColor: BLUE, color: "#FFFFFF", fontSize: 15, fontWeight: 600, padding: "13px 26px", borderRadius: 12, textDecoration: "none" }}
            >
              Reorder in 1 click
            </Button>
            <Text style={{ margin: "14px 0 0", fontSize: 12.5, lineHeight: "19px", color: MUTED }}>
              The button places the items in your cart for review — nothing is ordered until you confirm at checkout, where
              prices and availability are confirmed.
            </Text>

            <Hr style={{ borderColor: HAIRLINE, margin: "24px 0 16px" }} />
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>
              This estimate is based only on the dates of your previous orders with us. If your requirements have changed, you
              can ignore this message.
            </Text>
          </Section>

          <Section style={{ padding: "20px 8px 0" }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>
              You&rsquo;re receiving this because restock reminders are turned on for your My Energy account.{" "}
              <Link href={props.preferencesUrl} style={{ color: BLUE }}>
                Manage preferences
              </Link>{" "}
              ·{" "}
              <Link href={props.unsubscribeUrl} style={{ color: BLUE }}>
                Unsubscribe
              </Link>
            </Text>
            <Text style={{ margin: "10px 0 0", fontSize: 12, lineHeight: "19px", color: MUTED }}>
              {[props.sender.name, ...props.sender.addressLines].join(" · ")}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
