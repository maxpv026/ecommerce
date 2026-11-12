/**
 * Which translation namespaces are serialized into the page for the browser.
 *
 * NextIntlClientProvider puts every message it is given into the HTML (the
 * RSC payload) of every page, and the dictionaries have grown to ~78 KB
 * (more in Cyrillic) — admin screens, e-mail templates, checkout, profile,
 * the F-Gas checklist. The home page was shipping all of it.
 *
 * So the root layout passes a trimmed set, and the routes that need the rest
 * wrap themselves in <FullMessagesProvider> (components/i18n), which hands
 * the full set back. A nested provider REPLACES its parent's messages rather
 * than merging (use-intl IntlProvider), which is why it passes everything,
 * not just the difference.
 *
 * Server components are unaffected: getTranslations() always reads the full
 * dictionary on the server. Only client components (useTranslations in a
 * browser bundle) depend on these lists.
 *
 * ── Keeping this correct ──
 * A namespace may be listed in ROUTE_SCOPED only if every client component
 * that reads it is reached solely from the routes wrapped below — never from
 * the root layout or a page outside them. The lists were derived by walking
 * the import graph from each consumer to its pages; re-check when a scoped
 * namespace starts being used somewhere new. A miss is visible, not silent:
 * next-intl renders the key path ("Cart.total") and logs MISSING_MESSAGE.
 */

/** Never read in a browser: e-mail templates, and namespaces nothing uses. */
export const SERVER_ONLY_NAMESPACES = [
  "FgasEmail",
  "PasswordResetEmail",
  "CartReminderEmail",
  "ReplenishmentEmail",
  "EmailShell",
  "OtpEmail",
  "StockEmail",
  "OrderEmail",
  "PriceDropEmail",
  "BroadcastEmail",
  "SupportEmail",
  "Trust",
  "Home",
] as const;

/**
 * Read only on the routes that wrap themselves in FullMessagesProvider:
 *   /cart, /checkout, /profile/**, /notifications, /products/[id], /hub, /admin/**, /compliance/sds
 */
export const ROUTE_SCOPED_NAMESPACES = [
  "Cart", //            cart, checkout, profile
  "Checkout", //        checkout, profile
  "Quotes", //          cart, checkout, profile/quotes
  "OrderDetail", //     profile/orders
  "OrderHistory", //    profile/orders
  "AccountProfile", //  profile
  "AccountSettings", // profile/settings, notifications (desktop)
  "ProfileMobile", //   profile
  "FgasProfile", //     profile
  "Profile", //         profile
  "Compliance", //      profile/compliance
  "Analytics", //       hub, profile/compliance
  "ProductDetail", //   products/[id]
  "Pdp", //             products/[id]
  "Hub", //             hub
  "Admin", //           admin
  "AdminInventory", //  admin/inventory
  "AdminRbac", //       admin
  "AdminAnalytics", //  admin/analytics
  "AdminOverview", //   admin
  "AdminShipping", //   admin/orders
  "AdminCountry", //    admin/users, admin/orders
  "SdsAssistant", //    compliance/sds
  "FgasGate", //        cart
  "SecurityCenter", //  profile/**, notifications (settings + security)
] as const;

type Messages = Record<string, unknown>;

const omit = (messages: Messages, names: readonly string[]): Messages => {
  const drop = new Set(names);
  return Object.fromEntries(Object.entries(messages).filter(([namespace]) => !drop.has(namespace)));
};

/** What every page ships: everything except server-only and route-scoped namespaces. */
export const globalClientMessages = (messages: Messages) => omit(messages, [...SERVER_ONLY_NAMESPACES, ...ROUTE_SCOPED_NAMESPACES]);

/** What a route that needs the scoped namespaces ships. */
export const fullClientMessages = (messages: Messages) => omit(messages, SERVER_ONLY_NAMESPACES);
