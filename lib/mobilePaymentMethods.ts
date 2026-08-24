export interface MobilePaymentMethod {
  id: string;
  brand: "Visa" | "Mastercard";
  last4: string;
  expiry: string;
  holder: string;
}

// Mobile-only mock payment methods — independent of any real billing
// backend, same divergence precedent as the rest of the mobile app shell.
export const MOBILE_PAYMENT_METHODS: MobilePaymentMethod[] = [
  { id: "card_1", brand: "Visa", last4: "4242", expiry: "11/26", holder: "Maxim Pivovarov" },
  { id: "card_2", brand: "Mastercard", last4: "8831", expiry: "03/27", holder: "Maxim Pivovarov" },
];

export const DEFAULT_PAYMENT_METHOD_ID = "card_1";
