import "server-only";
import { keepUnits } from "@/lib/keepUnits";

import { emailTranslator } from "@/lib/emailTranslator";
import { isPricedPerKg } from "@/lib/pricing";

/**
 * The pack size an email shows — "13,61 кг · балон", "13.61 kg · cylinder",
 * "поштучно" for equipment — from the same Pack messages the site uses
 * (lib/hooks/usePackLabel). Never Product.weight: that column is the
 * catalog's English free text ("13.61 kg cylinder"), whatever the
 * recipient's language.
 */
export interface PackSource {
  weightKg: number;
  containerType?: string | null;
  /** Decides per-kg vs per-unit when `pricedPerKg` isn't given. */
  category?: string | null;
  pricedPerKg?: boolean;
}

const CONTAINERS = ["Cylinder", "Drum", "Isotank", "Can"];

export async function emailPacker(locale: string): Promise<(p: PackSource) => string> {
  const { t } = await emailTranslator(locale, "Pack");
  const kg = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (p) => {
    const perKg = p.pricedPerKg ?? (p.category ? isPricedPerKg(p.category) : true);
    if (!perKg) return t("unit");
    const container = CONTAINERS.includes(p.containerType ?? "") ? p.containerType! : "Cylinder";
    return keepUnits(t("size", { kg: kg.format(p.weightKg), container: t(`container_${container}`) }));
  };
}
