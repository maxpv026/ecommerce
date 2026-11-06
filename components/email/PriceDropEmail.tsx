import { Body, Button, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

/**
 * "A product on your Favorites list dropped in price."
 *
 * Every figure comes from the database at send time (lib/notificationEmail
 * sendPriceDropEmail). Inline styles only, like the other templates here.
 */

export interface PriceDropEmailProps {
  recipientName: string | null;
  productName: string;
  sku: string;
  /** Pack label, e.g. "10 kg cylinder". */
  variant: string;
  /** Formatted container prices, gas only, excl. VAT. */
  oldPrice: string;
  newPrice: string;
  /** e.g. "12%". */
  saving: string;
  productUrl: string;
  favoritesUrl: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
  sender: { name: string; addressLines: string[] };
}

const NAVY = "#0F172A";
const MUTED = "#64748B";
const HAIRLINE = "#E2E8F0";
const BLUE = "#22429B";

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export default function PriceDropEmail(props: PriceDropEmailProps) {
  const greeting = props.recipientName?.trim() ? `Dear ${props.recipientName.trim()},` : "Dear customer,";

  return (
    <Html lang="en">
      <Head />
      <Preview>{`${props.productName} is now ${props.newPrice} (previously ${props.oldPrice}).`}</Preview>
      <Body style={{ margin: 0, backgroundColor: "#F7F8FA", fontFamily: font, color: NAVY }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px" }}>
          <Section style={{ backgroundColor: NAVY, borderRadius: "14px 14px 0 0", padding: "26px 32px" }}>
            <Text style={{ margin: 0, color: "#93C5FD", fontSize: 11, fontWeight: 700, letterSpacing: "2.4px" }}>MY ENERGY</Text>
            <Text style={{ margin: "14px 0 0", color: "#CBD5E1", fontSize: 11, fontWeight: 600, letterSpacing: "1.4px" }}>PRICE DROP</Text>
            <Text style={{ margin: "6px 0 0", color: "#FFFFFF", fontSize: 22, fontWeight: 700, lineHeight: "30px", letterSpacing: "-0.3px" }}>
              {props.productName}
            </Text>
          </Section>

          <Section
            style={{ backgroundColor: "#FFFFFF", border: `1px solid ${HAIRLINE}`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: "28px 32px" }}
          >
            <Text style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "24px" }}>{greeting}</Text>
            <Text style={{ margin: "0 0 20px", fontSize: 15, lineHeight: "24px" }}>
              A product on your Favorites list has dropped in price. {props.productName} ({props.variant}) is now available at{" "}
              <strong>{props.newPrice}</strong> (previously {props.oldPrice}).
            </Text>

            <Section style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: "14px 18px", margin: "0 0 22px" }}>
              <Text style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: MUTED }}>
                {props.sku} · {props.variant} · excl. VAT
              </Text>
              <Text style={{ margin: "4px 0 0", fontSize: 15, lineHeight: "22px" }}>
                <span style={{ color: MUTED, textDecoration: "line-through" }}>{props.oldPrice}</span>
                {"  "}
                <strong style={{ fontSize: 18 }}>{props.newPrice}</strong>
                {"  "}
                <span style={{ color: "#047857", fontWeight: 600 }}>−{props.saving}</span>
              </Text>
            </Section>

            <Button
              href={props.productUrl}
              style={{ backgroundColor: BLUE, color: "#FFFFFF", fontSize: 15, fontWeight: 600, padding: "13px 26px", borderRadius: 12, textDecoration: "none" }}
            >
              View product
            </Button>
            <Text style={{ margin: "14px 0 0", fontSize: 12.5, lineHeight: "19px", color: MUTED }}>
              Prices can change; the price shown at checkout applies. Stock is not reserved by this message.
            </Text>

            <Hr style={{ borderColor: HAIRLINE, margin: "24px 0 16px" }} />
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>
              <Link href={props.favoritesUrl} style={{ color: BLUE }}>
                View your Favorites
              </Link>
            </Text>
          </Section>

          <Section style={{ padding: "20px 8px 0" }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "19px", color: MUTED }}>
              You&rsquo;re receiving this because price drop alerts are turned on for your My Energy account and this product is
              on your Favorites list.{" "}
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
