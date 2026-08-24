export type TrackingStepState = "done" | "active" | "pending";

export interface TrackingStep {
  label: string;
  time: string;
  state: TrackingStepState;
}

export interface ActiveOrder {
  id: string;
  status: string;
  recipient: string;
  eta: string;
  steps: TrackingStep[];
  item: {
    name: string;
    note: string;
  };
}

// Mobile-only EU order history — independent of the desktop account's
// ACCOUNT_ORDERS (lib/account.ts) and Home's ACTIVE_SHIPMENT (lib/mobileHome.ts),
// same per-page divergence precedent as the rest of the mobile app shell.
export const ACTIVE_ORDER: ActiveOrder = {
  id: "#ORD-8472-EU",
  status: "In Transit",
  recipient: "Пивоваров Максим Романович",
  eta: "Tomorrow, 14:00 – 18:00",
  steps: [
    { label: "Order Placed", time: "Aug 19, 09:24", state: "done" },
    { label: "Processing", time: "Aug 19, 15:40", state: "done" },
    { label: "Out for Delivery", time: "Aug 21, 07:12 · Rotterdam", state: "active" },
    { label: "Delivered", time: "Expected tomorrow", state: "pending" },
  ],
  item: {
    name: "2× R-410A Premium (25 lb)",
    note: "Rotterdam hub · ADR freight · €378.00",
  },
};

export interface PastOrder {
  id: string;
  date: string;
  items: string;
  total: string;
}

export const PAST_ORDERS: PastOrder[] = [
  { id: "#ORD-8341-EU", date: "Aug 15, 2026", items: "4 cylinders", total: "€756.00" },
  { id: "#ORD-8190-EU", date: "Jul 28, 2026", items: "2 cylinders", total: "€412.00" },
  { id: "#ORD-8022-EU", date: "Jul 09, 2026", items: "6 cylinders", total: "€1,284.00" },
  { id: "#ORD-7884-EU", date: "Jun 21, 2026", items: "1 cylinder", total: "€189.00" },
];
