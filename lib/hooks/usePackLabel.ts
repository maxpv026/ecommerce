"use client";

import { useFormatter, useTranslations } from "next-intl";

/**
 * "13,61 кг · балон" — a pack size in the reader's language.
 *
 * The cart line's stored `variant` is the catalog's English label ("13.61 kg
 * cylinder", lib/productFamily sizeLabel) because it is also what invoices
 * and admin messages quote; on screen the cart, checkout and the payment page
 * build the label from the numbers instead. Equipment (sold per unit) reads
 * as a piece.
 */
export function usePackLabel() {
  const t = useTranslations("Pack");
  const format = useFormatter();
  return (weightKg: number, containerType: string | null | undefined, pricedPerKg: boolean) => {
    if (!pricedPerKg) return t("unit");
    const key = ["Cylinder", "Drum", "Isotank", "Can"].includes(containerType ?? "") ? containerType! : "Cylinder";
    return t("size", { kg: format.number(weightKg, { maximumFractionDigits: 2 }), container: t(`container_${key}`) });
  };
}
