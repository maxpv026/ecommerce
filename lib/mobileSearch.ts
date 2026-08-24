import { MOBILE_CATALOG } from "./mobileCatalog";
import { SDS_DOCS } from "./mobileDocs";
import { ACTIVE_ORDER, PAST_ORDERS } from "./mobileOrders";

export const RECENT_SEARCHES: string[] = ["R-410A", "SDS R-32", "ORD-8341", "ISO Tank"];

export interface SearchResult {
  id: string;
  type: "Cylinders" | "Documents" | "Orders";
  title: string;
  subtitle: string;
  href: string;
}

// Unified client-side search across the mock catalog, SDS library, and
// order history — a lightweight stand-in for a real search index/API.
export function searchAll(rawQuery: string): SearchResult[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const productResults: SearchResult[] = MOBILE_CATALOG.filter((entry) =>
    `${entry.name} ${entry.type}`.toLowerCase().includes(q)
  ).map((entry) => ({
    id: `product-${entry.id}`,
    type: "Cylinders",
    title: entry.name,
    subtitle: `${entry.weight} lb · €${entry.price}`,
    href: `/product/${entry.productId}?weight=${entry.weightId}`,
  }));

  const docResults: SearchResult[] = SDS_DOCS.filter((doc) => doc.name.toLowerCase().includes(q)).map((doc) => ({
    id: `doc-${doc.id}`,
    type: "Documents",
    title: doc.name,
    subtitle: doc.meta,
    href: "/profile/docs?tab=sds",
  }));

  const allOrders = [
    { id: ACTIVE_ORDER.id, items: ACTIVE_ORDER.item.name, date: ACTIVE_ORDER.eta },
    ...PAST_ORDERS.map((o) => ({ id: o.id, items: o.items, date: o.date })),
  ];
  const orderResults: SearchResult[] = allOrders
    .filter((order) => `${order.id} ${order.items}`.toLowerCase().includes(q))
    .map((order) => ({
      id: `order-${order.id}`,
      type: "Orders",
      title: order.id,
      subtitle: `${order.items} · ${order.date}`,
      href: "/profile/orders",
    }));

  return [...productResults, ...docResults, ...orderResults];
}
