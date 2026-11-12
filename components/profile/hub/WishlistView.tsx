"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CatalogRow } from "@/components/catalog/CatalogItem";
import StockNotifyModal from "@/components/StockNotifyModal";
import { ROW_ACTION_GHOST, SURFACE } from "@/components/home/ui";
import type { StoreProduct } from "@/lib/data";
import { EmptyRow, SurfaceHead } from "./parts";

/** Favourites as cart-identical rows (the catalog's table row): stepper and add-to-cart in place. */
export default function WishlistView({ products }: { products: StoreProduct[] }) {
  const t = useTranslations("ProfileHub");
  const [notify, setNotify] = useState<StoreProduct | null>(null);
  return (
    <div className={SURFACE} data-profile-favorites>
      <SurfaceHead title={t("favoritesTitle")} meta={[t("favoritesCount", { count: products.length })]} id="favorites">
        <Link href="/profile/favorites" className={ROW_ACTION_GHOST}>
          {t("favoritesAll")}
          <ArrowRight size={14} strokeWidth={2.4} />
        </Link>
      </SurfaceHead>
      {products.length === 0 ? <EmptyRow>{t("favoritesEmpty")}</EmptyRow> : products.map((p) => <CatalogRow key={p.id} p={p} onNotify={setNotify} />)}
      <StockNotifyModal isOpen={notify !== null} onClose={() => setNotify(null)} productId={notify?.id ?? ""} productName={notify?.name ?? ""} />
    </div>
  );
}
