import type { MobileOptionListItem } from "@/components/MobileOptionListLayout";

export const CURRENCY_OPTIONS: MobileOptionListItem[] = [
  { id: "eur", label: "EUR (€)", sublabel: "Euro" },
  { id: "usd", label: "USD ($)", sublabel: "US Dollar" },
  { id: "gbp", label: "GBP (£)", sublabel: "British Pound" },
  { id: "uah", label: "UAH (₴)", sublabel: "Ukrainian Hryvnia" },
  { id: "pln", label: "PLN (zł)", sublabel: "Polish Złoty" },
];

export const DEFAULT_CURRENCY_ID = "eur";
